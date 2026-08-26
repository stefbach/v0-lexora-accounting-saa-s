/**
 * Ingestion des relevés PDF scrapés (« Documents & statements ») dans le
 * pipeline documentaire existant de Lexora.
 *
 * Principe (réutilisation, zéro OCR dupliqué) : un relevé téléchargé est stocké
 * comme un `documents` de type `releve_bancaire`, puis poussé dans la file
 * `enqueueDocumentProcessing`. Le processeur existant (lib/documents/
 * process-document → lib/bank/process-releve) fait l'OCR (Mistral / Claude
 * vision), extrait toutes les lignes et crée l'entrée `releves_bancaires`
 * correspondante — exactement comme un upload manuel.
 *
 * Idempotence : la clé de dédoublonnage est le `storage_path` déterministe
 * (`bank-statements/<societe>/MCB_<compte>_<periode>_<type>.pdf`). Un relevé
 * mensuel n'est stocké et OCRisé qu'une seule fois, même si le run quotidien le
 * re-voit dans la liste.
 *
 * La partie sélection/mapping est pure et testée ; l'I/O Supabase (storage +
 * insert + enqueue) est une fine couche guardée qui n'échoue jamais l'appelant.
 */

import type { ScrapedStatement } from './scraper'
import { statementStorageName } from './agentic/statements-parse'

export const STATEMENT_BUCKET = 'documents'

export interface StatementIngestContext {
  societe_id: string
  compte_bancaire_id: string
  banque: string
  numero_compte: string
  /** Dossier de la société (FK NOT NULL de documents). */
  dossier_id: string
  /** Profil « responsable » utilisé pour uploaded_by (FK NOT NULL). */
  uploaded_by: string
}

export interface PreparedStatement {
  statement: ScrapedStatement
  storage_name: string
  storage_path: string
}

/** Chemin de stockage déterministe d'un relevé (clé d'idempotence). */
export function statementStoragePath(
  s: ScrapedStatement,
  ctx: { societe_id: string; banque: string; numero_compte: string },
): string {
  const name = statementStorageName(s, { banque: ctx.banque, numero_compte: ctx.numero_compte })
  return `bank-statements/${ctx.societe_id}/${name}`
}

/** Prépare chaque relevé (chemin de stockage stable) sans I/O. */
export function prepareStatements(
  statements: ScrapedStatement[],
  ctx: { societe_id: string; banque: string; numero_compte: string },
): PreparedStatement[] {
  return (statements || []).map((statement) => {
    const storage_name = statementStorageName(statement, { banque: ctx.banque, numero_compte: ctx.numero_compte })
    return { statement, storage_name, storage_path: statementStoragePath(statement, ctx) }
  })
}

/**
 * Ne garde que les relevés dont le storage_path n'existe pas déjà (dédoublonnage
 * vs base) et unique dans le lot. Pur, testé.
 */
export function selectStatementsToStore(
  prepared: PreparedStatement[],
  existingPaths: Set<string>,
): PreparedStatement[] {
  const out: PreparedStatement[] = []
  const seen = new Set<string>()
  for (const p of prepared) {
    if (existingPaths.has(p.storage_path) || seen.has(p.storage_path)) continue
    seen.add(p.storage_path)
    out.push(p)
  }
  return out
}

/** Ligne `documents` insérable pour un relevé scrapé (type releve_bancaire). */
export function toDocumentRow(p: PreparedStatement, ctx: StatementIngestContext): Record<string, unknown> {
  return {
    dossier_id: ctx.dossier_id,
    uploaded_by: ctx.uploaded_by,
    nom_fichier: p.storage_name,
    type_fichier: 'pdf',
    type_document: 'releve_bancaire',
    statut: 'en_cours',
    storage_path: p.storage_path,
  }
}

export interface StatementIngestResult {
  ingested: number
  skipped: number
  errors: number
}

/** Client Supabase minimal requis (admin/service-role) pour l'ingestion. */
interface MinimalAdmin {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Uint8Array, opts: { contentType: string; upsert: boolean }): Promise<{ error: unknown }>
    }
  }
  from(table: string): {
    select(cols: string): {
      in(col: string, vals: string[]): Promise<{ data: Array<{ storage_path: string }> | null }>
    }
    insert(row: Record<string, unknown>): {
      select(cols: string): { single(): Promise<{ data: { id: string } | null; error: unknown }> }
    }
  }
}

type EnqueueFn = (documentId: string) => Promise<unknown>

/**
 * Stocke, enregistre et met en file d'OCR les relevés scrapés absents de la
 * base. Idempotent, guardé : une erreur sur un relevé n'interrompt pas les
 * autres et ne remonte jamais à l'appelant sous forme d'exception.
 */
export async function ingestScrapedStatements(
  admin: MinimalAdmin,
  ctx: StatementIngestContext,
  statements: ScrapedStatement[],
  enqueue: EnqueueFn,
): Promise<StatementIngestResult> {
  const result: StatementIngestResult = { ingested: 0, skipped: 0, errors: 0 }
  if (!statements || statements.length === 0) return result

  const prepared = prepareStatements(statements, ctx)
  const paths = prepared.map((p) => p.storage_path)

  const { data: existing } = await admin
    .from('documents')
    .select('storage_path')
    .in('storage_path', paths)
  const existingPaths = new Set<string>((existing || []).map((d) => d.storage_path))

  const toStore = selectStatementsToStore(prepared, existingPaths)
  result.skipped = prepared.length - toStore.length

  for (const p of toStore) {
    try {
      const bytes = Uint8Array.from(Buffer.from(p.statement.pdf_base64, 'base64'))
      // upsert:true : le dédoublonnage réel se fait AU-DESSUS via l'existence
      // d'une ligne `documents` pour ce storage_path (existingPaths). Si on arrive
      // ici, c'est qu'aucun document ne référence ce chemin → on écrit. `upsert:false`
      // faisait échouer l'écriture quand un OBJET orphelin traînait au même chemin
      // (ex. un relevé mal étiqueté supprimé côté `documents` mais pas côté storage)
      // → le mois restait irrécupérable. `upsert:true` auto-répare ce cas.
      const up = await admin.storage
        .from(STATEMENT_BUCKET)
        .upload(p.storage_path, bytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) {
        result.errors++
        continue
      }
      const ins = await admin.from('documents').insert(toDocumentRow(p, ctx)).select('id').single()
      if (ins.error || !ins.data) {
        result.errors++
        continue
      }
      await enqueue(ins.data.id)
      result.ingested++
    } catch {
      result.errors++
    }
  }

  return result
}
