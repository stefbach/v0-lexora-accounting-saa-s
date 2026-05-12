import { describe, it, expect } from 'vitest'
import { computeLeasePresentValue, qualifiesForExemption, generateAmortizationSchedule, buildLeasePaymentEntries, LOW_VALUE_THRESHOLD_USD, SHORT_TERM_THRESHOLD_MONTHS } from './leases-ifrs16'

describe('IFRS 16 — computeLeasePresentValue', () => {
  it('PV positive pour lease avec taux > 0', () => {
    // 1000/mois sur 60 mois à 6%/an → PV ≈ 51,725 (en avance) ou 51,725 / (1+r)
    const pv = computeLeasePresentValue({ monthlyPayment: 1000, termMonths: 60, annualRatePct: 6, paymentInAdvance: true })
    expect(pv).toBeGreaterThan(50_000)
    expect(pv).toBeLessThan(53_000)
  })
  it('Taux 0% → PV = PMT × n', () => {
    expect(computeLeasePresentValue({ monthlyPayment: 1000, termMonths: 60, annualRatePct: 0 })).toBe(60_000)
  })
  it('En avance > arrears (de facteur 1+r)', () => {
    const advance = computeLeasePresentValue({ monthlyPayment: 1000, termMonths: 60, annualRatePct: 6, paymentInAdvance: true })
    const arrears = computeLeasePresentValue({ monthlyPayment: 1000, termMonths: 60, annualRatePct: 6, paymentInAdvance: false })
    expect(advance).toBeGreaterThan(arrears)
  })
})

describe('IFRS 16 — qualifiesForExemption', () => {
  it('shortTerm si ≤ 12 mois', () => {
    expect(qualifiesForExemption({ termMonths: 12 }).shortTerm).toBe(true)
    expect(qualifiesForExemption({ termMonths: 13 }).shortTerm).toBe(false)
  })
  it('lowValue si actif < USD 5,000', () => {
    expect(qualifiesForExemption({ termMonths: 60, assetValueUsd: 4_000 }).lowValue).toBe(true)
    expect(qualifiesForExemption({ termMonths: 60, assetValueUsd: 6_000 }).lowValue).toBe(false)
  })
})

describe('IFRS 16 — generateAmortizationSchedule', () => {
  it('génère N périodes', () => {
    const sched = generateAmortizationSchedule({
      monthlyPayment: 1000, termMonths: 12, annualRatePct: 6,
      commencementDate: new Date('2025-01-01'),
    })
    expect(sched).toHaveLength(12)
  })
  it('le solde final est proche de 0', () => {
    const sched = generateAmortizationSchedule({
      monthlyPayment: 1000, termMonths: 24, annualRatePct: 5,
      commencementDate: new Date('2025-01-01'),
    })
    expect(sched[23].liabilityBalance).toBeLessThan(10)  // arrondi près de 0
  })
  it('intérêts dégressifs, principal croissant', () => {
    const sched = generateAmortizationSchedule({
      monthlyPayment: 1000, termMonths: 12, annualRatePct: 6,
      commencementDate: new Date('2025-01-01'),
    })
    expect(sched[0].interestAmount).toBeGreaterThan(sched[11].interestAmount)
    expect(sched[0].principalAmount).toBeLessThan(sched[11].principalAmount)
  })
})

describe('IFRS 16 — buildLeasePaymentEntries', () => {
  it('5 écritures par période (principal + intérêts + bank + amort RoU + cumul)', () => {
    const entries = buildLeasePaymentEntries({
      periodEntry: { periodNumber: 1, periodDate: new Date('2025-01-01'), paymentAmount: 1000, interestAmount: 50, principalAmount: 950, liabilityBalance: 49_050 },
      totalLeaseTermMonths: 60, rouInitialValue: 51_725,
    })
    expect(entries).toHaveLength(5)
    expect(entries.find(e => e.compte === '1752')?.debit_mur).toBe(950)
    expect(entries.find(e => e.compte === '6611')?.debit_mur).toBe(50)
    expect(entries.find(e => e.compte === '512')?.credit_mur).toBe(1000)
    expect(entries.find(e => e.compte === '6811')?.debit_mur).toBeGreaterThan(0)
    expect(entries.find(e => e.compte === '28151')?.credit_mur).toBeGreaterThan(0)
  })
})

describe('IFRS 16 — constants', () => {
  it('seuils corrects', () => {
    expect(LOW_VALUE_THRESHOLD_USD).toBe(5_000)
    expect(SHORT_TERM_THRESHOLD_MONTHS).toBe(12)
  })
})
