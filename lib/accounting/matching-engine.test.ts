import { describe, it, expect } from 'vitest'
import { normalize, tiersScore, toMUR } from './matching-engine'

describe('normalize', () => {
  it('lowercases and removes diacritics', () => {
    expect(normalize('Société')).toBe('societe')
    expect(normalize('HÉLO')).toBe('helo')
  })

  it('strips legal suffixes', () => {
    expect(normalize('ACME Ltd')).toBe('acme')
    expect(normalize('Solutions SARL')).toBe('solutions')
    expect(normalize('My Company SA')).toBe('my company')
  })

  it('replaces punctuation with spaces and collapses', () => {
    expect(normalize('Hello, World!')).toBe('hello world')
    expect(normalize('A-B/C')).toBe('a b c')
  })

  it('returns empty string for empty/null-ish input', () => {
    expect(normalize('')).toBe('')
    expect(normalize(null as any)).toBe('')
  })
})

describe('tiersScore', () => {
  it('returns 1 for identical normalized strings', () => {
    expect(tiersScore('ACME Corp', 'acme corp')).toBe(1)
  })

  it('returns 0.9 when one is a substring of the other', () => {
    expect(tiersScore('Mauritius Commercial Bank', 'MCB')).toBe(0)
    expect(tiersScore('Rogers Aviation', 'Rogers')).toBe(0.9)
  })

  it('returns Jaccard score for partially matching words', () => {
    const score = tiersScore('Digital Data Solutions', 'Digital Solutions Systems')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('returns 0 for completely different strings', () => {
    expect(tiersScore('Apple', 'Microsoft')).toBe(0)
  })

  it('returns 0 for empty strings', () => {
    expect(tiersScore('', 'test')).toBe(0)
    expect(tiersScore('test', '')).toBe(0)
  })
})

describe('toMUR', () => {
  const rates = { EUR: 46.5, USD: 44.8 }

  it('returns amount unchanged for MUR', () => {
    expect(toMUR(1000, 'MUR', rates)).toBe(1000)
    expect(toMUR(1000, null, rates)).toBe(1000)
  })

  it('converts EUR to MUR by multiplying', () => {
    expect(toMUR(100, 'EUR', rates)).toBe(4650)
  })

  it('converts USD to MUR by multiplying', () => {
    expect(toMUR(100, 'USD', rates)).toBe(4480)
  })

  it('accepts object-style tx signature', () => {
    const tx = { devise: 'EUR', montant_origine: 100 }
    expect(toMUR(100, tx, 'MUR', rates)).toBe(4650)
  })

  it('falls back to 1x when currency not in rates', () => {
    expect(toMUR(500, 'XYZ', {})).toBe(500)
  })
})
