/**
 * Reclassement d'écritures d'un compte vers un autre.
 *
 * Toujours dry-run d'abord (preview du diff) puis exécution. Préserve
 * l'historique : on UPDATE numero_compte/nom_compte, on ne supprime rien.
 * Le trigger DB de clôture (mig 421) bloque les écritures d'exercices clos.
 */

import { PCMError } from './errors'

interface SupabaseLike { from: (t: string) => any }

export interface ReclassFilter {
  date_debut?: string
  date_fin?: string
  libelle_contains?: string
  journal?: string
}

export interface ReclassParams {
  societeId: string
  fromCompte: string
  toCompte: string
  filter?: ReclassFilter
  dryRun: boolean
}

export interface ReclassResult {
  dry_run: boolean
  from_compte: string
  to_compte: string
  nb_ecritures: number
  total_debit: number
  total_credit: number
  sample: Array<{ id: string; date_ecriture: string; libelle: string; debit_mur: number; credit_mur: number }>
  executed: number
}

const SELECT_COLS = 'id, date_ecriture, libelle, debit_mur, credit_mur, journal'

/**
 * Construit la query filtrée. Réutilisée pour le count, le sample et l'update.
 */
function applyFilter(q: any, fromCompte: string, filter?: ReclassFilter) {
  q = q.eq('numero_compte', fromCompte)
  if (filter?.date_debut) q = q.gte('date_ecriture', filter.date_debut)
  if (filter?.date_fin) q = q.lte('date_ecriture', filter.date_fin)
  if (filter?.journal) q = q.eq('journal', filter.journal)
  if (filter?.libelle_contains) q = q.ilike('libelle', `%${filter.libelle_contains}%`)
  return q
}

export async function reclassEcritures(
  supabase: SupabaseLike,
  params: ReclassParams,
): Promise<ReclassResult> {
  const { societeId, fromCompte, toCompte, filter, dryRun } = params

  if (fromCompte === toCompte) {
    throw new PCMError('PCM_010', 'Le compte source et le compte cible sont identiques')
  }

  // Le compte cible doit exister et être actif
  const { data: target } = await supabase
    .from('comptes_societes').select('numero, intitule, archive')
    .eq('societe_id', societeId).eq('numero', toCompte).maybeSingle()
  if (!target) throw new PCMError('PCM_010', `Compte cible ${toCompte} introuvable`)
  if (target.archive) throw new PCMError('PCM_010', `Compte cible ${toCompte} est archivé`)

  // Sélection des écritures concernées (sample + totaux)
  let sampleQ = supabase.from('ecritures_comptables_v2').select(SELECT_COLS, { count: 'exact' }).eq('societe_id', societeId)
  sampleQ = applyFilter(sampleQ, fromCompte, filter)
  sampleQ = sampleQ.order('date_ecriture', { ascending: false }).range(0, 19)
  const { data: sample, count } = await sampleQ

  // Totaux (agrégation manuelle sur l'ensemble, paginé)
  let totalDebit = 0, totalCredit = 0
  let from = 0
  while (true) {
    let aggQ = supabase.from('ecritures_comptables_v2').select('debit_mur, credit_mur').eq('societe_id', societeId)
    aggQ = applyFilter(aggQ, fromCompte, filter).range(from, from + 999)
    const { data } = await aggQ
    if (!data || data.length === 0) break
    for (const e of data) { totalDebit += +e.debit_mur || 0; totalCredit += +e.credit_mur || 0 }
    if (data.length < 1000) break
    from += 1000
  }

  const result: ReclassResult = {
    dry_run: dryRun,
    from_compte: fromCompte,
    to_compte: toCompte,
    nb_ecritures: count ?? 0,
    total_debit: Math.round(totalDebit * 100) / 100,
    total_credit: Math.round(totalCredit * 100) / 100,
    sample: (sample || []).map((e: any) => ({
      id: e.id, date_ecriture: e.date_ecriture, libelle: e.libelle,
      debit_mur: +e.debit_mur || 0, credit_mur: +e.credit_mur || 0,
    })),
    executed: 0,
  }

  if (dryRun) return result

  // Exécution : UPDATE numero_compte + nom_compte
  let updateQ = supabase.from('ecritures_comptables_v2')
    .update({ numero_compte: target.numero, nom_compte: target.intitule }, { count: 'exact' })
    .eq('societe_id', societeId)
  updateQ = applyFilter(updateQ, fromCompte, filter)
  const { error, count: updatedCount } = await updateQ
  if (error) throw new PCMError('PCM_010', `Reclassement échoué: ${error.message}`)

  result.executed = updatedCount ?? 0
  return result
}
