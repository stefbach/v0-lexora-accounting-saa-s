/**
 * Moteur de calcul de paie MRA Maurice — LEXORA
 * Finance Act 2025-2026 + Workers' Rights Act 2019
 * Conforme table bulletins_paie (avec refacturation inter-societes)
 *
 * Rates applied (2025-2026, validés via MRA officiel + Rogers Capital +
 * bulletins payrollmauritius.com) :
 * - CSG Employee    : 1.5% si base_csg_nsf ≤ 50 000 MUR, 3% sinon
 * - CSG Employer    : 3% si base_csg_nsf ≤ 50K, 6% sinon (progressif)
 * - NSF Employee    : 1% plafonné à 28 600 MUR/mois (F9)
 * - NSF Employer    : 2.5% plafonné à 28 600 MUR/mois (F9)
 * - Training Levy   : 1,5% du salaire de base (HRDC, effective 2021-07-01)
 * - PRGF            : max(4.5% emoluments, Rs 4.50/jour)
 * - PAYE            : cumul annuel sur × 13 → divisé par 13 (Math.floor) :
 *     * 0 → 500 000 MUR        : 0%
 *     * 500 000 → 1 000 000    : 10%
 *     * > 1 000 000            : 20%
 *
 * F11 (Sprint bugs paie/conges) — DEUX bases de calcul distinctes :
 *   base_csg_nsf = salaire_base (basic seul) - prorata absence sur basic
 *                → utilisée pour CSG et NSF (salarié ET patronal)
 *   base_paye    = salaire_brut_base (basic + allowances) - deductionAbsence
 *                → utilisée pour PAYE
 * Les allowances (électricité, spéciale, transport, etc.) sont donc
 * EXCLUES de la base CSG/NSF mais INCLUSES dans la base PAYE.
 *
 * F10 — La deductionAbsence (UL + absences injustifiées) réduit les bases
 * de cotisation (un employé absent paie moins de CSG/NSF/PAYE).
 *
 * POLICY Lexora — la compensation salariale Finance Act 2024 (Rs 635)
 * est considérée comme DÉJÀ INCLUSE dans le salaire négocié avec
 * l'employé. L'employeur ne la verse pas en plus. Aucun calcul
 * salary_compensation n'est effectué par le moteur.
 */
import type { ParametresPaieMRA } from '@/lib/types'

export const PARAMS_MRA_DEFAUT: ParametresPaieMRA = {
  csg_seuil_taux_reduit: 50000,
  csg_salarie_taux_reduit: 0.015,   // 1.5% si imposable <= 50 000 MUR
  csg_salarie_taux_plein: 0.030,    // 3% si imposable > 50 000 MUR
  csg_patronal: 0.060,              // 6% employeur (si imposable > 50K)
  csg_patronal_taux_reduit: 0.030,  // 3% employeur (si imposable <= 50K)
  nsf_salarie: 0.010,               // 1% NSF salarié (F9 Sprint bugs)
  nsf_patronal: 0.025,              // 2.5% NSF employeur
  nsf_plafond_mensuel: 28570,       // Plafond insurable NSF (effective 2025-07-01)
  training_levy: 0.015,             // 1.5% HRDC sur basic wage (effective 2021-07-01)
  prgf_patronal_par_jour: 4.50,     // PRGF par jour travaillé
  prgf_taux_emoluments: 0.045,      // 4.5% des emoluments totaux
  paye_seuil_exoneration: 500000,   // 0% jusqu'à 500K MUR/an (Budget 2025-2026)
  paye_taux_1: 0.10,                // 10% tranche 500K-1M
  paye_seuil_taux_2: 1000000,       // Seuil tranche 2 : 1 000 000 MUR/an
  paye_taux_2: 0.20,                // 20% tranche > 1M
  // POLICY Lexora : compensation considérée incluse dans le salaire.
  // On garde les champs dans le type pour rétrocompatibilité des lectures
  // mais le montant versé par le moteur est systématiquement 0.
  salary_compensation: 0,
  salary_compensation_seuil: 50000,
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
  commission?: number          // Commission
  /** G9 — Disturbance Allowance WRA S.17A FMPA 2024 (heures unsocial).
   *  Assimilé à un salaire normal (soumis CSG/NSF/PAYE).
   *  Calcul externe via lib/rh/disturbance-allowance. */
  disturbance_allowance?: number
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
  // NIT (Negative Income Tax, Finance Act 2024)
  nit_eligible: boolean
  nit_montant: number
  paye_brut: number
}

export function calculerBulletin(
  elements: ElementsBrut,
  params: ParametresPaieMRA = PARAMS_MRA_DEFAUT,
  joursTravailles: number = 26,
  pctRefacturation: number = 0,
  airboxMur: number = 924.48,
  ordinateurMur: number = 818.22,
  /**
   * F10 — Déduction totale à retrancher des bases de cotisation (UL +
   * absences injustifiées). Si > 0, CSG/NSF/PAYE sont calculés sur
   * `salaire_brut_base - deductionAbsence` (= salaire_imposable). Le
   * salaire_brut retourné reste inchangé (valeur nominale) ; la déduction
   * finale est appliquée au salaire_net côté appelant (avec plafonds).
   */
  deductionAbsence: number = 0,
  /**
   * G1 — Montant du paiement compensatoire (cash-in-lieu) WRA S.45/S.47
   * pour les jours de congé non pris en fin de cycle. Considéré comme du
   * salaire normal : ajouté à salaire_brut_base ET à la base CSG/NSF
   * (équivalent au salaire de base, car les jours non pris auraient été
   * payés comme salary). Inclus dans salaire_net retourné.
   */
  cashInLieuMontant: number = 0,
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
    disturbance_allowance = 0,
  } = elements

  // POLICY Lexora — plus de salary_compensation ajoutée au brut.
  // G1 — cashInLieuMontant ajouté au brut total (impacte PAYE et net).
  // G9 — disturbance_allowance (S.17A) s'ajoute comme un salary normal
  //      (soumis CSG/NSF/PAYE), même rang que les autres allowances.
  const salaire_brut_base = salaire_base + increment_salaire +
    heures_sup_montant +
    transport_allowance + petrol_allowance +
    special_allowance_1 + special_allowance_2 + special_allowance_3 +
    other_refund + departure_notice + commission +
    disturbance_allowance +
    (cashInLieuMontant || 0)

  const salaire_brut = salaire_brut_base + eoy_bonus

  // F11 — Règle MRA officielle (sources : MRA + Rogers Capital + bulletins
  // payrollmauritius.com) : CSG et NSF sont calculés sur le SALAIRE_BASE
  // UNIQUEMENT (basic salary), PAS sur le salaire_brut qui inclut les
  // allowances (électricité, spéciale, transport, etc.).
  // PAYE reste calculé sur les emoluments totaux (brut - absences).
  //
  // G1 — Le cash-in-lieu (CIL, paiement de jours de congé non pris) est
  // assimilé à du salary normal pour CSG/NSF (les jours non pris auraient
  // été payés comme du basic). On l'ajoute donc au numérateur de la base
  // CSG/NSF.
  //
  // Quand un employé est absent, la déduction vient proportionnellement
  // du basic ET des allowances → on prorate l'absence pour déterminer la
  // part à retrancher du basic dans la base CSG/NSF.
  const basicAvecCil = salaire_base + (cashInLieuMontant || 0)
  const ratioBasicSurBrut = salaire_brut_base > 0 ? basicAvecCil / salaire_brut_base : 0
  const prorataAbsenceBasic = (deductionAbsence || 0) * ratioBasicSurBrut

  // Base CSG/NSF = (salaire_base + CIL) - prorata_absence_basic.
  const base_csg_nsf = Math.max(0, basicAvecCil - prorataAbsenceBasic)

  // Base PAYE = salaire_brut_base (basic + allowances + CIL) - deductionAbsence.
  const base_paye = Math.max(0, salaire_brut_base - (deductionAbsence || 0))

  // Alias rétrocompat (certains appelants externes peuvent utiliser ce nom).
  const salaire_imposable = base_paye

  // Total emoluments for PRGF calculation (basic + allowances, excl OT & EOY)
  const total_emoluments = salaire_base + increment_salaire +
    transport_allowance + petrol_allowance +
    special_allowance_1 + special_allowance_2 + special_allowance_3 +
    commission

  // F11 — CSG sur base_csg_nsf (basic salary). Seuil sur la même base.
  const csgTaux = base_csg_nsf <= params.csg_seuil_taux_reduit
    ? params.csg_salarie_taux_reduit
    : params.csg_salarie_taux_plein

  const csg_salarie = Math.round(base_csg_nsf * csgTaux)
  // Sprint 14 FIX 5 — CSG bonus suit la même tranche que le salaire de base.
  const csg_bonus = eoy_bonus > 0 ? Math.round(eoy_bonus * csgTaux) : 0

  // F9 + F11 — NSF sur base_csg_nsf (basic salary), plafonné à
  // nsf_plafond_mensuel (28 570 MUR effective 2025-07-01). Max mensuel = 285,70 MUR.
  const nsfPlafond = params.nsf_plafond_mensuel ?? Number.POSITIVE_INFINITY
  const nsf_base = Math.min(base_csg_nsf, nsfPlafond)
  const nsf_salarie = Math.round(nsf_base * params.nsf_salarie)

  // F10 — PAYE méthode cumulative MRA annualisée × 13 (12 mois + bonus de
  // fin d'année). Base = base_paye (brut total - absences, allowances
  // INCLUSES). Montant mensuel = paye_annuel / 13 (Math.floor).
  // Barème Finance Act 2025-2026 :
  //   0 → 500 000 : 0% | 500 000 → 1 000 000 : 10% | > 1 000 000 : 20%
  const revenuAnnuel = base_paye * 13
  let payeAnnuel = 0
  if (revenuAnnuel > params.paye_seuil_exoneration) {
    if (revenuAnnuel <= params.paye_seuil_taux_2) {
      payeAnnuel = (revenuAnnuel - params.paye_seuil_exoneration) * params.paye_taux_1
    } else {
      const tranche1 = (params.paye_seuil_taux_2 - params.paye_seuil_exoneration) * params.paye_taux_1
      const tranche2 = (revenuAnnuel - params.paye_seuil_taux_2) * params.paye_taux_2
      payeAnnuel = tranche1 + tranche2
    }
  }
  const payeBrut = Math.floor(payeAnnuel / 13)

  // Sprint 14 FIX 6 — NIT (Negative Income Tax, Finance Act 2024).
  // Crédit d'impôt pour les bas salaires — réduit le PAYE dû. Si NIT ≥
  // PAYE, PAYE = 0 (pas de crédit négatif versé, juste exonération).
  const nit = calculerNIT(base_paye)
  const paye = Math.max(0, payeBrut - nit.montant)
  const nit_applique = nit.eligible ? Math.min(nit.montant, payeBrut) : 0

  const total_deductions = csg_salarie + csg_bonus + nsf_salarie + paye
  // POLICY Lexora — net ne peut jamais devenir négatif. Note : salaire_net
  // calculé ICI ne déduit PAS deductionAbsence (c'est l'appelant qui
  // applique la déduction finale avec plafonds + cap 0).
  const salaire_net = Math.max(0, salaire_brut - total_deductions)

  // F11 — Charges patronales : CSG/NSF patronal sur base_csg_nsf aussi
  // (règle MRA cohérente avec la part salarié). PRGF et training levy
  // conservent leurs bases respectives (total_emoluments / salaire_base).
  const csgPatronalTaux = base_csg_nsf <= params.csg_seuil_taux_reduit
    ? (params.csg_patronal_taux_reduit || 0.030)
    : params.csg_patronal
  const csg_patronal = Math.round(base_csg_nsf * csgPatronalTaux)
  // Sprint 14 FIX 5 — CSG patronal bonus suit la même tranche que le salaire.
  const csg_patronal_bonus = eoy_bonus > 0 ? Math.round(eoy_bonus * csgPatronalTaux) : 0
  // F9 + F11 — NSF patronal même base (basic plafonné à nsf_plafond_mensuel).
  const nsf_patronal = Math.round(nsf_base * params.nsf_patronal)

  // Training Levy (HRDC): 1.5% of basic salary only (effective 2021-07-01).
  // Household workers have a 0% rate — handled at societe / employe level.
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
    // Sprint 14 FIX 6 — NIT (Negative Income Tax)
    nit_eligible: nit.eligible,
    nit_montant: Math.round(nit_applique * 100) / 100,
    paye_brut: Math.round(payeBrut * 100) / 100,
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
 * Calculate PAYE (Pay As You Earn) for a given monthly income.
 * F10 — Méthode cumulative MRA × 13 (12 mois + bonus de fin d'année),
 * divisé par 13 (Math.floor) pour obtenir le mensuel.
 */
export function calculerPAYE(
  salaireMensuelImposable: number,
  params: ParametresPaieMRA = PARAMS_MRA_DEFAUT
): number {
  const revenuAnnuel = salaireMensuelImposable * 13
  let payeAnnuel = 0
  if (revenuAnnuel > params.paye_seuil_exoneration) {
    if (revenuAnnuel <= params.paye_seuil_taux_2) {
      payeAnnuel = (revenuAnnuel - params.paye_seuil_exoneration) * params.paye_taux_1
    } else {
      const tranche1 = (params.paye_seuil_taux_2 - params.paye_seuil_exoneration) * params.paye_taux_1
      const tranche2 = (revenuAnnuel - params.paye_seuil_taux_2) * params.paye_taux_2
      payeAnnuel = tranche1 + tranche2
    }
  }
  return Math.floor(payeAnnuel / 13)
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
