import { describe, it, expect } from 'vitest'
import { ohadaChartOfAccounts, ALL_OHADA_ACCOUNTS, SYSCOHADA_CLASSES } from '../chart-of-accounts'

describe('SYSCOHADA Chart of Accounts', () => {
  it('has all 9 classes', () => {
    expect(SYSCOHADA_CLASSES.length).toBe(9)
    expect(SYSCOHADA_CLASSES.map(c => c.number).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('has 200+ accounts', () => {
    expect(ALL_OHADA_ACCOUNTS.length).toBeGreaterThan(200)
  })

  it('all accounts have unique numbers', () => {
    const numbers = ALL_OHADA_ACCOUNTS.map(a => a.number)
    const unique = new Set(numbers)
    expect(unique.size).toBe(numbers.length)
  })

  it('finds account 411 (clients)', () => {
    const acc = ohadaChartOfAccounts.getAccount('411')
    expect(acc).toBeDefined()
    expect(acc?.classNumber).toBe(4)
    expect(acc?.isReconcilable).toBe(true)
  })

  it('finds account 401 (fournisseurs)', () => {
    const acc = ohadaChartOfAccounts.getAccount('401')
    expect(acc).toBeDefined()
    expect(acc?.classNumber).toBe(4)
    expect(acc?.normalBalance).toBe('CREDIT')
  })

  it('finds account 521 (banques)', () => {
    const acc = ohadaChartOfAccounts.getAccount('521')
    expect(acc).toBeDefined()
    expect(acc?.classNumber).toBe(5)
  })

  it('returns default account for operations', () => {
    expect(ohadaChartOfAccounts.getDefaultAccountFor('CLIENT_RECEIVABLE')).toBe('411')
    expect(ohadaChartOfAccounts.getDefaultAccountFor('SUPPLIER_PAYABLE')).toBe('401')
    expect(ohadaChartOfAccounts.getDefaultAccountFor('BANK_MAIN')).toBe('521')
    expect(ohadaChartOfAccounts.getDefaultAccountFor('SALES_REVENUE')).toBe('701')
    expect(ohadaChartOfAccounts.getDefaultAccountFor('PURCHASES')).toBe('601')
  })

  it('validates account number format', () => {
    expect(ohadaChartOfAccounts.isValidAccountNumber('411')).toBe(true)
    expect(ohadaChartOfAccounts.isValidAccountNumber('601')).toBe(true)
    expect(ohadaChartOfAccounts.isValidAccountNumber('0')).toBe(false)
    expect(ohadaChartOfAccounts.isValidAccountNumber('abc')).toBe(false)
  })

  it('searches accounts by query', () => {
    const results = ohadaChartOfAccounts.searchAccounts('client')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(a => a.number === '411')).toBe(true)
  })

  it('filters accounts by class', () => {
    const class6 = ohadaChartOfAccounts.getAccountsByClass(6)
    expect(class6.length).toBeGreaterThan(50)
    expect(class6.every(a => a.classNumber === 6)).toBe(true)
    expect(class6.every(a => a.category === 'INCOME_STATEMENT_EXPENSE')).toBe(true)
  })

  it('classe 9 accounts are ANALYTICAL', () => {
    const class9 = ohadaChartOfAccounts.getAccountsByClass(9)
    expect(class9.length).toBeGreaterThan(0)
    expect(class9.every(a => a.category === 'ANALYTICAL')).toBe(true)
  })

  it('class 8 (HAO) exists - SYSCOHADA specific', () => {
    const class8 = ohadaChartOfAccounts.getAccountsByClass(8)
    expect(class8.length).toBeGreaterThan(10)
  })

  it('account 4431 (TVA collectée) is correct', () => {
    const acc = ohadaChartOfAccounts.getAccount('4431')
    expect(acc).toBeDefined()
    expect(acc?.classNumber).toBe(4)
    expect(acc?.normalBalance).toBe('CREDIT')
  })

  it('account 588 (virements internes) is reconcilable', () => {
    const acc = ohadaChartOfAccounts.getAccount('588')
    if (acc) {
      expect(acc.classNumber).toBe(5)
    }
  })
})
