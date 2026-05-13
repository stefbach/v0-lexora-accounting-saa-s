import { describe, it, expect } from 'vitest'
import { isInScope, computeEtr, computeSbie, computeTopUp, PILLAR_TWO_REVENUE_THRESHOLD_EUR, MINIMUM_ETR_PCT } from './pillar-two'

describe('Pillar Two — isInScope', () => {
  it('TRUE si CA consolidé ≥ €750M', () => {
    expect(isInScope(800_000_000)).toBe(true)
    expect(isInScope(PILLAR_TWO_REVENUE_THRESHOLD_EUR)).toBe(true)
  })
  it('FALSE en-dessous du seuil', () => {
    expect(isInScope(700_000_000)).toBe(false)
  })
})

describe('Pillar Two — computeEtr', () => {
  it('ratio impôts couverts / GloBE income', () => {
    expect(computeEtr(1_000_000, 30_000)).toBe(3)   // 3%
    expect(computeEtr(1_000_000, 150_000)).toBe(15)
  })
  it('0 si globe income ≤ 0', () => {
    expect(computeEtr(0, 100_000)).toBe(0)
  })
})

describe('Pillar Two — computeSbie', () => {
  it('5% payroll + 5% tangibles en 2024+', () => {
    const sbie = computeSbie({ payrollMur: 1_000_000, tangibleAssetsMur: 500_000, year: 2024 })
    expect(sbie).toBe(75_000)  // 50_000 + 25_000
  })
  it('Taux transitionals avant 2024', () => {
    const sbie = computeSbie({ payrollMur: 1_000_000, tangibleAssetsMur: 500_000, year: 2023 })
    expect(sbie).toBe(128_000)  // 9.0% × 1M + 7.6% × 500k
  })
})

describe('Pillar Two — computeTopUp', () => {
  it('Top-up = (15% − ETR) × Excess Profit', () => {
    const r = computeTopUp({
      globeIncomeMur: 1_000_000, coveredTaxesMur: 30_000,    // ETR = 3%
      payrollMur: 100_000, tangibleAssetsMur: 50_000,        // SBIE = 7,500
      year: 2024,
    })
    expect(r.etrPct).toBe(3)
    expect(r.sbie).toBe(7_500)
    expect(r.excess).toBe(992_500)
    expect(r.topUpMur).toBeCloseTo(992_500 * 0.12, 0)  // 119,100
    expect(r.isBelowMinimum).toBe(true)
  })

  it('Pas de top-up si ETR ≥ 15%', () => {
    const r = computeTopUp({
      globeIncomeMur: 1_000_000, coveredTaxesMur: 200_000,   // ETR 20%
      payrollMur: 100_000, tangibleAssetsMur: 50_000,
      year: 2024,
    })
    expect(r.topUpMur).toBe(0)
    expect(r.isBelowMinimum).toBe(false)
  })
})

describe('Pillar Two — constants', () => {
  it('seuil €750M, taux minimum 15%', () => {
    expect(PILLAR_TWO_REVENUE_THRESHOLD_EUR).toBe(750_000_000)
    expect(MINIMUM_ETR_PCT).toBe(15)
  })
})
