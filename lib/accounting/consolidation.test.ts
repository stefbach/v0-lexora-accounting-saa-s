import { describe, it, expect } from 'vitest'
import { recommendConsolidationMethod, computeGoodwill, nciPct, isGoodwillImpaired } from './consolidation'

describe('Consolidation — recommendConsolidationMethod', () => {
  it('full si contrôle (>50% voting)', () => {
    expect(recommendConsolidationMethod(60, null, false)).toBe('full')
    expect(recommendConsolidationMethod(80, 51, false)).toBe('full')
  })
  it('full si contrôle déclaré explicitement', () => {
    expect(recommendConsolidationMethod(40, 40, true)).toBe('full')
  })
  it('equity entre 20 et 50% (influence notable)', () => {
    expect(recommendConsolidationMethod(30, null, false)).toBe('equity')
  })
  it('equity (participation simple) si <20%', () => {
    expect(recommendConsolidationMethod(10, null, false)).toBe('equity')
  })
})

describe('Consolidation — computeGoodwill', () => {
  it('positive si payé plus que la juste valeur', () => {
    // 1000 payés, FV net assets 800 × 100% = 800, goodwill = 200
    expect(computeGoodwill({ acquisitionCostMur: 1000, fairValueNetAssetsMur: 800, pctDetention: 100 })).toBe(200)
  })
  it('proportionnel au pct détention', () => {
    // 1000 payés pour 80% d'une net asset de 1000 → FV attribuable = 800, goodwill = 200
    expect(computeGoodwill({ acquisitionCostMur: 1000, fairValueNetAssetsMur: 1000, pctDetention: 80 })).toBe(200)
  })
  it('négative (bargain purchase) si payé moins', () => {
    expect(computeGoodwill({ acquisitionCostMur: 500, fairValueNetAssetsMur: 1000, pctDetention: 100 })).toBe(-500)
  })
})

describe('Consolidation — nciPct', () => {
  it('100 - pct détention', () => {
    expect(nciPct(80)).toBe(20)
    expect(nciPct(100)).toBe(0)
  })
  it('jamais négatif', () => {
    expect(nciPct(120)).toBe(0)
  })
})

describe('Consolidation — isGoodwillImpaired', () => {
  it('TRUE si recoverable < carrying value (au-delà tolérance 5%)', () => {
    expect(isGoodwillImpaired({ carryingValue: 1000, recoverableAmount: 800 })).toBe(true)
  })
  it('FALSE dans la tolérance', () => {
    expect(isGoodwillImpaired({ carryingValue: 1000, recoverableAmount: 970 })).toBe(false)
  })
})
