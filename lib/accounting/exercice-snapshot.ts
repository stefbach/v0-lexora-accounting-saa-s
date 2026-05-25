/**
 * Helper TypeScript pour les snapshots d'exercice immuables.
 *
 * Spec :
 *   - mig 422 : table `exercice_snapshots` + RPC `generate_exercice_snapshot`
 *   - mig 423 : RPC `cloture_exercice_with_snapshot` (wrapper atomique)
 *
 * Pourquoi :
 *   Les comparatifs N-1 (bilan, CR) doivent lire un snapshot figé plutôt
 *   que de recalculer depuis `ecritures_comptables_v2`. Sinon un override
 *   admin (mig 421) modifierait rétroactivement les états du passé.
 *
 * Usage typique :
 *   import { getActiveSnapshot, generateSnapshot, clotureWithSnapshot }
 *     from '@/lib/accounting/exercice-snapshot'
 *
 *   const snap = await getActiveSnapshot(societeId, '2024-2025', 'all')
 *   if (snap) {
 *     const actif = snap.totaux_json.actif_total
 *     // ... utiliser le snapshot pour le N-1
 *   }
 */

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type SnapshotType = 'bilan' | 'compte_resultat' | 'grand_livre' | 'balance' | 'all'

/**
 * Soldes par compte. Pour les snapshots 'all', deux vues :
 *   - periode : flux sur l'exercice (CR/balance/GL)
 *   - cumule  : cumul jusqu'à la date de fin (bilan)
 */
export interface SnapshotSoldes {
  periode?: Record<string, SoldeCompte>
  cumule?: Record<string, SoldeCompte>
  // Pour types autres que 'all', la structure peut être à plat
  [key: string]: unknown
}

export interface SoldeCompte {
  nom: string
  debit: number
  credit: number
  solde: number
}

export interface SnapshotTotaux {
  actif_total: number
  passif_total: number
  capitaux_propres: number
  immobilisations: number
  ca_ht: number
  charges_total: number
  resultat_net: number
  tresorerie_actif: number
  tresorerie_passif: number
}

export interface SnapshotRatios {
  fond_roulement: number
  bfr: number
  tresorerie_nette: number
  marge_nette_pct: number | null
  ratio_endettement: number | null
  equilibre_bilan: boolean
}

export interface ExerciceSnapshot {
  id: string
  societe_id: string
  exercice: string
  snapshot_type: SnapshotType
  generated_at: string
  generated_by: string | null
  soldes_json: SnapshotSoldes
  ratios_json: SnapshotRatios | null
  totaux_json: SnapshotTotaux | null
  cloture_id: string | null
  is_active: boolean
  notes: string | null
}

export interface ClotureWithSnapshotResult {
  societe_id: string
  exercice: string
  resultat_exercice: number
  nb_lignes_cloture: number
  nb_lignes_an: number
  total_actif_an: number
  total_passif_an: number
  equilibre: boolean
  snapshot_id: string
  snapshot_generated_at: string
}

type Client = SupabaseClient | Awaited<ReturnType<typeof createClient>>

async function getClient(supabase?: Client): Promise<Client> {
  if (supabase) return supabase
  return createClient()
}

/**
 * Retourne le snapshot actif (le plus récent, is_active=true) pour
 * (societe, exercice, type). Null si aucun n'existe.
 *
 * Usage UI N-1 : si null → fallback sur calcul live, sinon utiliser
 * le snapshot pour garantir la stabilité historique.
 */
export async function getActiveSnapshot(
  societeId: string,
  exercice: string,
  type: SnapshotType,
  supabase?: Client,
): Promise<ExerciceSnapshot | null> {
  const sb = await getClient(supabase)
  const { data, error } = await sb
    .from('exercice_snapshots')
    .select('*')
    .eq('societe_id', societeId)
    .eq('exercice', exercice)
    .eq('snapshot_type', type)
    .eq('is_active', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`getActiveSnapshot failed: ${error.message}`)
  }
  return (data as ExerciceSnapshot | null) ?? null
}

/**
 * Liste tous les snapshots (actifs + historiques) pour une société,
 * triés du plus récent au plus ancien. Sert à un panneau d'historique
 * dans l'UI clôture (« snapshots successifs de cet exercice »).
 */
export async function listSnapshots(
  societeId: string,
  exercice?: string,
  supabase?: Client,
): Promise<ExerciceSnapshot[]> {
  const sb = await getClient(supabase)
  let q = sb
    .from('exercice_snapshots')
    .select('*')
    .eq('societe_id', societeId)
    .order('generated_at', { ascending: false })

  if (exercice) q = q.eq('exercice', exercice)

  const { data, error } = await q
  if (error) {
    throw new Error(`listSnapshots failed: ${error.message}`)
  }
  return (data as ExerciceSnapshot[]) ?? []
}

/**
 * Génère un nouveau snapshot pour (societe, exercice, type) via la RPC.
 * Désactive les snapshots actifs précédents du même triplet.
 * Retourne l'id du snapshot inséré.
 */
export async function generateSnapshot(
  societeId: string,
  exercice: string,
  type: SnapshotType = 'all',
  options: { clotureId?: string; notes?: string } = {},
  supabase?: Client,
): Promise<{ snapshot_id: string }> {
  const sb = await getClient(supabase)
  const { data, error } = await sb.rpc('generate_exercice_snapshot', {
    p_societe_id: societeId,
    p_exercice: exercice,
    p_type: type,
    p_cloture_id: options.clotureId ?? null,
    p_notes: options.notes ?? null,
  })
  if (error) {
    throw new Error(`generate_exercice_snapshot failed: ${error.message}`)
  }
  return { snapshot_id: data as string }
}

/**
 * Clôture un exercice ET génère le snapshot associé en une seule
 * opération atomique (RPC mig 423).
 *
 * À privilégier dans tout flux UI/API de clôture — garantit l'invariant
 * « pas de clôture sans snapshot ».
 */
export async function clotureWithSnapshot(
  societeId: string,
  exercice: string,
  supabase?: Client,
): Promise<ClotureWithSnapshotResult> {
  const sb = await getClient(supabase)
  const { data, error } = await sb.rpc('cloture_exercice_with_snapshot', {
    p_societe_id: societeId,
    p_exercice: exercice,
  })
  if (error) {
    throw new Error(`cloture_exercice_with_snapshot failed: ${error.message}`)
  }
  if (!data) {
    throw new Error('cloture_exercice_with_snapshot returned empty payload')
  }
  return data as ClotureWithSnapshotResult
}

/**
 * Utilitaire : récupère les totaux N-1 pour comparatif, en privilégiant
 * le snapshot. Si absent (exercice jamais clôturé), retourne null et
 * laisse l'appelant décider du fallback (recalcul live ou affichage vide).
 */
export async function getComparativeTotaux(
  societeId: string,
  exerciceN1: string,
  supabase?: Client,
): Promise<SnapshotTotaux | null> {
  const snap = await getActiveSnapshot(societeId, exerciceN1, 'all', supabase)
  return snap?.totaux_json ?? null
}
