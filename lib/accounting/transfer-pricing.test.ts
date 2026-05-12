import { describe, it, expect } from 'vitest'
import { getDocumentationTier, isArmsLength, recommendTpMethod, isCbcrRequired, TP_THRESHOLD_MUR_REQUIRED, CBCR_THRESHOLD_EUR } from './transfer-pricing'

describe('TP — documentation tiers', () => {
  it('documentation_required ≥ 5M MUR', () => {
    expect(getDocumentationTier(6_000_000)).toBe('documentation_required')
    expect(getDocumentationTier(5_000_000)).toBe('documentation_required')
  })
  it('recommended entre 1M et 5M', () => {
    expect(getDocumentationTier(2_500_000)).toBe('recommended')
  })
  it('optional < 1M', () => {
    expect(getDocumentationTier(500_000)).toBe('optional')
  })
})

describe('TP — isArmsLength', () => {
  it('TRUE si prix dans la fourchette ±5% par défaut', () => {
    expect(isArmsLength(100, 95, 105)).toBe(true)
    expect(isArmsLength(110, 95, 105)).toBe(true)  // 110 ≤ 105 × 1.05 = 110.25
  })
  it('FALSE si trop loin', () => {
    expect(isArmsLength(150, 95, 105)).toBe(false)
    expect(isArmsLength(50, 95, 105)).toBe(false)
  })
})

describe('TP — recommendTpMethod', () => {
  it('CUP pour commodities / goods', () => {
    expect(recommendTpMethod('Sale of goods')).toBe('CUP')
    expect(recommendTpMethod('commodity trading')).toBe('CUP')
  })
  it('RPM pour resale / distribution', () => {
    expect(recommendTpMethod('Resale of products')).toBe('RPM')
  })
  it('TNMM par défaut (fallback)', () => {
    expect(recommendTpMethod('Generic services')).toBe('TNMM')
  })
  it('PSM pour activités intégrées', () => {
    expect(recommendTpMethod('Integrated R&D activity')).toBe('PSM')
  })
})

describe('TP — CbCR threshold', () => {
  it('TRUE si CA consolidé ≥ €750M', () => {
    expect(isCbcrRequired(800_000_000)).toBe(true)
    expect(isCbcrRequired(CBCR_THRESHOLD_EUR)).toBe(true)
  })
  it('FALSE si en-dessous', () => {
    expect(isCbcrRequired(500_000_000)).toBe(false)
  })
})

describe('TP — constants', () => {
  it('seuil documentation 5M MUR', () => {
    expect(TP_THRESHOLD_MUR_REQUIRED).toBe(5_000_000)
  })
})
