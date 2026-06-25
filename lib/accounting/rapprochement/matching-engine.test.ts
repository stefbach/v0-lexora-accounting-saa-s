import { describe, it, expect } from 'vitest'
import {
  toMURWithRates,
  normalizeTiers,
  advancedTiersScore,
  wordOverlap,
  isSelfMatch,
  dateDiffDays,
  isBankFeeLibelle,
  BANK_FEE_PATTERNS,
} from './matching-engine'

const RATES = { EUR: 46.5, USD: 44.8 }

describe('toMURWithRates', () => {
  it('returns amount unchanged for MUR', () => {
    expect(toMURWithRates(1000, 'MUR', RATES)).toBe(1000)
    expect(toMURWithRates(1000, null as any, RATES)).toBe(1000)
  })

  it('converts EUR to MUR', () => {
    expect(toMURWithRates(100, 'EUR', RATES)).toBe(4650)
  })

  it('accepts tx object with devise', () => {
    expect(toMURWithRates(100, { devise: 'USD' }, RATES)).toBe(4480)
  })

  it('falls back to 1x for unknown currency', () => {
    expect(toMURWithRates(500, 'XYZ', {})).toBe(500)
  })
})

describe('normalizeTiers', () => {
  it('removes corporate suffixes at end', () => {
    expect(normalizeTiers('ACME Ltd')).toBe('acme')
    expect(normalizeTiers('Solutions SARL')).toBe('solutions')
  })

  it('removes special characters', () => {
    expect(normalizeTiers('A-B & C')).toBe('ab  c')
  })

  it('lowercases', () => {
    expect(normalizeTiers('GOOGLE')).toBe('google')
  })
})

describe('advancedTiersScore', () => {
  it('returns 1 for identical strings', () => {
    expect(advancedTiersScore('Rogers Aviation', 'Rogers Aviation')).toBe(1)
  })

  it('returns 0.9 when one includes the other', () => {
    expect(advancedTiersScore('Rogers', 'Rogers Aviation')).toBe(0.9)
  })

  it('returns 0 for empty strings', () => {
    expect(advancedTiersScore('', 'test')).toBe(0)
  })

  it('returns Jaccard score for partial overlap', () => {
    const s = advancedTiersScore('Digital Data Solutions', 'Digital Solutions Systems')
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})

describe('wordOverlap', () => {
  it('returns 1 for identical names', () => {
    expect(wordOverlap('Mauritius Telecom', 'Mauritius Telecom')).toBe(1)
  })

  it('returns 0 for empty', () => {
    expect(wordOverlap('', 'test')).toBe(0)
  })

  it('returns partial score for partial overlap', () => {
    const s = wordOverlap('Mauritius Telecom Limited', 'Mauritius Bank')
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})

describe('isSelfMatch', () => {
  it('returns true when tiers matches company name', () => {
    expect(isSelfMatch('digital data solutions', 'digital data solutions')).toBe(true)
  })

  it('returns false for different companies', () => {
    expect(isSelfMatch('acme corporation', 'rogers aviation')).toBe(false)
  })

  it('returns false for empty strings', () => {
    expect(isSelfMatch('', 'test')).toBe(false)
  })
})

describe('dateDiffDays', () => {
  it('returns 0 for same date', () => {
    expect(dateDiffDays('2026-01-15', '2026-01-15')).toBe(0)
  })

  it('returns 1 for adjacent days', () => {
    expect(dateDiffDays('2026-01-14', '2026-01-15')).toBe(1)
  })

  it('returns 999 for invalid dates', () => {
    expect(dateDiffDays('invalid', '2026-01-15')).toBe(999)
    expect(dateDiffDays('2026-01-15', '')).toBe(999)
  })
})

describe('isBankFeeLibelle', () => {
  it('matches known bank fee patterns', () => {
    expect(isBankFeeLibelle('Service Fee Jan 2026')).toBe(true)
    expect(isBankFeeLibelle('Banking Subs Fee')).toBe(true)
    expect(isBankFeeLibelle('frais virement')).toBe(true)
  })

  it('returns false for normal transactions', () => {
    expect(isBankFeeLibelle('Virement client ACME')).toBe(false)
    expect(isBankFeeLibelle('Paiement facture 123')).toBe(false)
  })

  it('returns false for null/empty', () => {
    expect(isBankFeeLibelle(null)).toBe(false)
    expect(isBankFeeLibelle('')).toBe(false)
  })

  it('BANK_FEE_PATTERNS has expected entries', () => {
    expect(BANK_FEE_PATTERNS).toContain('service fee')
    expect(BANK_FEE_PATTERNS).toContain('frais')
    expect(BANK_FEE_PATTERNS.length).toBeGreaterThan(5)
  })
})
