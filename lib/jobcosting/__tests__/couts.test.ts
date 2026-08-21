import { describe, it, expect } from 'vitest'
import {
  coutHoraireCharge,
  coutTemps,
  montantRefacturableDepense,
  montantFacturableTemps,
  coutRevientJob,
  rentabiliteJob,
  tauxUtilisation,
} from '@/lib/jobcosting/couts'

describe('coutHoraireCharge', () => {
  it('formule §2.5 : (base + primes) × (1 + charges) / heures', () => {
    // (30000 + 0) × 1.13 / 195 = 33900 / 195 = 173.8462
    expect(coutHoraireCharge({ salaire_base: 30000 })).toBe(173.8462)
  })

  it('intègre les primes fixes et un taux de charges explicite', () => {
    // (40000 + 2000) × 1.20 / 200 = 50400 / 200 = 252
    expect(
      coutHoraireCharge({
        salaire_base: 40000,
        primes_fixes: 2000,
        charges_patronales_pct: 0.2,
        heures_mensuelles: 200,
      }),
    ).toBe(252)
  })

  it('heures nulles/négatives → retombe sur 195 h par défaut', () => {
    expect(coutHoraireCharge({ salaire_base: 19500, heures_mensuelles: 0 })).toBe(
      coutHoraireCharge({ salaire_base: 19500 }),
    )
    // 19500 × 1.13 / 195 = 113
    expect(coutHoraireCharge({ salaire_base: 19500 })).toBe(113)
  })

  it('salaire ou charges négatifs → erreur', () => {
    expect(() => coutHoraireCharge({ salaire_base: -1 })).toThrow('COUT_HORAIRE_INVALIDE')
    expect(() => coutHoraireCharge({ salaire_base: 100, charges_patronales_pct: -0.1 })).toThrow(
      'COUT_HORAIRE_INVALIDE',
    )
  })
})

describe('coutTemps', () => {
  it('heures × coût horaire, arrondi au centime', () => {
    expect(coutTemps(7.5, 173.8462)).toBe(1303.85) // 1303.8465 → 1303.85
  })
})

describe('montantRefacturableDepense', () => {
  it('non facturable → 0', () => {
    expect(montantRefacturableDepense(1000, 20, false)).toBe(0)
  })
  it('facturable avec marge 20% → montant × 1.2', () => {
    expect(montantRefacturableDepense(1000, 20, true)).toBe(1200)
  })
  it('marge nulle/absente → montant HT tel quel', () => {
    expect(montantRefacturableDepense(999.99, null, true)).toBe(999.99)
    expect(montantRefacturableDepense(500, 0, true)).toBe(500)
  })
})

describe('montantFacturableTemps', () => {
  it('facturable avec taux → heures × taux', () => {
    expect(montantFacturableTemps(8, 500, true)).toBe(4000)
  })
  it('non facturable ou sans taux → 0', () => {
    expect(montantFacturableTemps(8, 500, false)).toBe(0)
    expect(montantFacturableTemps(8, null, true)).toBe(0)
  })
})

describe('coutRevientJob', () => {
  it('somme main d\'œuvre + dépenses', () => {
    expect(coutRevientJob({ cout_temps_reel: 12000, cout_depenses_reel: 3450.5 })).toBe(15450.5)
  })
})

describe('rentabiliteJob', () => {
  it('marge = facturable − coût de revient (job non facturé)', () => {
    const r = rentabiliteJob({
      cout_temps_reel: 10000,
      cout_depenses_reel: 2000,
      montant_facturable: 18000,
    })
    expect(r.cout_revient).toBe(12000)
    expect(r.produit).toBe(18000)
    expect(r.marge).toBe(6000)
    expect(r.marge_pct).toBe(33.33) // 6000/18000 = 33.33%
  })

  it('un job facturé compare au montant facturé gelé, pas au facturable', () => {
    const r = rentabiliteJob({
      cout_temps_reel: 10000,
      cout_depenses_reel: 2000,
      montant_facturable: 18000,
      montant_facture: 16000,
    })
    expect(r.produit).toBe(16000)
    expect(r.marge).toBe(4000)
  })

  it('marge négative si coût > produit', () => {
    const r = rentabiliteJob({
      cout_temps_reel: 20000,
      cout_depenses_reel: 5000,
      montant_facturable: 18000,
    })
    expect(r.marge).toBe(-7000)
    expect(r.marge_pct).toBe(-38.89)
  })

  it('produit nul → marge_pct null', () => {
    const r = rentabiliteJob({
      cout_temps_reel: 500,
      cout_depenses_reel: 0,
      montant_facturable: 0,
    })
    expect(r.marge_pct).toBeNull()
  })

  it('budget : écart, avancement heures, dépassement', () => {
    const r = rentabiliteJob({
      cout_temps_reel: 12000,
      cout_depenses_reel: 0,
      montant_facturable: 15000,
      budget_montant: 10000,
      budget_heures: 100,
      heures_imputees: 80,
    })
    expect(r.ecart_budget).toBe(5000) // 15000 − 10000
    expect(r.avancement_heures_pct).toBe(80)
    expect(r.depassement_budget).toBe(true) // coût 12000 > budget 10000
  })

  it('sans budget → ecart et avancement null, pas de dépassement', () => {
    const r = rentabiliteJob({
      cout_temps_reel: 12000,
      cout_depenses_reel: 0,
      montant_facturable: 15000,
    })
    expect(r.ecart_budget).toBeNull()
    expect(r.avancement_heures_pct).toBeNull()
    expect(r.depassement_budget).toBe(false)
  })
})

describe('tauxUtilisation', () => {
  it('heures facturables / heures pointées', () => {
    expect(tauxUtilisation(6, 8)).toBe(75)
  })
  it('heures pointées nulles → null', () => {
    expect(tauxUtilisation(6, 0)).toBeNull()
  })
})
