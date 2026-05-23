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

export interface ReleveUpsertResult {
  releve_id: string
  version: number
  previous_id: string | null
  replaced: boolean
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
  return {
    releve_id: typedRow.releve_id,
    version: typedRow.version,
    previous_id: typedRow.previous_id,
    replaced: typedRow.previous_id !== null,
  }
}
