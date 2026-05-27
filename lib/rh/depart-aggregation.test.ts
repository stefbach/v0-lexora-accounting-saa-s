import { describe, it, expect } from 'vitest'
import {
  aggregateBulletinFromBreakdown,
  validateBreakdownCovered,
  type BreakdownDepart,
} from './depart-aggregation'

/**
 * Anti-régression — toute société présente et future. Si un futur dev oublie
 * de câbler un composant du breakdown dans le bulletin STC, ce test casse en
 * CI/build, EMPÊCHANT la régression de partir en prod.
 *
 * Précédent : bug Mélanie RAVINA (mai 2026) — le VL (24 871 MUR) avait été
 * oublié et le bulletin STC sortait à 45 138 MUR au lieu de 70 009 MUR.
 */

describe('aggregateBulletinFromBreakdown — cas réels', () => {
  it('Mélanie RAVINA (DDS) : démission, 6 ans, VL éligible 30j → STC 70 009', () => {
    const breakdown: BreakdownDepart = {
      salaire_prorata: { montant: 14601.77 },
      allocations_prorata: { montant: 0 },
      conges_al: { montant: 21555 },
      conges_sl: { montant: 0 },
      conges_vl: { montant: 24871.15 },
      treizieme_mois: { montant: 8981.25 },
      preavis: { montant: 0 },
      indemnite_licenciement: { montant: 0 },
      total: 70009.17,
    }
    const r = aggregateBulletinFromBreakdown(breakdown)
    expect(r.special_allowance_1).toBeCloseTo(46426.15, 2)
    expect(r.brut).toBeCloseTo(70009.17, 1)
    expect(validateBreakdownCovered(breakdown, r)).toBeNull()
  })

  it('Alicia DESIRE (OCC) : licenciement, préavis 31k, retenues 45k', () => {
    const breakdown: BreakdownDepart = {
      salaire_prorata: { montant: 18142.26 },
      allocations_prorata: { montant: 0 },
      conges_al: { montant: 0 },
      conges_sl: { montant: 0 },
      conges_vl: { montant: 0 },
      treizieme_mois: { montant: 13018.75 },
      preavis: { montant: 31245 },
      indemnite_licenciement: { montant: 0 },
      total: 62406.01,
    }
    const r = aggregateBulletinFromBreakdown(breakdown, { retenuesManuelles: 45721.13 })
    expect(r.special_allowance_1).toBe(0)
    expect(r.departure_notice).toBe(31245)
    // brut = 18142.26 + 0 + 0 + (13018.75 - 45721.13) + 31245 + 0 = 16684.88
    expect(r.brut).toBeCloseTo(16684.88, 1)
    // breakdown.total devrait matcher brut + retenues
    expect(validateBreakdownCovered(breakdown, r, 45721.13)).toBeNull()
  })
})

describe('aggregateBulletinFromBreakdown — REGRESSION GUARDS', () => {
  it('conges_vl seul → DOIT remonter dans special_allowance_1 (anti-bug Mélanie)', () => {
    const breakdown: BreakdownDepart = {
      conges_vl: { montant: 12345 },
    }
    const r = aggregateBulletinFromBreakdown(breakdown)
    expect(r.special_allowance_1).toBe(12345)
    expect(r.brut).toBeCloseTo(12345, 2)
  })

  it('conges_al seul → special_allowance_1', () => {
    const r = aggregateBulletinFromBreakdown({ conges_al: { montant: 5000 } })
    expect(r.special_allowance_1).toBe(5000)
  })

  it('conges_sl seul → special_allowance_1', () => {
    const r = aggregateBulletinFromBreakdown({ conges_sl: { montant: 3000 } })
    expect(r.special_allowance_1).toBe(3000)
  })

  it('AL + SL + VL combinés → somme des 3 dans special_allowance_1', () => {
    const r = aggregateBulletinFromBreakdown({
      conges_al: { montant: 1000 },
      conges_sl: { montant: 2000 },
      conges_vl: { montant: 3000 },
    })
    expect(r.special_allowance_1).toBe(6000)
  })

  it('Tous composants à 1000 → brut = 8000 (AL+SL+VL fusionnés)', () => {
    const breakdown: BreakdownDepart = {
      salaire_prorata: { montant: 1000 },
      allocations_prorata: { montant: 1000 },
      conges_al: { montant: 1000 },
      conges_sl: { montant: 1000 },
      conges_vl: { montant: 1000 },
      treizieme_mois: { montant: 1000 },
      preavis: { montant: 1000 },
      indemnite_licenciement: { montant: 1000 },
    }
    const r = aggregateBulletinFromBreakdown(breakdown)
    // 1000(salaire) + 1000(transport) + 3000(AL+SL+VL) + 1000(13e) + 1000(préavis) + 1000(indemnité) = 8000
    expect(r.brut).toBeCloseTo(8000, 2)
  })

  it('breakdown vide / null → bulletin à 0 sans erreur', () => {
    expect(aggregateBulletinFromBreakdown(null).brut).toBe(0)
    expect(aggregateBulletinFromBreakdown(undefined).brut).toBe(0)
    expect(aggregateBulletinFromBreakdown({}).brut).toBe(0)
  })

  it('primes extra ajoutent à special_allowance_2', () => {
    const r = aggregateBulletinFromBreakdown(
      { treizieme_mois: { montant: 5000 } },
      { primesExtra: 1500 },
    )
    expect(r.special_allowance_2).toBe(6500)
  })

  it('retenues manuelles soustraites de special_allowance_2', () => {
    const r = aggregateBulletinFromBreakdown(
      { treizieme_mois: { montant: 5000 } },
      { retenuesManuelles: 2000 },
    )
    expect(r.special_allowance_2).toBe(3000)
  })
})

describe('validateBreakdownCovered — sentinelle anti-composant orphelin', () => {
  it('détecte écart si breakdown.total > somme câblée', () => {
    // Simule un breakdown qui aurait un composant fantôme (ex. futur
    // prime_anciennete non câblé) — le total annoncé serait alors > brut câblé.
    const breakdown: BreakdownDepart = {
      conges_al: { montant: 5000 },
      total: 8000, // +3000 fantômes
    }
    const r = aggregateBulletinFromBreakdown(breakdown)
    const msg = validateBreakdownCovered(breakdown, r)
    expect(msg).not.toBeNull()
    expect(msg).toContain('écart')
    expect(msg).toMatch(/n'est pas câblé|non câblé/)
  })

  it('OK si écart < 1 MUR (arrondi acceptable)', () => {
    const breakdown: BreakdownDepart = {
      conges_al: { montant: 5000.45 },
      total: 5000, // arrondi à 50 cents près
    }
    const r = aggregateBulletinFromBreakdown(breakdown)
    expect(validateBreakdownCovered(breakdown, r)).toBeNull()
  })

  it('OK si breakdown.total absent (legacy)', () => {
    const breakdown: BreakdownDepart = {
      conges_al: { montant: 5000 },
    }
    const r = aggregateBulletinFromBreakdown(breakdown)
    expect(validateBreakdownCovered(breakdown, r)).toBeNull()
  })
})
