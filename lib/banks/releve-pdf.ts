/**
 * generateAndAttachRelevePdf — produit un PDF de relevé *lisible* à partir des
 * transactions scrapées et l'attache au relevé `releves_bancaires` créé par
 * `ingestScrapedTransactions`.
 *
 * Contexte : MCB sert ses relevés officiels sous forme de formulaires XFA
 * (Adobe LiveCycle) que le navigateur headless télécharge « à blanc » (pages
 * vides, illisibles par tout OCR). On génère donc un relevé propre côté Lexora
 * à partir du contenu réellement récupéré (solde + transactions), pour que
 * l'utilisateur dispose enfin d'un document consultable et téléchargeable.
 *
 * Le PDF généré est écrit dans le bucket `documents`, sur un chemin
 * DÉTERMINISTE marqué `_Lexora` (jamais en collision avec le vrai PDF MCB), et
 * un enregistrement `documents` (type_document = 'releve_bancaire', statut
 * 'traite' → pas de re-passage OCR) est lié via `releves_bancaires.document_id`.
 * Idempotent : un re-scrape de la même période remplace le fichier et réutilise
 * la ligne `documents` (dédup par storage_path).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'documents'

export interface RelevePdfTx {
  date: string
  libelle: string
  debit: number
  credit: number
  reference?: string | null
}

export interface GenerateRelevePdfInput {
  releve_id: string
  compte_bancaire_id: string
  societe_id: string
  periode: string
  date_debut: string
  date_fin: string
  solde_ouverture: number
  solde_cloture: number
  total_debits: number
  total_credits: number
  transactions: RelevePdfTx[]
  /** ISO — rendu déterministe (tests). */
  generated_at?: string
}

export interface GenerateRelevePdfResult {
  attached: boolean
  reason?: string
  document_id?: string
  storage_path?: string
}

/** Nom de fichier déterministe, distinct du vrai PDF MCB (suffixe _Lexora). */
export function generatedReleveStoragePath(
  societe_id: string,
  numero_compte: string,
  date_debut: string,
  date_fin: string,
): string {
  const safe = (s: string) => (s || '').replace(/[^A-Za-z0-9_-]+/g, '-')
  const name = `Releve_Lexora_${safe(numero_compte)}_${safe(date_debut)}_${safe(date_fin)}.pdf`
  return `bank-statements/${societe_id}/${name}`
}

export async function generateAndAttachRelevePdf(
  supabase: SupabaseClient,
  input: GenerateRelevePdfInput,
): Promise<GenerateRelevePdfResult> {
  if (!input.releve_id) return { attached: false, reason: 'no_releve_id' }
  if (!Array.isArray(input.transactions) || input.transactions.length === 0) {
    return { attached: false, reason: 'no_transactions' }
  }

  // Résout société → dossier (dossier_id + responsable pour uploaded_by NOT NULL).
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('id, comptable_id, client_id')
    .eq('societe_id', input.societe_id)
    .limit(1)
    .maybeSingle()
  const uploadedBy = dossier?.comptable_id || dossier?.client_id || null
  if (!dossier?.id || !uploadedBy) return { attached: false, reason: 'no_dossier_or_owner' }

  // Métadonnées compte + société pour l'en-tête du PDF.
  const { data: compte } = await supabase
    .from('comptes_bancaires')
    .select('numero_compte, devise, banque')
    .eq('id', input.compte_bancaire_id)
    .maybeSingle()
  const { data: societe } = await supabase
    .from('societes')
    .select('nom, brn')
    .eq('id', input.societe_id)
    .maybeSingle()

  const numeroCompte = compte?.numero_compte || input.compte_bancaire_id

  // Rendu du PDF (import dynamique : garde react-pdf hors du graphe des modules
  // qui n'en ont pas besoin — même stratégie que l'OCR Mistral).
  const [{ renderToBuffer }, { ReleveScrapePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/pdf/ReleveScrapePDF'),
  ])

  const element = ReleveScrapePDF({
    societe: societe ? { nom: societe.nom, brn: societe.brn } : null,
    compte: { numero_compte: numeroCompte, devise: compte?.devise || 'MUR', banque: compte?.banque || 'MCB' },
    periode: input.periode,
    date_debut: input.date_debut,
    date_fin: input.date_fin,
    solde_ouverture: input.solde_ouverture,
    solde_cloture: input.solde_cloture,
    total_debits: input.total_debits,
    total_credits: input.total_credits,
    transactions: input.transactions,
    generated_at: input.generated_at,
  })
  const buffer = await renderToBuffer(element as never)
  const bytes = new Uint8Array(buffer)

  const storagePath = generatedReleveStoragePath(
    input.societe_id,
    numeroCompte,
    input.date_debut,
    input.date_fin,
  )
  const nomFichier = storagePath.split('/').pop() || 'Releve_Lexora.pdf'

  // Upload (upsert : un re-scrape de la même période remplace proprement).
  const up = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
  if (up.error) return { attached: false, reason: `upload_failed: ${up.error.message}` }

  // Ligne `documents` : réutilise celle du même chemin si elle existe (idempotent).
  let documentId: string | undefined
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('id')
    .eq('storage_path', storagePath)
    .limit(1)
    .maybeSingle()

  if (existingDoc?.id) {
    documentId = existingDoc.id
    await supabase
      .from('documents')
      .update({ taille_fichier: bytes.byteLength, updated_at: new Date().toISOString() })
      .eq('id', documentId)
  } else {
    const ins = await supabase
      .from('documents')
      .insert({
        dossier_id: dossier.id,
        uploaded_by: uploadedBy,
        nom_fichier: nomFichier,
        type_fichier: 'pdf',
        type_document: 'releve_bancaire',
        statut: 'traite', // déjà structuré : ne pas repasser par la file OCR.
        storage_path: storagePath,
        taille_fichier: bytes.byteLength,
        client_visible: true,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) return { attached: false, reason: `doc_insert_failed: ${ins.error?.message}` }
    documentId = ins.data.id
  }

  // Lie le PDF au relevé (update direct : évite l'effet de bord d'absorption de
  // la RPC replace_releve_bancaire).
  const upd = await supabase
    .from('releves_bancaires')
    .update({ document_id: documentId })
    .eq('id', input.releve_id)
  if (upd.error) return { attached: false, reason: `releve_update_failed: ${upd.error.message}` }

  return { attached: true, document_id: documentId, storage_path: storagePath }
}
