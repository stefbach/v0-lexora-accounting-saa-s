/**
 * lib/jobcosting/couts.ts — Cœur financier du Job Costing (précision arbitraire
 * via lib/money, jamais de flottant natif sur les montants).
 *
 * Réf. spec : docs/roadmap/manufacturing-job-costing.md §2.4 / §2.5.
 *   - coût horaire chargé (dérivé du salaire + charges patronales)
 *   - coût de revient d'un job (temps + dépenses)
 *   - rentabilité : coût réel vs budget vs facturé, marge %
 */

import { money, roundTo, round2, type MoneyInput } from '@/lib/money'
import {
  CHARGES_PATRONALES_PCT_DEFAUT,
  HEURES_MENSUELLES_DEFAUT,
} from './types'

/** Décimales du coût horaire chargé (NUMERIC(10,4)). */
export const COUT_HORAIRE_DP = 4

export interface CoutHoraireInput {
  /** Salaire de base mensuel. */
  salaire_base: MoneyInput
  /** Primes fixes récurrentes (allowances mensualisées, etc.). */
  primes_fixes?: MoneyInput | null
  /** Taux de charges patronales (ex. 0.13). Défaut : convention IAS 19. */
  charges_patronales_pct?: MoneyInput | null
  /** Heures contractuelles mensuelles. Défaut : 195. */
  heures_mensuelles?: MoneyInput | null
}

/**
 * Coût horaire chargé (§2.5) :
 *   (salaire_base + primes_fixes) × (1 + charges_patronales_pct) / heures_mensuelles
 *
 * Le taux de charges patronales réutilise la convention existante
 * (societes.ias19_charges_patronales_pct, défaut 0.13) plutôt qu'un second
 * moteur de calcul — cf. risque §2.8 (double moteur de charges).
 */
export function coutHoraireCharge(input: CoutHoraireInput): number {
  const base = money(input.salaire_base).plus(money(input.primes_fixes ?? 0))
  const pct =
    input.charges_patronales_pct == null
      ? money(CHARGES_PATRONALES_PCT_DEFAUT)
      : money(input.charges_patronales_pct)
  const heures =
    input.heures_mensuelles == null || money(input.heures_mensuelles).lte(0)
      ? money(HEURES_MENSUELLES_DEFAUT)
      : money(input.heures_mensuelles)

  if (base.lt(0) || pct.lt(0)) {
    throw new Error('COUT_HORAIRE_INVALIDE: salaire et charges patronales doivent être positifs')
  }
  const coutMensuelCharge = base.times(money(1).plus(pct))
  return roundTo(coutMensuelCharge.dividedBy(heures), COUT_HORAIRE_DP)
}

/** Coût interne d'une ligne de temps : heures × coût horaire chargé. */
export function coutTemps(heures: MoneyInput, coutHoraire: MoneyInput): number {
  return round2(money(heures).times(money(coutHoraire)))
}

/**
 * Montant refacturable d'une dépense : 0 si non facturable, sinon
 * montant_ht × (1 + marge_refacturation_pct / 100).
 */
export function montantRefacturableDepense(
  montantHt: MoneyInput,
  margePct: MoneyInput | null | undefined,
  facturable: boolean,
): number {
  if (!facturable) return 0
  const facteur = money(1).plus(money(margePct ?? 0).dividedBy(100))
  return round2(money(montantHt).times(facteur))
}

/** Montant facturable d'une ligne de temps : heures × taux si facturable. */
export function montantFacturableTemps(
  heures: MoneyInput,
  tauxFacture: MoneyInput | null | undefined,
  facturable: boolean,
): number {
  if (!facturable || tauxFacture == null) return 0
  return round2(money(heures).times(money(tauxFacture)))
}

export interface CoutRevientInput {
  cout_temps_reel: MoneyInput
  cout_depenses_reel: MoneyInput
}

/** Coût de revient total d'un job = main d'œuvre + dépenses (dont matières). */
export function coutRevientJob(input: CoutRevientInput): number {
  return round2(money(input.cout_temps_reel).plus(money(input.cout_depenses_reel)))
}

export interface RentabiliteInput {
  cout_temps_reel: MoneyInput
  cout_depenses_reel: MoneyInput
  montant_facturable: MoneyInput
  /** Montant réellement facturé (gelé), si le job est facturé. */
  montant_facture?: MoneyInput | null
  budget_montant?: MoneyInput | null
  budget_heures?: MoneyInput | null
  /** Heures imputées cumulées (pour le taux d'avancement). */
  heures_imputees?: MoneyInput | null
}

export interface Rentabilite {
  cout_revient: number
  /** Base de comparaison de la marge : facturé si présent, sinon facturable. */
  produit: number
  marge: number
  /** Marge en % du produit (null si produit nul). */
  marge_pct: number | null
  /** Écart au budget montant (produit − budget), null si pas de budget. */
  ecart_budget: number | null
  /** Taux d'avancement des heures vs budget (%), null si pas de budget. */
  avancement_heures_pct: number | null
  depassement_budget: boolean
}

/**
 * Rentabilité d'un job : marge = produit − coût de revient.
 * Le « produit » est le montant facturé s'il est gelé (job facturé), sinon le
 * montant facturable estimé — cohérent avec « rentabilité vs facturation » (§2.3).
 */
export function rentabiliteJob(input: RentabiliteInput): Rentabilite {
  const coutRevient = coutRevientJob(input)
  const produit =
    input.montant_facture != null
      ? round2(input.montant_facture)
      : round2(input.montant_facturable)

  const marge = round2(money(produit).minus(money(coutRevient)))
  const margePct = produit > 0 ? roundTo(money(marge).dividedBy(money(produit)).times(100), 2) : null

  let ecartBudget: number | null = null
  if (input.budget_montant != null && money(input.budget_montant).gt(0)) {
    ecartBudget = round2(money(produit).minus(money(input.budget_montant)))
  }

  let avancementHeuresPct: number | null = null
  if (input.budget_heures != null && money(input.budget_heures).gt(0) && input.heures_imputees != null) {
    avancementHeuresPct = roundTo(
      money(input.heures_imputees).dividedBy(money(input.budget_heures)).times(100),
      2,
    )
  }

  const depassementBudget =
    input.budget_montant != null && money(input.budget_montant).gt(0)
      ? money(coutRevient).gt(money(input.budget_montant))
      : false

  return {
    cout_revient: coutRevient,
    produit,
    marge,
    marge_pct: margePct,
    ecart_budget: ecartBudget,
    avancement_heures_pct: avancementHeuresPct,
    depassement_budget: depassementBudget,
  }
}

/**
 * Taux d'utilisation d'un employé sur une période :
 * heures facturables imputées / heures pointées (%). Null si aucune heure pointée.
 */
export function tauxUtilisation(
  heuresFacturables: MoneyInput,
  heuresPointees: MoneyInput,
): number | null {
  if (money(heuresPointees).lte(0)) return null
  return roundTo(money(heuresFacturables).dividedBy(money(heuresPointees)).times(100), 2)
}
