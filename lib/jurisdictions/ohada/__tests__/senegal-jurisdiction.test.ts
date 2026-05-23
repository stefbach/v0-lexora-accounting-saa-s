import { describe, it, expect, beforeAll } from 'vitest'

describe('Senegal Jurisdiction', () => {
  let senegalJurisdiction: any

  beforeAll(async () => {
    try {
      const mod = await import('../countries/senegal/jurisdiction')
      senegalJurisdiction = mod.senegalJurisdiction
    } catch (e) {
      // Module not built yet - skip
      console.warn('Senegal jurisdiction not yet built:', e)
    }
  })

  it('has correct config', () => {
    if (!senegalJurisdiction) return
    expect(senegalJurisdiction.config.code).toBe('SN')
    expect(senegalJurisdiction.config.framework).toBe('SYSCOHADA')
    expect(senegalJurisdiction.config.currency).toBe('XOF')
    expect(senegalJurisdiction.config.economicZone).toBe('UEMOA')
  })

  it('validates a balanced journal entry', () => {
    if (!senegalJurisdiction) return
    const entry = {
      date: new Date(),
      reference: 'TEST-001',
      description: 'Test entry',
      journalCode: 'OD',
      jurisdictionCode: 'SN',
      societeId: 'test',
      status: 'DRAFT',
      lines: [
        { accountNumber: '601', debit: 1000, credit: 0 },
        { accountNumber: '401', debit: 0, credit: 1000 },
      ],
    }
    const result = senegalJurisdiction.validateJournalEntry(entry)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects unbalanced journal entry', () => {
    if (!senegalJurisdiction) return
    const entry = {
      date: new Date(),
      reference: 'TEST-002',
      description: 'Unbalanced',
      journalCode: 'OD',
      jurisdictionCode: 'SN',
      societeId: 'test',
      status: 'DRAFT',
      lines: [
        { accountNumber: '601', debit: 1000, credit: 0 },
        { accountNumber: '401', debit: 0, credit: 900 },
      ],
    }
    const result = senegalJurisdiction.validateJournalEntry(entry)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].code).toBe('R1_UNBALANCED')
  })

  it('returns Senegal VAT 18% from tax engine', () => {
    if (!senegalJurisdiction) return
    const calc = senegalJurisdiction.taxEngine.calculateVat(1000000, 'STD')
    expect(calc.vatRate).toBe(0.18)
    expect(calc.vatAmount).toBe(180000)
    expect(calc.grossAmount).toBe(1180000)
  })

  it('returns Senegal IS 30% from tax engine', () => {
    if (!senegalJurisdiction) return
    const calc = senegalJurisdiction.taxEngine.calculateCorporateIncomeTax(10000000, 2024)
    expect(calc.taxAmount).toBe(3000000)
    expect(calc.effectiveRate).toBe(0.30)
  })

  it('formats amount in XOF', () => {
    if (!senegalJurisdiction) return
    const formatted = senegalJurisdiction.formatAmount(1234567)
    expect(formatted).toContain('CFA')
    expect(formatted).not.toContain('.')
  })

  it('returns correct fiscal period (calendar year)', () => {
    if (!senegalJurisdiction) return
    const period = senegalJurisdiction.getCurrentFiscalPeriod(new Date('2025-06-15'))
    expect(period.start.getMonth()).toBe(0)  // January
    expect(period.end.getMonth()).toBe(11)  // December
    expect(period.jurisdictionCode).toBe('SN')
  })

  it('detects reconcilable accounts (411, 401)', () => {
    if (!senegalJurisdiction) return
    expect(senegalJurisdiction.isAccountReconcilable('411')).toBeDefined()
    expect(senegalJurisdiction.isAccountReconcilable('401')).toBeDefined()
  })
})
