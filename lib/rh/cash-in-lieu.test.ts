import { describe, it, expect } from 'vitest'
import { calculerMontantCashInLieu, JOURS_OUVRES_PAR_MOIS } from './cash-in-lieu'

describe('JOURS_OUVRES_PAR_MOIS', () => {
  it('is 22', () => {
    expect(JOURS_OUVRES_PAR_MOIS).toBe(22)
  })
})

describe('calculerMontantCashInLieu', () => {
  it('computes daily and total amount correctly', () => {
    const result = calculerMontantCashInLieu(22000, 5)
    expect(result.montantParJour).toBe(1000)
    expect(result.montantTotal).toBe(5000)
  })

  it('rounds to 2 decimals', () => {
    // 15000 / 22 = 681.818... → 681.82
    const result = calculerMontantCashInLieu(15000, 3)
    expect(result.montantParJour).toBe(681.82)
    expect(result.montantTotal).toBe(2045.46)
  })

  it('returns 0 for 0 salary', () => {
    const result = calculerMontantCashInLieu(0, 5)
    expect(result.montantParJour).toBe(0)
    expect(result.montantTotal).toBe(0)
  })

  it('returns 0 for 0 days', () => {
    const result = calculerMontantCashInLieu(20000, 0)
    expect(result.montantParJour).toBeGreaterThan(0)
    expect(result.montantTotal).toBe(0)
  })

  it('accepts custom joursOuvresParMois', () => {
    // 24000 / 24 = 1000 per day
    const result = calculerMontantCashInLieu(24000, 2, 24)
    expect(result.montantParJour).toBe(1000)
    expect(result.montantTotal).toBe(2000)
  })
})
