import { describe, it, expect } from 'vitest'
import { ecritureNet, validateAllocations, splitByPercentages } from './ventilation'

describe('ecritureNet', () => {
  it('classe 6 = charge (débit − crédit)', () => {
    expect(ecritureNet('6411', 1000, 0)).toEqual({ nature: 'charge', net: 1000 })
    expect(ecritureNet('606', 1200, 200)).toEqual({ nature: 'charge', net: 1000 })
  })
  it('classe 7 = produit (crédit − débit)', () => {
    expect(ecritureNet('706', 0, 5000)).toEqual({ nature: 'produit', net: 5000 })
  })
  it('autres classes → non ventilable', () => {
    expect(ecritureNet('512', 9000, 0)).toEqual({ nature: 'autre', net: 0 })
    expect(ecritureNet('4457', 0, 150)).toEqual({ nature: 'autre', net: 0 })
  })
  it('accepte des montants en chaîne', () => {
    expect(ecritureNet('6037', '800.50', '0')).toEqual({ nature: 'charge', net: 800.5 })
  })
})

describe('validateAllocations', () => {
  it('accepte une répartition ≤ net', () => {
    const r = validateAllocations(1000, [
      { section_analytique_id: 'a', montant: 600 },
      { section_analytique_id: 'b', montant: 400 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.total).toBe(1000)
  })
  it('accepte une ventilation partielle', () => {
    const r = validateAllocations(1000, [{ section_analytique_id: 'a', montant: 300 }])
    expect(r.ok).toBe(true)
  })
  it('refuse un dépassement', () => {
    const r = validateAllocations(1000, [{ section_analytique_id: 'a', montant: 1200 }])
    expect(r.ok).toBe(false)
  })
  it('refuse une section en double', () => {
    const r = validateAllocations(1000, [
      { section_analytique_id: 'a', montant: 100 },
      { section_analytique_id: 'a', montant: 100 },
    ])
    expect(r.ok).toBe(false)
  })
  it('refuse un montant ≤ 0 ou un net nul', () => {
    expect(validateAllocations(1000, [{ section_analytique_id: 'a', montant: 0 }]).ok).toBe(false)
    expect(validateAllocations(0, [{ section_analytique_id: 'a', montant: 10 }]).ok).toBe(false)
  })
})

describe('splitByPercentages', () => {
  it('répartit par % avec reste d’arrondi sur la dernière part', () => {
    const parts = splitByPercentages(1000, [
      { section_analytique_id: 'a', pct: 33.333 },
      { section_analytique_id: 'b', pct: 33.333 },
      { section_analytique_id: 'c', pct: 33.334 },
    ])
    const total = parts.reduce((s, p) => s + p.montant, 0)
    expect(Math.round(total * 100) / 100).toBe(1000) // pas de perte au centime
    expect(parts).toHaveLength(3)
  })
  it('ignore les parts nulles', () => {
    const parts = splitByPercentages(500, [
      { section_analytique_id: 'a', pct: 100 },
      { section_analytique_id: 'b', pct: 0 },
    ])
    expect(parts).toHaveLength(1)
    expect(parts[0].montant).toBe(500)
  })
})
