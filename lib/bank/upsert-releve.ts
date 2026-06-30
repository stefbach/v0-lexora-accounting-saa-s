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

    const nd = input.date_debut
    const nf = input.date_fin
    const toAbsorb: string[] = []
    for (const r of (actifs || []) as Array<{ id: string; periode: string; date_debut: string; date_fin: string }>) {
      const od = r.date_debut
      const of = r.date_fin
      const chevauche = od <= nf && of >= nd // les plages se recoupent
      if (!chevauche) continue
      if (od >= nd && of <= nf) {
        // existant entièrement contenu dans le nouveau → absorber
        toAbsorb.push(r.id)
        absorbed.push({ id: r.id, periode: r.periode, date_debut: od, date_fin: of })
      } else if (nd >= od && nf <= of) {
        // nouveau contenu dans un existant plus large → ne pas toucher, signaler
        overlaps.push({ id: r.id, periode: r.periode, date_debut: od, date_fin: of, kind: 'contenu_dans_existant' })
      } else {
        // chevauchement partiel → signaler
        overlaps.push({ id: r.id, periode: r.periode, date_debut: od, date_fin: of, kind: 'partiel' })
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

  return {
    releve_id: newId,
    version: typedRow.version,
    previous_id: typedRow.previous_id,
    replaced: typedRow.previous_id !== null,
    absorbed,
    overlaps,
  }
}
