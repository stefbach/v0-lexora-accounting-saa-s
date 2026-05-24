/**
 * Helper — accrual AL mensuel Modèle C (sprint G5).
 *
 * Source de vérité : RPC SQL `get_conges_droits_v2` (migration 175).
 * Ce module expose :
 *   - Un calcul TS pur (réplique de la fonction plpgsql) pour previews.
 *   - Un wrapper async qui délègue à la RPC pour cohérence DB.
 *   - Une estimation de compensation cash-in-lieu basée sur al_acquis.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface AccrualResult {
  al_acquis: number
  al_utilisable: number
  sl_droit: number
  months_in_cycle: number
}

/** Différence de mois entière arrondie « anniversaire » (jour inférieur = -1). */
function diffMonthsAnniversary(a: Date, b: Date): number {
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12
        + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() < a.getUTCDate()) m -= 1
  return m
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(n => parseInt(n, 10))
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

/**
 * Début du cycle anniversaire courant (même règle que la fonction SQL
 * `get_conges_period_start`).
 *
 * Exemple : arrivée 2024-11-04, ref 2026-04-22 -> cycle 2025-11-04.
 */
function cycleStart(dateArrivee: Date, dateRef: Date): Date {
  const anniversaryThisYear = new Date(Date.UTC(
    dateRef.getUTCFullYear(), dateArrivee.getUTCMonth(), dateArrivee.getUTCDate(),
  ))
  if (anniversaryThisYear <= dateRef) return anniversaryThisYear
  return new Date(Date.UTC(
    dateRef.getUTCFullYear() - 1, dateArrivee.getUTCMonth(), dateArrivee.getUTCDate(),
  ))
}

/**
 * Calcule localement (sans DB) l'accrual Modèle C à une date de référence.
 * Retourne des nombres (arrondis 2 décimales pour al_acquis).
 */
export function calculerAccrualMensuel(
  dateArrivee: string,
  dateRef: string = new Date().toISOString().slice(0, 10),
  joursAlParCycle: number = 22,
  joursSlParCycle: number = 15,
): AccrualResult {
  if (!dateArrivee) return { al_acquis: 0, al_utilisable: 0, sl_droit: 0, months_in_cycle: 0 }
  const a = parseYMD(dateArrivee)
  const r = parseYMD(dateRef)
  if (r < a) return { al_acquis: 0, al_utilisable: 0, sl_droit: 0, months_in_cycle: 0 }

  const monthsTotal = Math.max(0, diffMonthsAnniversary(a, r))
  const cycleDebut = cycleStart(a, r)
  const monthsInCycle = Math.max(0, diffMonthsAnniversary(cycleDebut, r))

  const alAcquis = Math.min(
    joursAlParCycle,
    Math.round(((monthsInCycle * joursAlParCycle) / 12) * 100) / 100,
  )

  let slDroit: number
  if (monthsTotal < 6) slDroit = 0
  else if (monthsTotal < 12) slDroit = Math.min(6, monthsTotal - 5)
  else slDroit = joursSlParCycle

  return {
    al_acquis: alAcquis,
    al_utilisable: monthsTotal >= 12 ? alAcquis : 0,
    sl_droit: slDroit,
    months_in_cycle: monthsInCycle,
  }
}

/**
 * Variante async : délègue à la RPC `get_conges_droits_v2` pour garantir
 * cohérence avec le backend (y compris si la règle évolue côté DB).
 * Fallback vers le calcul local si la RPC échoue.
 */
export async function calculerAccrualMensuelDb(
  supabase: SupabaseLike,
  employeId: string,
  dateRef?: string,
): Promise<AccrualResult> {
  const { data: emp } = await supabase
    .from('employes')
    .select('date_arrivee')
    .eq('id', employeId)
    .maybeSingle()
  if (!emp?.date_arrivee) {
    return { al_acquis: 0, al_utilisable: 0, sl_droit: 0, months_in_cycle: 0 }
  }
  const ref = dateRef || new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .rpc('get_conges_droits_v2', {
      p_date_arrivee: emp.date_arrivee,
      p_date_reference: ref,
    })
    .maybeSingle()
  if (error || !data) {
    return calculerAccrualMensuel(emp.date_arrivee, ref)
  }
  const r = data as { al_acquis?: number | string; al_utilisable?: number | string; sl_droit?: number | string; months_in_cycle?: number | string }
  return {
    al_acquis: Number(r.al_acquis) || 0,
    al_utilisable: Number(r.al_utilisable) || 0,
    sl_droit: Number(r.sl_droit) || 0,
    months_in_cycle: Number(r.months_in_cycle) || 0,
  }
}

/**
 * Estime le paiement compensatoire dû à un employé qui part sans avoir
 * consommé tous ses AL acquis (WRA 2019 S.45(2)).
 *
 *   compensation = (al_acquis - al_pris) × (salaire_base / 22)
 *
 * Montant arrondi à 2 décimales ; 0 si solde négatif ou salaire manquant.
 */
export function estimerCompensationCashInLieu(
  alAcquis: number,
  alPris: number,
  salaireBase: number | null | undefined,
): number {
  const solde = Math.max(0, (Number(alAcquis) || 0) - (Number(alPris) || 0))
  const sal = Number(salaireBase) || 0
  if (solde === 0 || sal === 0) return 0
  return Math.round(solde * (sal / 22) * 100) / 100
}
