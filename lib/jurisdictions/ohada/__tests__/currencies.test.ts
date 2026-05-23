import { describe, it, expect } from 'vitest'
import { OHADA_CURRENCIES, convertToCurrency, formatOhadaAmount, getCurrencyForCountry } from '../currencies'

describe('OHADA Currencies', () => {
  it('has all OHADA currencies defined', () => {
    expect(OHADA_CURRENCIES.XOF).toBeDefined()
    expect(OHADA_CURRENCIES.XAF).toBeDefined()
    expect(OHADA_CURRENCIES.KMF).toBeDefined()
    expect(OHADA_CURRENCIES.CDF).toBeDefined()
    expect(OHADA_CURRENCIES.GNF).toBeDefined()
  })

  it('XOF is pegged to EUR at 655.957', () => {
    expect(OHADA_CURRENCIES.XOF.pegged?.currency).toBe('EUR')
    expect(OHADA_CURRENCIES.XOF.pegged?.rate).toBe(655.957)
  })

  it('XAF has same EUR peg as XOF', () => {
    expect(OHADA_CURRENCIES.XAF.pegged?.rate).toBe(655.957)
  })

  it('XOF has 0 decimals (no centimes)', () => {
    expect(OHADA_CURRENCIES.XOF.decimals).toBe(0)
  })

  it('CDF (Congo) is floating (no peg)', () => {
    expect(OHADA_CURRENCIES.CDF.pegged).toBeUndefined()
  })

  it('UEMOA countries are mapped to XOF', () => {
    expect(getCurrencyForCountry('SN')?.code).toBe('XOF')
    expect(getCurrencyForCountry('CI')?.code).toBe('XOF')
    expect(getCurrencyForCountry('ML')?.code).toBe('XOF')
  })

  it('CEMAC countries are mapped to XAF', () => {
    expect(getCurrencyForCountry('CM')?.code).toBe('XAF')
    expect(getCurrencyForCountry('GA')?.code).toBe('XAF')
    expect(getCurrencyForCountry('CG')?.code).toBe('XAF')
  })

  it('converts XOF → XOF (identity)', () => {
    expect(convertToCurrency(1000, 'XOF', 'XOF')).toBe(1000)
  })

  it('converts XOF → EUR (1M XOF ≈ 1524 EUR)', () => {
    const eur = convertToCurrency(1000000, 'XOF', 'EUR')
    expect(eur).toBeCloseTo(1524.49, 1)
  })

  it('converts EUR → XAF (1000 EUR = 655957 XAF)', () => {
    const xaf = convertToCurrency(1000, 'EUR', 'XAF')
    expect(xaf).toBeCloseTo(655957, 0)
  })

  it('converts XOF → XAF (same EUR peg = 1:1)', () => {
    const xaf = convertToCurrency(100000, 'XOF', 'XAF')
    expect(xaf).toBeCloseTo(100000, 0)
  })

  it('formats XOF without decimals', () => {
    const formatted = formatOhadaAmount(1234567, 'XOF')
    expect(formatted).not.toContain('.')
    expect(formatted).toContain('CFA')
  })

  it('formats KMF (Comores) without decimals', () => {
    const formatted = formatOhadaAmount(100000, 'KMF')
    expect(formatted).toContain('CF')
  })

  it('throws error for unsupported conversion without rate', () => {
    expect(() => convertToCurrency(1000, 'CDF', 'GNF')).toThrow()
  })
})
