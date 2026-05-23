import { describe, it, expect } from 'vitest'
import { effectiveTaxRatePct, taxablePortion, computeFtcCap, requiresSubstance, autoClassifyPer, CORPORATE_TAX_RATE_PCT } from './per'

describe('PER — effectiveTaxRatePct', () => {
  it('retourne 3% pour foreign_dividends avec substance', () => {
    expect(effectiveTaxRatePct('foreign_dividends', true)).toBeCloseTo(3, 2)  // 15% × 20%
  })
  it('retourne 15% si pas de substance (PER refusé)', () => {
    expect(effectiveTaxRatePct('foreign_dividends', false)).toBe(15)
  })
  it('retourne 15% pour not_eligible quelle que soit substance', () => {
    expect(effectiveTaxRatePct('not_eligible', true)).toBe(15)
    expect(effectiveTaxRatePct('not_eligible', false)).toBe(15)
  })
})

describe('PER — taxablePortion', () => {
  it('retourne 0.2 (20%) pour PER-éligible avec substance', () => {
    expect(taxablePortion('foreign_interest', true)).toBeCloseTo(0.2)
  })
  it('retourne 1.0 si pas de substance', () => {
    expect(taxablePortion('foreign_royalties', false)).toBe(1.0)
  })
})

describe('PER — computeFtcCap', () => {
  it('limite au min entre impôt étranger et impôt Maurice', () => {
    // 1000 USD revenu, 200 USD impôt étranger, PER 3% Maurice = 30
    expect(computeFtcCap(1000, 200, 'foreign_dividends', true)).toBeCloseTo(30, 1)
    // 1000 USD revenu, 20 USD impôt étranger, PER 3% Maurice = 30 → cap 20
    expect(computeFtcCap(1000, 20, 'foreign_dividends', true)).toBeCloseTo(20, 1)
  })
  it('non éligible : cap = min(taxPaid, revenu × 15%)', () => {
    expect(computeFtcCap(1000, 200, 'not_eligible', true)).toBe(150)
  })
})

describe('PER — autoClassifyPer', () => {
  it('classe dividendes étrangers via compte 761', () => {
    expect(autoClassifyPer({ numero_compte: '761', tiers_country_iso: 'ZA' })).toBe('foreign_dividends')
  })
  it('classe intérêts via mot-clé dans description', () => {
    expect(autoClassifyPer({ description: 'Interest on loan', tiers_country_iso: 'IN' })).toBe('foreign_interest')
  })
  it('tiers MU → not_eligible', () => {
    expect(autoClassifyPer({ numero_compte: '761', tiers_country_iso: 'MU' })).toBe('not_eligible')
  })
})

describe('PER — requiresSubstance', () => {
  it('TRUE pour toutes catégories PER-éligibles', () => {
    expect(requiresSubstance('foreign_dividends')).toBe(true)
    expect(requiresSubstance('foreign_interest')).toBe(true)
  })
  it('FALSE pour not_eligible', () => {
    expect(requiresSubstance('not_eligible')).toBe(false)
  })
})

describe('PER — constants', () => {
  it('IS Maurice = 15%', () => {
    expect(CORPORATE_TAX_RATE_PCT).toBe(15)
  })
})
