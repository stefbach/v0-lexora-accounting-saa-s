import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerJurisdiction,
  getJurisdiction,
  tryGetJurisdiction,
  listJurisdictionCodes,
  listJurisdictions,
  isJurisdictionRegistered,
  getOhadaJurisdictions,
} from '../registry'
import type { Jurisdiction } from '../jurisdiction.interface'

describe('Jurisdiction Registry', () => {
  // Helper to create a minimal test jurisdiction
  const createTestJurisdiction = (code: 'MU' | 'SN' | 'CI', framework: 'PCM' | 'SYSCOHADA'): Jurisdiction => ({
    config: {
      code,
      name: `Test ${code}`,
      nameFr: `Test ${code}`,
      framework,
      currency: code === 'MU' ? 'MUR' : 'XOF',
      fiscalYearStart: '01-01',
      fiscalYearEnd: '12-31',
      vatRates: [],
      corporateIncomeTaxRate: 0.30,
      withholdingTaxes: [],
    },
    chartOfAccounts: {} as any,
    taxEngine: {} as any,
    payrollEngine: {} as any,
    statementsProvider: {} as any,
    validateJournalEntry: () => ({ valid: true, errors: [], warnings: [] }),
    getAccount: () => undefined,
    getCurrentFiscalPeriod: () => ({} as any),
    isAccountReconcilable: () => false,
    formatAmount: (a) => String(a),
    formatDate: (d) => d.toISOString(),
  })

  it('registers and retrieves a jurisdiction', () => {
    const j = createTestJurisdiction('SN', 'SYSCOHADA')
    registerJurisdiction(j)
    expect(getJurisdiction('SN')).toBe(j)
  })

  it('throws when getting unknown jurisdiction', () => {
    expect(() => getJurisdiction('XX' as any)).toThrow()
  })

  it('returns undefined with tryGet for unknown', () => {
    expect(tryGetJurisdiction('YY' as any)).toBeUndefined()
  })

  it('checks if jurisdiction is registered', () => {
    const j = createTestJurisdiction('CI', 'SYSCOHADA')
    registerJurisdiction(j)
    expect(isJurisdictionRegistered('CI')).toBe(true)
  })

  it('lists registered jurisdiction codes', () => {
    registerJurisdiction(createTestJurisdiction('MU', 'PCM'))
    registerJurisdiction(createTestJurisdiction('SN', 'SYSCOHADA'))
    const codes = listJurisdictionCodes()
    expect(codes).toContain('MU')
    expect(codes).toContain('SN')
  })

  it('filters OHADA jurisdictions only', () => {
    registerJurisdiction(createTestJurisdiction('MU', 'PCM'))
    registerJurisdiction(createTestJurisdiction('SN', 'SYSCOHADA'))
    registerJurisdiction(createTestJurisdiction('CI', 'SYSCOHADA'))
    const ohada = getOhadaJurisdictions()
    expect(ohada.length).toBeGreaterThanOrEqual(2)
    expect(ohada.every(j => j.config.framework === 'SYSCOHADA')).toBe(true)
  })
})
