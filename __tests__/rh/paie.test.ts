/**
 * Tests unitaires — Moteur de calcul de paie MRA Maurice
 * Couvre : calculerBulletin, calcOT (via simulation), primes, PAYE, CSG, NSF, PRGF
 */
import { describe, it, expect } from 'vitest'
import {
  calculerBulletin,
  calculerPAYE,
  calculerPRGF,
  calculerNIT,
  calculerTreizMois,
  PARAMS_MRA_DEFAUT,
  type ElementsBrut,
} from '@/lib/rh/paie'

// ─────────────────────────────────────────────
// Helper : simuler calcOT (copie de la logique route.ts)
// ─────────────────────────────────────────────
function calcOT(
  hEntree: string,
  hSortie: string,
  ferieDay: boolean,
  planningHours: number = 9,
  isPlannedWorkDay: boolean = true
) {
  if (!hEntree || !hSortie) return { normales: 0, ot15: 0, ot2: 0 }
  const debut = new Date(`1970-01-01T${hEntree}`)
  const fin = new Date(`1970-01-01T${hSortie}`)
  let totalH = (fin.getTime() - debut.getTime()) / 3600000 - 1 // -1h pause
  if (totalH <= 0) totalH = 0
  if (ferieDay) return { normales: 0, ot15: 0, ot2: totalH }
  if (!isPlannedWorkDay) return { normales: 0, ot15: totalH, ot2: 0 }
  const normales = Math.min(totalH, planningHours)
  const reste = Math.max(totalH - planningHours, 0)
  return { normales, ot15: Math.min(reste, 2), ot2: Math.max(reste - 2, 0) }
}

// ─────────────────────────────────────────────
// 1. CALCUL BULLETIN DE PAIE
// ─────────────────────────────────────────────
describe('calculerBulletin', () => {
  it('calcule correctement un salaire de base simple (25 000 MUR)', () => {
    const elements: ElementsBrut = { salaire_base: 25000 }
    const r = calculerBulletin(elements)

    // Salary compensation auto: 635 (base <= 50K)
    expect(r.salary_compensation_montant).toBe(635)

    // Brut = 25000 + 635 = 25635
    expect(r.salaire_brut).toBe(25635)

    // CSG taux reduit (brut <= 50K) = 1.5%
    expect(r.csg_taux).toBe(0.015)
    expect(r.csg_salarie).toBe(Math.round(25635 * 0.015))

    // NSF = 1.5%
    expect(r.nsf_salarie).toBe(Math.round(25635 * 0.015))

    // Net = brut - deductions
    expect(r.salaire_net).toBe(r.salaire_brut - r.total_deductions)
  })

  it('calcule correctement un salaire élevé (60 000 MUR) — taux plein CSG', () => {
    const elements: ElementsBrut = { salaire_base: 60000 }
    const r = calculerBulletin(elements)

    // Pas de salary compensation (base > 50K)
    expect(r.salary_compensation_montant).toBe(0)

    // CSG taux plein (brut > 50K) = 3%
    expect(r.csg_taux).toBe(0.03)
    expect(r.csg_salarie).toBe(Math.round(60000 * 0.03))

    // CSG patronal taux plein = 6%
    expect(r.csg_patronal).toBe(Math.round(60000 * 0.06))
  })

  it('intègre les heures sup dans le brut', () => {
    const elements: ElementsBrut = { salaire_base: 30000, heures_sup_montant: 5000 }
    const r = calculerBulletin(elements)

    // Brut = 30000 + 635 (compensation) + 5000 (OT) = 35635
    expect(r.salaire_brut).toBe(35635)
  })

  it('intègre les primes (special_allowance_1) dans le brut', () => {
    const elements: ElementsBrut = { salaire_base: 30000, special_allowance_1: 3000 }
    const r = calculerBulletin(elements)

    // Brut = 30000 + 635 + 3000 = 33635
    expect(r.salaire_brut).toBe(33635)
  })

  it('intègre OT + primes + transport + petrol', () => {
    const elements: ElementsBrut = {
      salaire_base: 30000,
      heures_sup_montant: 4000,
      special_allowance_1: 2000,
      transport_allowance: 3000,
      petrol_allowance: 1500,
    }
    const r = calculerBulletin(elements)

    // Brut = 30000 + 635 + 4000 + 2000 + 3000 + 1500 = 41135
    expect(r.salaire_brut).toBe(41135)
    // Toujours taux réduit car brut <= 50K
    expect(r.csg_taux).toBe(0.015)
  })

  it('gère le 13ème mois (EOY bonus) — exonéré PAYE, soumis CSG', () => {
    const elements: ElementsBrut = { salaire_base: 40000, eoy_bonus: 40000 }
    const r = calculerBulletin(elements)

    // Brut base = 40000 + 635 = 40635
    // Brut total = 40635 + 40000 = 80635
    expect(r.salaire_brut).toBe(80635)

    // CSG bonus = 3% (toujours taux plein sur EOY)
    expect(r.csg_bonus).toBe(Math.round(40000 * 0.03))

    // PAYE calculé sur base HORS eoy_bonus
    const payeAttendu = calculerPAYE(40635)
    expect(r.paye).toBe(payeAttendu)
  })

  it('calcule les charges patronales correctement', () => {
    const elements: ElementsBrut = { salaire_base: 35000 }
    const r = calculerBulletin(elements)

    // Training levy = 1% du salaire de base uniquement
    expect(r.training_levy).toBe(Math.round(35000 * 0.01))

    // NSF patronal = 2.5%
    const brut = r.salaire_brut
    expect(r.nsf_patronal).toBe(Math.round(brut * 0.025))

    // PRGF = max(4.5% emoluments, Rs 4.50 * 26 jours)
    expect(r.prgf).toBe(Math.max(r.prgf_pct_emoluments, r.prgf_par_jour))

    // Cout total = brut + charges
    expect(r.cout_total_employeur).toBe(r.salaire_brut + r.total_charges_patronales)
  })

  it('la refacturation inter-sociétés fonctionne', () => {
    const elements: ElementsBrut = { salaire_base: 40000 }
    const r = calculerBulletin(elements, PARAMS_MRA_DEFAUT, 26, 0.50) // 50% refacturation

    expect(r.montant_refacture_mur).toBeGreaterThan(0)
    // Montant = (cout_total + airbox + ordinateur) * 50%
    const expected = Math.round((r.cout_total_employeur + 924.48 + 818.22) * 0.50 * 100) / 100
    expect(r.montant_refacture_mur).toBe(expected)
  })

  it('pas de refacturation si pct = 0', () => {
    const elements: ElementsBrut = { salaire_base: 40000 }
    const r = calculerBulletin(elements, PARAMS_MRA_DEFAUT, 26, 0)
    expect(r.montant_refacture_mur).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 2. CALCUL OT (heures supplémentaires)
// ─────────────────────────────────────────────
describe('calcOT — calcul heures supplémentaires', () => {
  it('jour normal 9h : pas d\'OT', () => {
    // 07:00 → 17:00 = 10h - 1h pause = 9h normales
    const ot = calcOT('07:00', '17:00', false, 9, true)
    expect(ot.normales).toBe(9)
    expect(ot.ot15).toBe(0)
    expect(ot.ot2).toBe(0)
  })

  it('jour normal avec 2h OT à 1.5x', () => {
    // 07:00 → 19:00 = 12h - 1h = 11h → 9 normales + 2h OT 1.5x
    const ot = calcOT('07:00', '19:00', false, 9, true)
    expect(ot.normales).toBe(9)
    expect(ot.ot15).toBe(2)
    expect(ot.ot2).toBe(0)
  })

  it('jour normal avec OT au-delà de 2h → passage en 2x', () => {
    // 07:00 → 21:00 = 14h - 1h = 13h → 9 normales + 2h OT1.5 + 2h OT2
    const ot = calcOT('07:00', '21:00', false, 9, true)
    expect(ot.normales).toBe(9)
    expect(ot.ot15).toBe(2)
    expect(ot.ot2).toBe(2)
  })

  it('jour férié : toutes les heures en OT 2x', () => {
    // 07:00 → 17:00 = 9h → tout en OT 2x
    const ot = calcOT('07:00', '17:00', true, 9, true)
    expect(ot.normales).toBe(0)
    expect(ot.ot15).toBe(0)
    expect(ot.ot2).toBe(9)
  })

  it('jour non planifié (repos) : toutes les heures en OT 1.5x', () => {
    // 07:00 → 15:00 = 8h - 1h = 7h → tout en OT 1.5x
    const ot = calcOT('07:00', '15:00', false, 9, false)
    expect(ot.normales).toBe(0)
    expect(ot.ot15).toBe(7)
    expect(ot.ot2).toBe(0)
  })

  it('planning 3x8 (8h) : OT après 8h au lieu de 9h', () => {
    // 06:00 → 16:00 = 10h - 1h = 9h → 8 normales + 1h OT 1.5x
    const ot = calcOT('06:00', '16:00', false, 8, true)
    expect(ot.normales).toBe(8)
    expect(ot.ot15).toBe(1)
    expect(ot.ot2).toBe(0)
  })

  it('pas d\'entrée/sortie → 0 partout', () => {
    const ot = calcOT('', '', false)
    expect(ot.normales).toBe(0)
    expect(ot.ot15).toBe(0)
    expect(ot.ot2).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 3. CALCUL OT MONTANT avec taux horaire
// ─────────────────────────────────────────────
describe('Calcul montant OT intégré au bulletin', () => {
  it('simule le flux complet : pointages → OT montant → bulletin', () => {
    const salaire_base = 30000
    const taux_horaire = salaire_base / (45 * 52 / 12) // ~153.85 MUR/h

    // Simuler 22 jours normaux (9h) + 3 jours avec 2h OT chacun
    const pointages = [
      // 3 jours avec OT
      { heure_entree: '07:00', heure_sortie: '19:00', ferie: false, planH: 9, planned: true },
      { heure_entree: '07:00', heure_sortie: '19:00', ferie: false, planH: 9, planned: true },
      { heure_entree: '07:00', heure_sortie: '19:00', ferie: false, planH: 9, planned: true },
    ]

    let total_ot_montant = 0
    let jours_travailles = 0

    for (const pt of pointages) {
      jours_travailles++
      const ot = calcOT(pt.heure_entree, pt.heure_sortie, pt.ferie, pt.planH, pt.planned)
      total_ot_montant += ot.ot15 * taux_horaire * 1.5 + ot.ot2 * taux_horaire * 2
    }

    // 3 jours × 2h OT 1.5x = 6h × taux × 1.5
    expect(total_ot_montant).toBeCloseTo(6 * taux_horaire * 1.5, 0)

    // Injecter dans le bulletin
    const r = calculerBulletin(
      { salaire_base, heures_sup_montant: Math.round(total_ot_montant) },
      PARAMS_MRA_DEFAUT,
      jours_travailles + 19 // 22 jours total
    )

    expect(r.salaire_brut).toBeGreaterThan(salaire_base)
  })
})

// ─────────────────────────────────────────────
// 4. PRIMES VARIABLES
// ─────────────────────────────────────────────
describe('Intégration des primes dans le bulletin', () => {
  it('somme des primes injectée dans special_allowance_1', () => {
    // Simuler 3 primes du mois
    const primesMois = [
      { montant: 2000 },
      { montant: 1500 },
      { montant: 500 },
    ]
    const total_primes = primesMois.reduce((s, p) => s + p.montant, 0) // 4000

    const r = calculerBulletin({
      salaire_base: 30000,
      special_allowance_1: total_primes,
    })

    // Brut inclut les primes
    // 30000 + 635 (compensation) + 4000 (primes) = 34635
    expect(r.salaire_brut).toBe(34635)
  })

  it('primes = 0 si aucune prime pour le mois', () => {
    const r = calculerBulletin({ salaire_base: 30000 })
    // Brut = base + compensation seulement
    expect(r.salaire_brut).toBe(30635)
  })
})

// ─────────────────────────────────────────────
// 5. PAYE (impôt sur le revenu)
// ─────────────────────────────────────────────
describe('calculerPAYE', () => {
  it('pas de PAYE si salaire annuel <= 390K', () => {
    // 32000/mois × 12 = 384000 < 390000
    expect(calculerPAYE(32000)).toBe(0)
  })

  it('PAYE tranche 1 (10%) entre 390K et 650K annuel', () => {
    // 40000/mois × 12 = 480000
    // Tranche 1 : (480000 - 390000) × 10% = 9000/an → 750/mois
    expect(calculerPAYE(40000)).toBe(750)
  })

  it('PAYE tranche 2 (15%) au-dessus de 650K annuel', () => {
    // 60000/mois × 12 = 720000
    // Tranche 1 : (650000 - 390000) × 10% = 26000
    // Tranche 2 : (720000 - 650000) × 15% = 10500
    // Total annuel = 36500 → mensuel = 3042 (arrondi)
    expect(calculerPAYE(60000)).toBe(Math.round(36500 / 12))
  })
})

// ─────────────────────────────────────────────
// 6. PRGF
// ─────────────────────────────────────────────
describe('calculerPRGF', () => {
  it('utilise la méthode pourcentage si > méthode par jour', () => {
    // 40000 emoluments × 4.5% = 1800 vs 4.50 × 26 = 117 → pourcentage
    const r = calculerPRGF(40000, 26)
    expect(r.method).toBe('percentage')
    expect(r.prgf).toBe(r.prgf_pct)
  })

  it('utilise la méthode par jour si peu d\'emoluments', () => {
    // 100 emoluments × 4.5% = 4.5 vs 4.50 × 26 = 117 → par jour
    const r = calculerPRGF(100, 26)
    expect(r.method).toBe('per_day')
    expect(r.prgf).toBe(r.prgf_jour)
  })
})

// ─────────────────────────────────────────────
// 7. NIT (Negative Income Tax)
// ─────────────────────────────────────────────
describe('calculerNIT', () => {
  it('éligible si salaire <= 25000', () => {
    const r = calculerNIT(20000)
    expect(r.eligible).toBe(true)
    expect(r.montant).toBe(1000)
  })

  it('non éligible si salaire > 25000', () => {
    const r = calculerNIT(30000)
    expect(r.eligible).toBe(false)
    expect(r.montant).toBe(0)
  })

  it('non éligible si salaire = 0', () => {
    const r = calculerNIT(0)
    expect(r.eligible).toBe(false)
    expect(r.montant).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 8. 13ème MOIS
// ─────────────────────────────────────────────
describe('calculerTreizMois', () => {
  it('calcule le 13ème mois complet (12 mois travaillés)', () => {
    expect(calculerTreizMois(36000, 12)).toBe(36000)
  })

  it('proratise si moins de 12 mois', () => {
    // 36000/12 * 6 = 18000
    expect(calculerTreizMois(36000, 6)).toBe(18000)
  })

  it('tranche 75% pour paiement décembre', () => {
    expect(calculerTreizMois(36000, 12, '75pct')).toBe(27000)
  })

  it('tranche 25% pour solde', () => {
    expect(calculerTreizMois(36000, 12, '25pct')).toBe(9000)
  })
})

// ─────────────────────────────────────────────
// 9. COHÉRENCE GLOBALE
// ─────────────────────────────────────────────
describe('Cohérence globale du bulletin', () => {
  it('net = brut - deductions (toujours positif)', () => {
    const scenarios: ElementsBrut[] = [
      { salaire_base: 15000 },
      { salaire_base: 25000, heures_sup_montant: 3000 },
      { salaire_base: 50000, special_allowance_1: 5000 },
      { salaire_base: 80000, eoy_bonus: 80000 },
      { salaire_base: 100000, transport_allowance: 5000, petrol_allowance: 3000 },
    ]

    for (const elements of scenarios) {
      const r = calculerBulletin(elements)
      expect(r.salaire_net).toBe(r.salaire_brut - r.total_deductions)
      expect(r.salaire_net).toBeGreaterThan(0)
      expect(r.cout_total_employeur).toBe(r.salaire_brut + r.total_charges_patronales)
    }
  })

  it('total_deductions = CSG + CSG bonus + NSF + PAYE', () => {
    const r = calculerBulletin({ salaire_base: 45000, eoy_bonus: 10000 })
    expect(r.total_deductions).toBe(r.csg_salarie + r.csg_bonus + r.nsf_salarie + r.paye)
  })

  it('total_charges_patronales = CSG patron + CSG bonus patron + NSF patron + levy + PRGF', () => {
    const r = calculerBulletin({ salaire_base: 45000 })
    expect(r.total_charges_patronales).toBe(
      r.csg_patronal + r.csg_patronal_bonus + r.nsf_patronal + r.training_levy + r.prgf
    )
  })
})
