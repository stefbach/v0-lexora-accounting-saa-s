import { describe, it, expect } from 'vitest'

describe('Forex Real-Time Rates', () => {
  it('XOF/EUR uses fixed peg', async () => {
    const { getExchangeRate } = await import('../real-time-rates')
    const rate = await getExchangeRate('XOF', 'EUR')
    expect(rate.isFixedPeg).toBe(true)
    expect(rate.rate).toBeCloseTo(1 / 655.957, 6)
  })

  it('XAF/XOF uses 1:1 (same EUR peg)', async () => {
    const { getExchangeRate } = await import('../real-time-rates')
    const rate = await getExchangeRate('XAF', 'XOF')
    expect(rate.isFixedPeg).toBe(true)
    expect(rate.rate).toBeCloseTo(1, 6)
  })

  it('returns identity for same currency', async () => {
    const { getExchangeRate } = await import('../real-time-rates')
    const rate = await getExchangeRate('USD', 'USD')
    expect(rate.rate).toBe(1)
  })

  it('SUPPORTED_CURRENCIES includes major currencies', async () => {
    const { SUPPORTED_CURRENCIES } = await import('../real-time-rates')
    expect(SUPPORTED_CURRENCIES).toContain('USD')
    expect(SUPPORTED_CURRENCIES).toContain('EUR')
    expect(SUPPORTED_CURRENCIES).toContain('MUR')
    expect(SUPPORTED_CURRENCIES).toContain('XOF')
    expect(SUPPORTED_CURRENCIES).toContain('CNY')
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThan(50)
  })

  it('converts amount with rate', async () => {
    const { convertWithLiveRate } = await import('../real-time-rates')
    const result = await convertWithLiveRate(1000, 'XOF', 'XOF')
    expect(result.amount).toBe(1000)
  })
})
