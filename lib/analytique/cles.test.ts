import { describe, it, expect } from 'vitest'
import { normalizeWeights, validateClePayload } from './cles'
import { splitByPercentages } from './ventilation'

describe('normalizeWeights', () => {
  it('normalise des poids en % (Σ = 100)', () => {
    const p = normalizeWeights([
      { section_analytique_id: 'a', poids: 30 },
      { section_analytique_id: 'b', poids: 10 },
    ])
    expect(p.map((x) => x.pct)).toEqual([75, 25])
    expect(p.reduce((s, x) => s + x.pct, 0)).toBe(100)
  })
  it('surface : 120/80/50 m² → % ; le reste tombe sur la dernière', () => {
    const p = normalizeWeights([
      { section_analytique_id: 'a', poids: 120 },
      { section_analytique_id: 'b', poids: 80 },
      { section_analytique_id: 'c', poids: 50 },
    ])
    expect(p.reduce((s, x) => s + x.pct, 0)).toBe(100)
    expect(p).toHaveLength(3)
  })
  it('ignore les poids nuls/sections vides', () => {
    const p = normalizeWeights([
      { section_analytique_id: 'a', poids: 100 },
      { section_analytique_id: '', poids: 50 },
      { section_analytique_id: 'b', poids: 0 },
    ])
    expect(p).toHaveLength(1)
    expect(p[0].pct).toBe(100)
  })
})

describe('clé → répartition d’un montant (via splitByPercentages)', () => {
  it("répartit un loyer de 30000 sur 50/30/20 sans perte au centime", () => {
    const pct = normalizeWeights([
      { section_analytique_id: 'atelier', poids: 50 },
      { section_analytique_id: 'bureau', poids: 30 },
      { section_analytique_id: 'magasin', poids: 20 },
    ])
    const alloc = splitByPercentages(30000, pct)
    expect(alloc.reduce((s, a) => s + a.montant, 0)).toBe(30000)
    expect(alloc.find((a) => a.section_analytique_id === 'atelier')?.montant).toBe(15000)
  })
})

describe('validateClePayload', () => {
  it('valide une clé correcte (code en majuscules)', () => {
    const r = validateClePayload({ code: 'loyer', libelle: 'Loyer', base: 'surface', lignes: [{ section_analytique_id: 'a', poids: 10 }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.code).toBe('LOYER')
  })
  it('refuse sans ligne pondérée', () => {
    expect(validateClePayload({ code: 'X', libelle: 'Y', base: 'pourcentage', lignes: [] }).ok).toBe(false)
  })
  it('refuse une section en double', () => {
    const r = validateClePayload({ code: 'X', libelle: 'Y', lignes: [
      { section_analytique_id: 'a', poids: 1 }, { section_analytique_id: 'a', poids: 2 },
    ] })
    expect(r.ok).toBe(false)
  })
})
