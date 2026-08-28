/**
 * upsertReleveBancaire — helper unique pour insérer / remplacer un relevé
 * bancaire avec versioning (mig 410).
 *
 * Utilisé par tous les chemins d'import :
 *   - app/api/documents/upload/route.ts  (upload Web)
 *   - lib/bank/process-releve.ts         (pipeline Telegram / n8n)
 *
 * Comportement :
 *   - Pas de version existante pour (compte, période) → INSERT version=1
 *   - Version existante → INSERT version=N+1 + UPDATE old.superseded_by_id
 *     + DELETE transactions_bancaires de l'ancienne version
 *
 * L'atomicité + concurrence safe est assurée par la RPC SQL
 * `replace_releve_bancaire` (advisory lock + FOR UPDATE).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createEcritureSoldeOuvertureBancaire } from '@/lib/accounting/bank-opening-balance'

export type UploadSource = 'web' | 'telegram' | 'api' | 'cron' | 'manual'

export interface ReleveUpsertInput {
  compte_bancaire_id: string
  societe_id: string
  periode: string
  date_debut: string
  date_fin: string
  solde_ouverture: number
  solde_cloture: number
  total_debits: number
  total_credits: number
  nb_transactions: number
  ecart_solde: number
  document_id: string | null
  transactions_json: unknown
  statut_rapprochement: string
}

export interface AbsorbedReleve {
  id: string
  periode: string
  date_debut: string
  date_fin: string
}

export interface OverlapWarning {
  id: string
  periode: string
  date_debut: string
  date_fin: string
  kind: 'partiel' | 'contenu_dans_existant'
}

/**
 * Classe le recouvrement entre une nouvelle plage de relevé et une plage
 * existante, à la granularité MOIS (les relevés bancaires sont alignés sur les
 * mois : un relevé mensuel « janvier » = 01→31, un relevé semestriel peut
 * commencer au 05 car c'est la 1re opération, mais il couvre bien tout janvier).
 *
 *  - 'absorb' : l'existant est couvert (au mois près) par le nouveau → à
 *    superséder (le nouveau, plus large, devient la source unique).
 *  - 'contenu_dans_existant' : le nouveau est couvert par un existant plus large.
 *  - 'partiel' : recoupement partiel (mois débordants de part et d'autre).
 *  - 'none' : pas de recoupement.
 *
 * Fonction pure → testable. `date_*` au format YYYY-MM-DD.
 */
export function classifyReleveOverlap(
  neu: { date_debut: string; date_fin: string },
  existing: { date_debut: string; date_fin: string },
): 'absorb' | 'contenu_dans_existant' | 'partiel' | 'none' {
  const m = (d: string) => (d || '').slice(0, 7) // YYYY-MM
  const nd = m(neu.date_debut), nf = m(neu.date_fin)
  const od = m(existing.date_debut), of = m(existing.date_fin)
  if (!nd || !nf || !od || !of) return 'none'
  // Recoupement au mois près.
  if (!(od <= nf && of >= nd)) return 'none'
  // Existant entièrement couvert (au mois près) par le nouveau → absorber.
  if (od >= nd && of <= nf) return 'absorb'
  // Nouveau entièrement couvert par un existant plus large → ne pas toucher.
  if (nd >= od && nf <= of) return 'contenu_dans_existant'
  return 'partiel'
}

export interface ReleveUpsertResult {
  releve_id: string
  version: number
  previous_id: string | null
  replaced: boolean
  /** Relevés actifs entièrement couverts par le nouveau → supersédés (absorbés). */
  absorbed: AbsorbedReleve[]
  /** Chevauchements non résolus automatiquement (partiel, ou nouveau contenu dans un relevé plus large) — à vérifier. */
  overlaps: OverlapWarning[]
}

export async function upsertReleveBancaire(
  supabase: SupabaseClient,
  input: ReleveUpsertInput,
  ctx: { uploaded_by?: string | null; source: UploadSource },
): Promise<ReleveUpsertResult> {
  const { data, error } = await supabase.rpc('replace_releve_bancaire', {
    p_compte_bancaire_id:    input.compte_bancaire_id,
    p_societe_id:            input.societe_id,
    p_periode:               input.periode,
    p_date_debut:            input.date_debut,
    p_date_fin:              input.date_fin,
    p_solde_ouverture:       input.solde_ouverture,
    p_solde_cloture:         input.solde_cloture,
    p_total_debits:          input.total_debits,
    p_total_credits:         input.total_credits,
    p_nb_transactions:       input.nb_transactions,
    p_ecart_solde:           input.ecart_solde,
    p_document_id:           input.document_id,
    p_transactions_json:     input.transactions_json,
    p_statut_rapprochement:  input.statut_rapprochement,
    p_uploaded_by:           ctx.uploaded_by ?? null,
    p_upload_source:         ctx.source,
  })

  if (error) {
    throw new Error(`upsertReleveBancaire RPC failed: ${error.message}`)
  }

  // RPC RETURNS TABLE → tableau de 1 row côté JS
  const row = Array.isArray(data) ? data[0] : (data as Record<string, unknown> | null)
  if (!row || typeof (row as { releve_id?: string }).releve_id !== 'string') {
    throw new Error('upsertReleveBancaire: RPC returned empty result')
  }

  const typedRow = row as { releve_id: string; version: number; previous_id: string | null }
  const newId = typedRow.releve_id

  // ──────────────────────────────────────────────────────────────────────
  // Garde-fou anti-chevauchement (juin 2026).
  // La RPC ne remplace que le relevé de plage EXACTEMENT identique. Importer
  // un relevé multi-mois (ex: 6 mois) alors que des mois sont déjà enregistrés
  // séparément créerait des DOUBLONS : le rapprochement lit transactions_json
  // de TOUS les relevés actifs (superseded_by_id IS NULL).
  //
  // Stratégie :
  //  - Un relevé actif du même compte ENTIÈREMENT CONTENU dans la nouvelle
  //    plage → absorbé (supersédé). Le nouveau relevé (plus large) devient la
  //    source unique de la plage → plus de doublons, soldes intacts.
  //  - Chevauchement partiel, ou nouveau relevé CONTENU dans un relevé existant
  //    plus large → on n'absorbe pas (perte de données possible) : on signale.
  // ──────────────────────────────────────────────────────────────────────
  const absorbed: AbsorbedReleve[] = []
  const overlaps: OverlapWarning[] = []
  try {
    const { data: actifs } = await supabase
      .from('releves_bancaires')
      .select('id, periode, date_debut, date_fin')
      .eq('compte_bancaire_id', input.compte_bancaire_id)
      .is('superseded_by_id', null)
      .neq('id', newId)
      .not('date_debut', 'is', null)
      .not('date_fin', 'is', null)

    const toAbsorb: string[] = []
    for (const r of (actifs || []) as Array<{ id: string; periode: string; date_debut: string; date_fin: string }>) {
      // Décision au mois près : un relevé mensuel (01→31) est bien absorbé par un
      // relevé semestriel qui démarre le 05 (1re opération) mais couvre le mois.
      const verdict = classifyReleveOverlap(input, { date_debut: r.date_debut, date_fin: r.date_fin })
      if (verdict === 'absorb') {
        toAbsorb.push(r.id)
        absorbed.push({ id: r.id, periode: r.periode, date_debut: r.date_debut, date_fin: r.date_fin })
      } else if (verdict === 'contenu_dans_existant') {
        overlaps.push({ id: r.id, periode: r.periode, date_debut: r.date_debut, date_fin: r.date_fin, kind: 'contenu_dans_existant' })
      } else if (verdict === 'partiel') {
        overlaps.push({ id: r.id, periode: r.periode, date_debut: r.date_debut, date_fin: r.date_fin, kind: 'partiel' })
      }
    }

    if (toAbsorb.length > 0) {
      await supabase
        .from('releves_bancaires')
        .update({ superseded_by_id: newId, superseded_at: new Date().toISOString() })
        .in('id', toAbsorb)
      // Nettoie la matérialisation secondaire des relevés absorbés.
      await supabase.from('transactions_bancaires').delete().in('releve_id', toAbsorb)
    }
  } catch {
    // Best-effort : un échec du garde-fou ne doit pas faire échouer l'import.
  }

  // ──────────────────────────────────────────────────────────────────────
  // À-nouveau du SOLDE D'OUVERTURE bancaire (bug remonté par un comptable).
  // Le solde d'ouverture était stocké sur le relevé mais ne générait aucune
  // écriture → le compte de banque du grand-livre n'affichait que les
  // mouvements, jamais le solde de départ. On enregistre le solde d'ouverture
  // du relevé LE PLUS ANCIEN du compte comme un à-nouveau (D 512 / C 1101),
  // idempotent et avec garde-fou anti double-comptage (onboarding).
  //
  // Limite connue (v1) : si un relevé antérieur est importé APRÈS coup, l'à-
  // nouveau n'est pas recalculé (il faut supprimer l'écriture ANBQ-<compte>
  // ou passer par l'onboarding). Import chronologique = cas nominal.
  try {
    const { data: earliest } = await supabase
      .from('releves_bancaires')
      .select('solde_ouverture, date_debut')
      .eq('compte_bancaire_id', input.compte_bancaire_id)
      .is('superseded_by_id', null)
      .not('date_debut', 'is', null)
      .order('date_debut', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (earliest && earliest.date_debut) {
      const { data: compte } = await supabase
        .from('comptes_bancaires')
        .select('compte_comptable, nom_compte, banque')
        .eq('id', input.compte_bancaire_id)
        .maybeSingle()

      await createEcritureSoldeOuvertureBancaire(supabase, {
        societe_id: input.societe_id,
        compte_bancaire_id: input.compte_bancaire_id,
        compte_comptable: compte?.compte_comptable ?? null,
        nom_banque: compte?.nom_compte || compte?.banque || null,
        solde_ouverture: Number(earliest.solde_ouverture) || 0,
        date_ouverture: earliest.date_debut,
      })
    }
  } catch {
    // Best-effort : l'à-nouveau ne doit pas faire échouer l'import du relevé.
  }

  return {
    releve_id: newId,
    version: typedRow.version,
    previous_id: typedRow.previous_id,
    replaced: typedRow.previous_id !== null,
    absorbed,
    overlaps,
  }
}
