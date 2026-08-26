import { describe, it, expect } from 'vitest'
import {
  validateSectionPayload,
  computeSectionPnl,
  groupBySection,
  SECTION_TYPES,
} from './sections'

describe('validateSectionPayload', () => {
  it('accepte un centre de coût valide (code normalisé en majuscules)', () => {
    const r = validateSectionPayload({ code: 'cc-01', libelle: 'Atelier', type: 'centre_cout' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.code).toBe('CC-01')
  })
  it('accepte les 4 types de section', () => {
    for (const type of ['chantier', 'production', 'centre_cout', 'projet'] as const) {
      expect(validateSectionPayload({ code: 'X', libelle: 'Y', type }).ok).toBe(true)
    }
  })
  it('refuse un type inconnu', () => {
    expect(validateSectionPayload({ code: 'X', libelle: 'Y', type: 'foo' }).ok).toBe(false)
  })
  it('code et libellé requis', () => {
    expect(validateSectionPayload({ libelle: 'Y', type: 'projet' }).ok).toBe(false)
    expect(validateSectionPayload({ code: 'X', type: 'projet' }).ok).toBe(false)
  })
  it('budget négatif refusé', () => {
    expect(validateSectionPayload({ code: 'X', libelle: 'Y', type: 'projet', budget_montant: -5 }).ok).toBe(false)
  })
  it('les 4 types sont bien déclarés', () => {
    expect(SECTION_TYPES).toEqual(['chantier', 'production', 'centre_cout', 'projet'])
  })
})

describe('computeSectionPnl', () => {
  it('classe 7 → produits (crédit − débit), classe 6 → charges (débit − crédit)', () => {
    const pnl = computeSectionPnl([
      { numero_compte: '706', debit_mur: 0, credit_mur: 100000 }, // produit
      { numero_compte: '706', debit_mur: 5000, credit_mur: 0 },   // avoir sur produit
      { numero_compte: '6411', debit_mur: 40000, credit_mur: 0 }, // charge
      { numero_compte: '6037', debit_mur: 20000, credit_mur: 0 }, // charge
      { numero_compte: '512', debit_mur: 95000, credit_mur: 0 },  // trésorerie ignorée
    ])
    expect(pnl.produits).toBe(95000)
    expect(pnl.charges).toBe(60000)
    expect(pnl.marge).toBe(35000)
    expect(pnl.marge_pct).toBeCloseTo(36.84, 1)
    expect(pnl.nb_ecritures).toBe(5)
  })
  it('gère les montants en chaîne (NUMERIC Postgres)', () => {
    const pnl = computeSectionPnl([
      { numero_compte: '701', debit_mur: '0', credit_mur: '1234.50' },
      { numero_compte: '601', debit_mur: '1000.25', credit_mur: '0' },
    ])
    expect(pnl.produits).toBe(1234.5)
    expect(pnl.charges).toBe(1000.25)
    expect(pnl.marge).toBe(234.25)
  })
  it('produits nuls → marge_pct null', () => {
    const pnl = computeSectionPnl([{ numero_compte: '6411', debit_mur: 100, credit_mur: 0 }])
    expect(pnl.produits).toBe(0)
    expect(pnl.marge).toBe(-100)
    expect(pnl.marge_pct).toBeNull()
  })
  it('liste vide → tout à zéro', () => {
    expect(computeSectionPnl([])).toEqual({ produits: 0, charges: 0, marge: 0, marge_pct: null, nb_ecritures: 0 })
  })
})

describe('groupBySection', () => {
  it('regroupe par section, null séparé', () => {
    const m = groupBySection([
      { section_analytique_id: 'a', x: 1 },
      { section_analytique_id: 'a', x: 2 },
      { section_analytique_id: null, x: 3 },
    ])
    expect(m.get('a')?.length).toBe(2)
    expect(m.get(null)?.length).toBe(1)
  })
})
