import { describe, it, expect } from 'vitest'
import { mauritiusJurisdiction } from '../jurisdiction'

const chart = mauritiusJurisdiction.chartOfAccounts

describe('Mauritius PCM chart of accounts', () => {
  it('has all 7 PCM classes', () => {
    expect(chart.getClasses().length).toBe(7)
    expect(chart.getClasses().map((c) => c.number).sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('has 70+ accounts sourced from the IFRS classification seed (migration 478)', () => {
    expect(chart.getAllAccounts().length).toBeGreaterThan(70)
  })

  it('all accounts have unique numbers', () => {
    const numbers = chart.getAllAccounts().map((a) => a.number)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('finds account 411 (clients) as an auxiliary, reconcilable, debit account', () => {
    const acc = chart.getAccount('411')
    expect(acc).toBeDefined()
    expect(acc?.classNumber).toBe(4)
    expect(acc?.category).toBe('BALANCE_SHEET_ASSET')
    expect(acc?.normalBalance).toBe('DEBIT')
    expect(acc?.isReconcilable).toBe(true)
    expect(acc?.isAuxiliary).toBe(true)
  })

  it('finds account 401 (fournisseurs) as a credit liability', () => {
    const acc = chart.getAccount('401')
    expect(acc).toBeDefined()
    expect(acc?.category).toBe('BALANCE_SHEET_LIABILITY')
    expect(acc?.normalBalance).toBe('CREDIT')
  })

  it('flags MRA-related accounts with their taxCode', () => {
    const paye = chart.getAccount('4330')
    expect(paye?.taxCode).toBe('PAYE')
    const tvaCollectee = chart.getAccount('4457')
    expect(tvaCollectee?.taxCode).toBe('TVA')
  })

  it('classifies contra amortisation accounts as CREDIT within their asset category', () => {
    const amort = chart.getAccount('2815')
    expect(amort).toBeDefined()
    expect(amort?.category).toBe('BALANCE_SHEET_ASSET')
    expect(amort?.normalBalance).toBe('CREDIT')
  })

  it('filters accounts by class', () => {
    const class6 = chart.getAccountsByClass(6)
    expect(class6.length).toBeGreaterThan(20)
    expect(class6.every((a) => a.classNumber === 6)).toBe(true)
    expect(class6.every((a) => a.category === 'INCOME_STATEMENT_EXPENSE')).toBe(true)
  })

  it('searches accounts by query (number or French label)', () => {
    const byLabel = chart.searchAccounts('salaire')
    expect(byLabel.length).toBeGreaterThan(0)
    const byNumber = chart.searchAccounts('411')
    expect(byNumber.some((a) => a.number === '411')).toBe(true)
  })

  it('returns default account for operations', () => {
    expect(chart.getDefaultAccountFor('CLIENT_RECEIVABLE')).toBe('411')
    expect(chart.getDefaultAccountFor('SUPPLIER_PAYABLE')).toBe('401')
  })

  it('validates account number format', () => {
    expect(chart.isValidAccountNumber('411')).toBe(true)
    expect(chart.isValidAccountNumber('0')).toBe(false)
    expect(chart.isValidAccountNumber('abc')).toBe(false)
  })
})
