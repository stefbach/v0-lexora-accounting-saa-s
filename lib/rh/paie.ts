/**
 * Moteur de calcul de paie MRA Maurice — LEXORA
 * Finance Act 2025-2026 + Workers' Rights Act 2019
 * Conforme table bulletins_paie (avec refacturation inter-societes)
 *
 * Rates applied:
 * - CSG Employee: 1.5% (salary <= 50,000 MUR), 3% (salary > 50,000 MUR)
 * - CSG Employer: 3% if basic ≤ 50K, 6% if > 50K (progressive like employee CSG)
 * - NSF Employee: 1.5% (standard)
 * - NSF Employer: 2.5%
 * - Training Levy (HRDC): 1% of basic salary
 * - PRGF: higher of 4.5% of total emoluments OR Rs 4.50 per day worked
 * - PAYE: 0% up to 390,000/yr, 10% on next 260,000, 15% on remainder
 * - Salary Compensation 2026: Rs 635 for employees earning <= 50,000 MUR
 */
import type { ParametresPaieMRA } from '@/lib/types'

export const PARAMS_MRA_DEFAUT: ParametresPaieMRA = {
  csg_seuil_taux_reduit: 50000,
  csg_salarie_taux_reduit: 0.015,   // 1.5% si brut <= 50 000 MUR
  csg_salarie_taux_plein: 0.030,    // 3% si brut > 50 000 MUR
  csg_patronal: 0.060,              // 6% employeur (si brut > 50K)
  csg_patronal_taux_reduit: 0.030,  // 3% employeur (si brut <= 50K)
  nsf_salarie: 0.015,               // 1.5% NSF salarie
  nsf_patronal: 0.025,              // 2.5% NSF employeur
  training_levy: 0.010,             // 1% HRDC sur salaire de base
  prgf_patronal_par_jour: 4.50,     // PRGF par jour travaille
  prgf_taux_emoluments: 0.045,      // 4.5% des emoluments totaux
  paye_seuil_exoneration: 390000,   // 0% jusqu'a 390K MUR/an
  paye_taux_1: 0.10,                // 10% tranche 1
  paye_seuil_taux_2: 650000,        // Seuil tranche 2 (390K + 260K)
  paye_taux_2: 0.15,                // 15% tranche 2+
  salary_compensation: 635,          // Rs 635 Salary Compensation 2026
  salary_compensation_seuil: 50000,  // Applicable si salaire <= 50,000
}

export interface ElementsBrut {
  salaire_base: number
  increment_salaire?: number
  heures_sup_montant?: number
  transport_allowance?: number
  petrol_allowance?: number
  special_allowance_1?: number
  special_allowance_2?: number
  special_allowance_3?: number
  other_refund?: number
  eoy_bonus?: number           // 13eme mois
  departure_notice?: number    // Preavis
  salary_compensation?: number // Salary Compensation (auto-calculated if not provided)
  commission?: number          // Commission
}

export interface ResultatPaie {
  salaire_brut: number
  // Deductions salarie
  csg_taux: number
  csg_salarie: number
  csg_bonus: number
  nsf_salarie: number
  paye: number
  total_deductions: number
  salaire_net: number
  // Charges patronales
  csg_patronal: number
  csg_patronal_bonus: number
  nsf_patronal: number
  training_levy: number
  prgf: number
  prgf_pct_emoluments: number
  prgf_par_jour: number
  total_charges_patronales: number
  cout_total_employeur: number
  // Refacturation
  montant_refacture_mur: number
  // Emoluments detail
  total_emoluments: number
  salary_compensation_montant: number
}

export function calculerBulletin(
  elements: ElementsBrut,
  params: ParametresPaieMRA = PARAMS_MRA_DEFAUT,
  joursTravailles: number = 26,
  pctRefacturation: number = 0,
  airboxMur: number = 924.48,
  ordinateurMur: number = 818.22
): ResultatPaie {
  const {
    salaire_base,
    increment_salaire = 0,
    heures_sup_montant = 0,
    transport_allowance = 0,
    petrol_allowance = 0,
    special_allowance_1 = 0,
    special_allowance_2 = 0,
    special_allowance_3 = 0,
    other_refund = 0,
    eoy_bonus = 0,
    departure_notice = 0,
    commission = 0,
  } = elements

  // Salary Compensation 2026: Rs 635 for employees earning <= 50,000
  const salary_compensation_montant = elements.salary_compensation !== undefined
    ? elements.salary_compensation
    : (salaire_base <= params.salary_compensation_seuil ? params.salary_compensation : 0)

  const salaire_brut_base = salaire_base + salary_compensation_montant + increment_salaire +
    heures_sup_montant +
    transport_allowance + petrol_allowance +
    special_allowance_1 + special_allowance_2 + special_allowance_3 +
    other_refund + departure_notice + commission

  const salaire_brut = salaire_brut_base + eoy_bonus

  // Total emoluments for PRGF calculation (basic + allowances + compensation, excl OT & EOY)
  const total_emoluments = salaire_base + salary_compensation_montant + increment_salaire +
    transport_allowance + petrol_allowance +
    special_allowance_1 + special_allowance_2 + special_allowance_3 +
    commission

  // CSG sur salaire (hors EOY bonus -- traite separement)
  const csgTaux = salaire_brut_base <= params.csg_seuil_taux_reduit
    ? params.csg_salarie_taux_reduit
    : params.csg_salarie_taux_plein

  const csg_salarie = Math.round(salaire_brut_base * csgTaux)
  const csg_bonus = eoy_bonus > 0 ? Math.round(eoy_bonus * params.csg_salarie_taux_plein) : 0
  const nsf_salarie = Math.round(salaire_brut * params.nsf_salarie)

  // PAYE -- bareme progressif annuel MRA 2025/26
  // EOY Bonus (13th month) is EXEMPT from PAYE in Mauritius (but subject to CSG)
  const salaireAnnuel = salaire_brut_base * 12 // eoy_bonus excluded from PAYE base
  let payeAnnuel = 0
  if (salaireAnnuel > params.paye_seuil_exoneration) {
    const tranche1 = Math.min(salaireAnnuel, params.paye_seuil_taux_2) - params.paye_seuil_exoneration
    payeAnnuel += tranche1 * params.paye_taux_1
    if (salaireAnnuel > params.paye_seuil_taux_2) {
      payeAnnuel += (salaireAnnuel - params.paye_seuil_taux_2) * params.paye_taux_2
    }
  }
  const paye = Math.round(payeAnnuel / 12)

  const total_deductions = csg_salarie + csg_bonus + nsf_salarie + paye
  const salaire_net = salaire_brut - total_deductions

  // Charges patronales
  // CSG patronale progressive: 3% si brut <= 50K, 6% si > 50K (même seuil que CSG salarié)
  const csgPatronalTaux = salaire_brut_base <= params.csg_seuil_taux_reduit
    ? (params.csg_patronal_taux_reduit || 0.030)
    : params.csg_patronal
  const csg_patronal = Math.round(salaire_brut_base * csgPatronalTaux)
  const csg_patronal_bonus = eoy_bonus > 0 ? Math.round(eoy_bonus * params.csg_patronal) : 0
  const nsf_patronal = Math.round(salaire_brut * params.nsf_patronal)

  // Training Levy (HRDC): 1% of basic salary only (not total emoluments)
  const training_levy = Math.round(salaire_base * params.training_levy)

  // PRGF: higher of 4.5% of total emoluments OR Rs 4.50 per day worked
  const prgf_pct_emoluments = Math.round(total_emoluments * params.prgf_taux_emoluments)
  const prgf_par_jour = Math.round(params.prgf_patronal_par_jour * joursTravailles)
  const prgf = Math.max(prgf_pct_emoluments, prgf_par_jour)

  const total_charges_patronales = csg_patronal + csg_patronal_bonus + nsf_patronal + training_levy + prgf

  const cout_total_employeur = salaire_brut + total_charges_patronales

  // Refacturation inter-societes (ex: OCC refacture DDS)
  const montant_refacture_mur = pctRefacturation > 0
    ? Math.round((cout_total_employeur + airboxMur + ordinateurMur) * pctRefacturation * 100) / 100
    : 0

  return {
    salaire_brut: Math.round(salaire_brut * 100) / 100,
    csg_taux: csgTaux,
    csg_salarie: Math.round(csg_salarie * 100) / 100,
    csg_bonus: Math.round(csg_bonus * 100) / 100,
    nsf_salarie: Math.round(nsf_salarie * 100) / 100,
    paye: Math.round(paye * 100) / 100,
    total_deductions: Math.round(total_deductions * 100) / 100,
    salaire_net: Math.round(salaire_net * 100) / 100,
    csg_patronal: Math.round(csg_patronal * 100) / 100,
    csg_patronal_bonus: Math.round(csg_patronal_bonus * 100) / 100,
    nsf_patronal: Math.round(nsf_patronal * 100) / 100,
    training_levy: Math.round(training_levy * 100) / 100,
    prgf: Math.round(prgf * 100) / 100,
    prgf_pct_emoluments: Math.round(prgf_pct_emoluments * 100) / 100,
    prgf_par_jour: Math.round(prgf_par_jour * 100) / 100,
    total_charges_patronales: Math.round(total_charges_patronales * 100) / 100,
    cout_total_employeur: Math.round(cout_total_employeur * 100) / 100,
    montant_refacture_mur: Math.round(montant_refacture_mur * 100) / 100,
    total_emoluments: Math.round(total_emoluments * 100) / 100,
    salary_compensation_montant: Math.round(salary_compensation_montant * 100) / 100,
  }
}

// Alias pour compatibilite avec l'ancien code
export function calculerCotisations(
  salaireBrut: number,
  params: ParametresPaieMRA = PARAMS_MRA_DEFAUT,
  joursTravailles: number = 26
) {
  return calculerBulletin({ salaire_base: salaireBrut }, params, joursTravailles)
}

export function calculerSalaireBrut(employe: {
  salaire_base: number
  transport_allowance: number
  petrol_allowance: number
  primes_variables?: number
  heures_sup?: number
  taux_horaire_sup?: number
}) {
  return employe.salaire_base + employe.transport_allowance + employe.petrol_allowance +
    (employe.primes_variables || 0) +
    ((employe.heures_sup || 0) * (employe.taux_horaire_sup || 0))
}

/**
 * Calcul PRGF (Portable Retirement Gratuity Fund)
 * Per Mauritius law: the higher of:
 *   - 4.5% of total emoluments (basic + allowances)
 *   - Rs 4.50 per day worked
 *
 * @param totalEmoluments - basic salary + allowances (excl. OT and EOY bonus)
 * @param joursTravailles - number of days worked in the period
 * @param params - MRA parameters
 * @returns { prgf, prgf_pct, prgf_jour, method }
 */
export function calculerPRGF(
  totalEmoluments: number,
  joursTravailles: number = 26,
  params: ParametresPaieMRA = PARAMS_MRA_DEFAUT
): { prgf: number; prgf_pct: number; prgf_jour: number; method: 'percentage' | 'per_day' } {
  const prgf_pct = Math.round(totalEmoluments * params.prgf_taux_emoluments * 100) / 100
  const prgf_jour = Math.round(params.prgf_patronal_par_jour * joursTravailles * 100) / 100
  const prgf = Math.max(prgf_pct, prgf_jour)
  const method = prgf_pct >= prgf_jour ? 'percentage' : 'per_day'
  return { prgf, prgf_pct, prgf_jour, method }
}

/**
 * Calculate PAYE (Pay As You Earn) for a given monthly income
 * @param salaireMensuelImposable - monthly taxable income (excl. EOY bonus)
 * @param params - MRA parameters
 * @returns monthly PAYE amount
 */
export function calculerPAYE(
  salaireMensuelImposable: number,
  params: ParametresPaieMRA = PARAMS_MRA_DEFAUT
): number {
  const salaireAnnuel = salaireMensuelImposable * 12
  let payeAnnuel = 0
  if (salaireAnnuel > params.paye_seuil_exoneration) {
    const tranche1 = Math.min(salaireAnnuel, params.paye_seuil_taux_2) - params.paye_seuil_exoneration
    payeAnnuel += tranche1 * params.paye_taux_1
    if (salaireAnnuel > params.paye_seuil_taux_2) {
      payeAnnuel += (salaireAnnuel - params.paye_seuil_taux_2) * params.paye_taux_2
    }
  }
  return Math.round(payeAnnuel / 12)
}

/**
 * Determine NIT (Negative Income Tax) eligibility and amount
 * Low-income employees (annual income < threshold) may qualify
 * @param salaireMensuelBrut - monthly gross salary
 * @returns { eligible, montant }
 */
export function calculerNIT(
  salaireMensuelBrut: number
): { eligible: boolean; montant: number } {
  // NIT thresholds for Mauritius 2025-2026
  // Category A: No dependents - income <= 25,000/month
  // Category B: 1+ dependents - income <= 30,000/month
  // Simplified: using single threshold
  const NIT_SEUIL_MENSUEL = 25000
  const NIT_MONTANT = 1000 // Rs 1,000 per month for eligible employees

  if (salaireMensuelBrut <= NIT_SEUIL_MENSUEL && salaireMensuelBrut > 0) {
    return { eligible: true, montant: NIT_MONTANT }
  }
  return { eligible: false, montant: 0 }
}

// ======================================================================
// Moteur paie multi-devises -- Salaires EUR avec conversion MUR
// ======================================================================

export interface DeviseInfo {
  devise: 'MUR' | 'EUR'
  montant_eur: number
  taux_applique: number
}

export async function calculerBulletinDevise(
  elements: ElementsBrut,
  devise_salaire: 'MUR' | 'EUR' = 'MUR',
  taux_change_eur: number = 46.50,
  params: ParametresPaieMRA = PARAMS_MRA_DEFAUT,
  joursTravailles: number = 26,
  pctRefacturation: number = 0
): Promise<ResultatPaie & { devise_info: DeviseInfo }> {
  const salaire_eur = devise_salaire === 'EUR' ? elements.salaire_base : 0
  const salaire_mur = devise_salaire === 'EUR'
    ? Math.round(elements.salaire_base * taux_change_eur)
    : elements.salaire_base

  const elementsConverted: ElementsBrut = { ...elements, salaire_base: salaire_mur }
  const resultat = calculerBulletin(elementsConverted, params, joursTravailles, pctRefacturation)

  return {
    ...resultat,
    devise_info: {
      devise: devise_salaire,
      montant_eur: salaire_eur,
      taux_applique: taux_change_eur,
    }
  }
}

// Calcul 13eme mois (EOY Bonus) -- WRA Section 52
export function calculerTreizMois(
  salaire_base: number,
  mois_travailles: number = 12,
  tranche: '75pct' | '25pct' | 'total' = 'total'
): number {
  const base = (salaire_base / 12) * mois_travailles
  if (tranche === '75pct') return Math.round(base * 0.75 * 100) / 100
  if (tranche === '25pct') return Math.round(base * 0.25 * 100) / 100
  return Math.round(base * 100) / 100
}
