import { describe, it, expect } from 'vitest'
import {
  normalizeStatementDate,
  parseTransactionRow,
  parseTransactions,
  transactionDedupeKey,
  findBalanceBreaks,
  type RawTransactionRow,
} from './transactions-parse'

// Lignes réelles du tableau MCB « Transactions » (compte MUR 000447954555).
const MCB_ROWS: RawTransactionRow[] = [
  { transactionDate: '20 Aug 2026', valueDate: '20 Aug 2026', reference: 'FT262327YRQX', description: 'E-Commerce Transaction Fee|MASTERCARD 1010035200', amount: '-4.72', balance: '14,564.21' },
  { transactionDate: '20 Aug 2026', valueDate: '20 Aug 2026', reference: 'FT26232SQBXT', description: 'Merchant Settlement|MASTERCARD 1010035200-MCBS2I05-288', amount: '800.00', balance: '14,568.93' },
  { transactionDate: '20 Aug 2026', valueDate: '20 Aug 2026', reference: 'FT26232J47Y3', description: 'Merchant Discount|MASTERCARD 1010035200', amount: '-20.00', balance: '13,768.93' },
  { transactionDate: '20 Aug 2026', valueDate: '20 Aug 2026', reference: 'FT26232FCBZ2', description: 'VAT on Merchant Discount|MASTERCARD 1010035200', amount: '-3.00', balance: '13,788.93' },
  { transactionDate: '17 Aug 2026', valueDate: '17 Aug 2026', reference: 'FT26229SNYNF', description: 'ATM Cash Withdrawal|MCB CASCAVELLE', amount: '-8,000.00', balance: '13,791.93' },
  { transactionDate: '17 Aug 2026', valueDate: '17 Aug 2026', reference: 'FT26229L0Z0S', description: 'Bulk Payment|HONORAIRES MEDECINS Juil 2026', amount: '-58,072.00', balance: '21,791.93' },
]

describe('normalizeStatementDate', () => {
  it('format MCB « 20 Aug 2026 »', () => {
    expect(normalizeStatementDate('20 Aug 2026')).toBe('2026-08-20')
    expect(normalizeStatementDate('1 Jan 2026')).toBe('2026-01-01')
    expect(normalizeStatementDate('31 Dec 2025')).toBe('2025-12-31')
  })
  it('nom de mois complet et tirets', () => {
    expect(normalizeStatementDate('20 August 2026')).toBe('2026-08-20')
    expect(normalizeStatementDate('20-Aug-2026')).toBe('2026-08-20')
  })
  it('variantes FR', () => {
    expect(normalizeStatementDate('05 juil 2026')).toBe('2026-07-05')
    expect(normalizeStatementDate('05 déc 2026')).toBe('2026-12-05')
  })
  it('déjà ISO', () => expect(normalizeStatementDate('2026-08-20')).toBe('2026-08-20'))
  it('numérique JJ/MM/AAAA', () => {
    expect(normalizeStatementDate('20/08/2026')).toBe('2026-08-20')
    expect(normalizeStatementDate('20.08.26')).toBe('2026-08-20')
  })
  it('mois numérique invalide → null', () => expect(normalizeStatementDate('20/13/2026')).toBeNull())
  it('vide / illisible → null', () => {
    expect(normalizeStatementDate('')).toBeNull()
    expect(normalizeStatementDate('n/a')).toBeNull()
    expect(normalizeStatementDate('20 Zzz 2026')).toBeNull()
  })
})

describe('parseTransactionRow — cas MCB réel', () => {
  it('débit avec séparateur de milliers', () => {
    const t = parseTransactionRow(MCB_ROWS[5])!
    expect(t.date).toBe('2026-08-17')
    expect(t.value_date).toBe('2026-08-17')
    expect(t.reference).toBe('FT26229L0Z0S')
    expect(t.description).toBe('Bulk Payment|HONORAIRES MEDECINS Juil 2026')
    expect(t.amount).toBe(-58072)
    expect(t.balance_after).toBe(21791.93)
  })
  it('crédit positif', () => {
    const t = parseTransactionRow(MCB_ROWS[1])!
    expect(t.amount).toBe(800)
    expect(t.balance_after).toBe(14568.93)
  })
  it('petit débit', () => {
    const t = parseTransactionRow(MCB_ROWS[0])!
    expect(t.amount).toBe(-4.72)
    expect(t.balance_after).toBe(14564.21)
  })
  it('value date absente → repli sur transaction date', () => {
    const t = parseTransactionRow({ transactionDate: '20 Aug 2026', amount: '-4.72' })!
    expect(t.value_date).toBe('2026-08-20')
    expect(t.reference).toBeNull()
    expect(t.balance_after).toBeNull()
  })
  it('date illisible → null (ligne ignorée)', () => {
    expect(parseTransactionRow({ transactionDate: 'Total', amount: '100' })).toBeNull()
  })
  it('montant absent → null (ligne d’en-tête ignorée)', () => {
    expect(parseTransactionRow({ transactionDate: '20 Aug 2026', amount: '' })).toBeNull()
  })
})

describe('parseTransactions', () => {
  it('parse toutes les lignes réelles', () => {
    const txs = parseTransactions(MCB_ROWS)
    expect(txs).toHaveLength(6)
    expect(txs[0].amount).toBe(-4.72)
    expect(txs[5].amount).toBe(-58072)
  })
  it('ignore le bruit (en-têtes, totaux) sans planter', () => {
    const txs = parseTransactions([
      { transactionDate: 'Transaction date', amount: 'Amount' },
      ...MCB_ROWS.slice(0, 2),
      { transactionDate: '', amount: '' },
    ])
    expect(txs).toHaveLength(2)
  })
  it('liste vide → []', () => expect(parseTransactions([])).toEqual([]))
})

describe('transactionDedupeKey', () => {
  it('utilise la référence quand présente', () => {
    const t = parseTransactionRow(MCB_ROWS[0])!
    expect(transactionDedupeKey(t)).toBe('ref:FT262327YRQX')
  })
  it('repli date+montant+libellé sans référence', () => {
    const t = parseTransactionRow({ transactionDate: '20 Aug 2026', amount: '-4.72', description: 'Frais' })!
    expect(transactionDedupeKey(t)).toBe('dmd:2026-08-20|-4.72|frais')
  })
})

describe('findBalanceBreaks — contrôle de suite du solde', () => {
  it('aucune rupture sur un relevé cohérent', () => {
    // balance_after[n] - amount[n] doit égaler balance_after[n+1].
    // Suite fabriquée cohérente : 100 (-10) → 110 (-20) → 130.
    const txs = parseTransactions([
      { transactionDate: '03 Aug 2026', amount: '-10.00', balance: '100.00' },
      { transactionDate: '02 Aug 2026', amount: '-20.00', balance: '110.00' },
      { transactionDate: '01 Aug 2026', amount: '5.00', balance: '130.00' },
    ])
    expect(findBalanceBreaks(txs)).toEqual([])
  })
  it('détecte une rupture (montant mal lu / pagination manquée)', () => {
    const txs = parseTransactions([
      { transactionDate: '03 Aug 2026', amount: '-10.00', balance: '100.00' },
      { transactionDate: '02 Aug 2026', amount: '-20.00', balance: '999.99' }, // devrait être 110
    ])
    expect(findBalanceBreaks(txs)).toEqual([0])
  })
  it('ignore les lignes sans solde courant', () => {
    const txs = parseTransactions([
      { transactionDate: '03 Aug 2026', amount: '-10.00' },
      { transactionDate: '02 Aug 2026', amount: '-20.00', balance: '110.00' },
    ])
    expect(findBalanceBreaks(txs)).toEqual([])
  })
})
