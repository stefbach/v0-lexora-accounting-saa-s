import { describe, it, expect } from 'vitest'
import {
  classifyStage,
  calculateECL,
  DEFAULT_PD_BY_RATING,
  DEFAULT_LGD_BY_COLLATERAL,
} from '@/lib/ifrs/ifrs9-ecl-engine'
import { computeTds, TDS_RATES, autoClassifyTds } from '@/lib/accounting/tds'

/**
 * Audit des logiques de calcul — IFRS 9 ECL + TDS Maurice.
 * Vérifie que les formules produisent les bons chiffres (pas juste que le
 * code tourne).
 */

describe('IFRS 9 — classification des stages', () => {
  const base = {
    counterpartyId: 'c1', exposureAtDefault: 100000, currency: 'MUR',
    daysPastDue: 0, creditRating: 'BB', collateralType: 'NONE' as const,
    isCreditImpaired: false, hasSICR: false,
  }
  it('Stage 1 quand performant (DPD < 30, pas de SICR)', () => {
    expect(classifyStage({ ...base, daysPastDue: 10 })).toBe('STAGE_1')
  })
  it('Stage 2 dès SICR ou DPD >= 30', () => {
    expect(classifyStage({ ...base, daysPastDue: 45 })).toBe('STAGE_2')
    expect(classifyStage({ ...base, hasSICR: true })).toBe('STAGE_2')
  })
  it('Stage 3 quand impairé ou DPD >= 90', () => {
    expect(classifyStage({ ...base, daysPastDue: 120 })).toBe('STAGE_3')
    expect(classifyStage({ ...base, isCreditImpaired: true })).toBe('STAGE_3')
  })
})

describe('IFRS 9 — formule ECL = PD × LGD × EAD', () => {
  const noMacro = [{ name: 'BASE', weight: 1, gdpGrowth: 0.03, unemploymentRate: 0.07, inflationRate: 0.02 }]

  it('Stage 1 : ECL = basePD × LGD × EAD (macro neutre = 1)', () => {
    const r = calculateECL({
      counterpartyId: 'c', exposureAtDefault: 100000, currency: 'MUR',
      daysPastDue: 0, creditRating: 'BB', collateralType: 'NONE',
      isCreditImpaired: false, hasSICR: false,
    }, noMacro)
    // basePD BB = 0.009, LGD NONE = 0.65, EAD = 100000
    expect(r.stage).toBe('STAGE_1')
    expect(r.pd).toBeCloseTo(0.009, 5)
    expect(r.lgd).toBeCloseTo(0.65, 5)
    expect(r.ecl).toBeCloseTo(0.009 * 0.65 * 100000, 2) // = 585
  })

  it('Stage 3 : PD = 100% → ECL = LGD × EAD', () => {
    const r = calculateECL({
      counterpartyId: 'c', exposureAtDefault: 50000, currency: 'MUR',
      daysPastDue: 100, creditRating: 'B', collateralType: 'NONE',
      isCreditImpaired: false, hasSICR: false,
    }, noMacro)
    expect(r.stage).toBe('STAGE_3')
    expect(r.pd).toBeCloseTo(1, 5)
    expect(r.ecl).toBeCloseTo(0.65 * 50000, 2) // = 32500
  })

  it('Collatéral réduit la LGD', () => {
    const r = calculateECL({
      counterpartyId: 'c', exposureAtDefault: 100000, currency: 'MUR',
      daysPastDue: 0, creditRating: 'BB', collateralType: 'PROPERTY',
      collateralValue: 100000, isCreditImpaired: false, hasSICR: false,
    }, noMacro)
    // LGD PROPERTY 0.25, couverture 100% → 0.25 × (1 - 1×0.5) = 0.125
    expect(r.lgd).toBeCloseTo(0.125, 5)
  })

  it('Tables PD/LGD conformes (BB=0.9%, D=100%, NONE=65%, CASH=10%)', () => {
    expect(DEFAULT_PD_BY_RATING['BB']).toBe(0.009)
    expect(DEFAULT_PD_BY_RATING['D']).toBe(1.0)
    expect(DEFAULT_LGD_BY_COLLATERAL['NONE']).toBe(0.65)
    expect(DEFAULT_LGD_BY_COLLATERAL['CASH']).toBe(0.10)
  })
})

describe('TDS Maurice — taux + calcul retenue à la source', () => {
  it('Taux conformes ITA §111A', () => {
    expect(TDS_RATES.rent.rate).toBe(5.0)
    expect(TDS_RATES.professional_fees.rate).toBe(3.0)
    expect(TDS_RATES.contract_payments.rate).toBe(0.75)
    expect(TDS_RATES.royalties.rate).toBe(15.0)
    expect(TDS_RATES.management_fees.rate).toBe(5.0)
  })

  it('TDS loyer 50 000 → 2 500 (5%)', () => {
    const r = computeTds(50000, 'rent')
    expect(r.applies).toBe(true)
    expect(r.amount).toBeCloseTo(2500, 2)
  })

  it('TDS honoraires 80 000 → 2 400 (3%)', () => {
    expect(computeTds(80000, 'professional_fees').amount).toBeCloseTo(2400, 2)
  })

  it('Travaux 0,75% : 200 000 → 1 500', () => {
    expect(computeTds(200000, 'contract_payments').amount).toBeCloseTo(1500, 2)
  })

  it('Sous le seuil (loyer < 500) → pas de retenue', () => {
    const r = computeTds(400, 'rent')
    expect(r.applies).toBe(false)
    expect(r.amount).toBe(0)
  })

  it('Auto-classification : compte 6132 → loyer', () => {
    expect(autoClassifyTds({ compte: '6132100', description: 'Loyer bureau janvier' })).toBe('rent')
  })

  it('Auto-classification : avocat → honoraires professionnels', () => {
    expect(autoClassifyTds({ compte: '6226', description: 'Honoraires avocat' })).toBe('professional_fees')
  })
})
