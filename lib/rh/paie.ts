/**
 * Moteur de calcul de paie MRA Maurice — TIBOK-COMPTA
 * Finance Act 2024 + Workers' Rights Act 2019
 * Conforme table bulletins_paie TIBOK (avec refacturation inter-sociétés)
 */
import type { ParametresPaieMRA } from '@/lib/types'

export const PARAMS_MRA_DEFAUT: ParametresPaieMRA = {
  csg_seuil_taux_reduit: 50000,
  csg_salarie_taux_reduit: 0.015,   // 1.5% si brut ≤ 50 000 MUR
  csg_salarie_taux_plein: 0.030,    // 3% si brut > 50 000 MUR
  csg_patronal: 0.060,              // 6% employeur
  nsf_salarie: 0.015,               // 1.5% NSF salarié
  nsf_patronal: 0.025,              // 2.5% NSF employeur
  training_levy: 0.010,             // 1% HRDC
  prgf_patronal_par_jour: 4.50,     // PRGF par jour travaillé
  paye_seuil_exoneration: 390000,   // 0% jusqu'à 390K MUR/an
  paye_taux_1: 0.10,                // 10% tranche 1
  paye_seuil_taux_2: 650000,        // Seuil tranche 2
  paye_taux_2: 0.15,                // 15% tranche 2+
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
  eoy_bonus?: number           // 13ème mois
  departure_notice?: number    // Préavis
}

export interface ResultatPaie {
  salaire_brut: number
  // Déductions salarié
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
  total_charges_patronales: number
  cout_total_employeur: number
  // Refacturation
  montant_refacture_mur: number
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
  } = elements

  const salaire_brut_base = salaire_base + increment_salaire + heures_sup_montant +
    transport_allowance + petrol_allowance +
    special_allowance_1 + special_allowance_2 + special_allowance_3 +
    other_refund + departure_notice

  const salaire_brut = salaire_brut_base + eoy_bonus

  // CSG sur salaire (hors EOY bonus — traité séparément)
  const csgTaux = salaire_brut_base <= params.csg_seuil_taux_reduit
    ? params.csg_salarie_taux_reduit
    : params.csg_salarie_taux_plein

  const csg_salarie = Math.round(salaire_brut_base * csgTaux)
  const csg_bonus = eoy_bonus > 0 ? Math.round(eoy_bonus * params.csg_salarie_taux_plein) : 0
  const nsf_salarie = Math.round(salaire_brut * params.nsf_salarie)

  // PAYE — barème progressif annuel MRA 2024/25
  const salaireAnnuel = salaire_brut_base * 12
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
  const csg_patronal = Math.round(salaire_brut_base * params.csg_patronal)
  const csg_patronal_bonus = eoy_bonus > 0 ? Math.round(eoy_bonus * params.csg_patronal) : 0
  const nsf_patronal = Math.round(salaire_brut * params.nsf_patronal)
  const training_levy = Math.round(salaire_brut * params.training_levy)
  const prgf = Math.round(params.prgf_patronal_par_jour * joursTravailles)
  const total_charges_patronales = csg_patronal + csg_patronal_bonus + nsf_patronal + training_levy + prgf

  const cout_total_employeur = salaire_brut + total_charges_patronales

  // Refacturation inter-sociétés (ex: OCC refacture DDS)
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
    total_charges_patronales: Math.round(total_charges_patronales * 100) / 100,
    cout_total_employeur: Math.round(cout_total_employeur * 100) / 100,
    montant_refacture_mur: Math.round(montant_refacture_mur * 100) / 100,
  }
}

// Alias pour compatibilité avec l'ancien code
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

// Calcul 13ème mois (EOY Bonus) — WRA Section 52
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
