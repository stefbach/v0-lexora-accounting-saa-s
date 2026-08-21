import { describe, it, expect } from 'vitest'
import {
  normalizeAccountNumber,
  accountNumbersMatch,
  findAccountBalance,
  type AccountRow,
} from './accounts-parse'

// Tableau réel MCB « Accounts » (société DIGITAL DATA SOL LTD).
const MCB_ROWS: AccountRow[] = [
  { number: '000447954555', currency: 'MUR', available: '14,564.18', ledger: '14,564.21' },
  { number: '000447954563', currency: 'GBP', available: '-26.72', ledger: '-26.72' },
  { number: '000447954571', currency: 'USD', available: '-35.84', ledger: '-35.84' },
  { number: '000447954587', currency: 'EUR', available: '8,526.87', ledger: '8,926.87' },
]

describe('normalizeAccountNumber', () => {
  it('retire les séparateurs', () => {
    expect(normalizeAccountNumber('0004 4795 4555')).toBe('000447954555')
    expect(normalizeAccountNumber('000447954555')).toBe('000447954555')
  })
})

describe('accountNumbersMatch', () => {
  it('exact', () => expect(accountNumbersMatch('000447954555', '000447954555')).toBe(true))
  it('tolérant au formatage', () => expect(accountNumbersMatch('0004 4795 4555', '000447954555')).toBe(true))
  it('tolérant aux zéros de tête', () => expect(accountNumbersMatch('447954555', '000447954555')).toBe(true))
  it('comptes différents', () => expect(accountNumbersMatch('000447954555', '000447954587')).toBe(false))
  it('vide → false', () => expect(accountNumbersMatch('', '000447954555')).toBe(false))
})

describe('findAccountBalance — cas MCB réel', () => {
  it('lit le solde du compte MUR ciblé (ledger prioritaire)', () => {
    const b = findAccountBalance(MCB_ROWS, '000447954555')
    expect(b).not.toBeNull()
    expect(b!.currency).toBe('MUR')
    expect(b!.balance).toBe(14564.21) // ledger
    expect(b!.available).toBe(14564.18)
    expect(b!.ledger).toBe(14564.21)
  })

  it('gère les soldes négatifs', () => {
    const b = findAccountBalance(MCB_ROWS, '000447954563')
    expect(b!.balance).toBe(-26.72)
    expect(b!.currency).toBe('GBP')
  })

  it('EUR avec available ≠ ledger', () => {
    const b = findAccountBalance(MCB_ROWS, '000447954587')
    expect(b!.available).toBe(8526.87)
    expect(b!.ledger).toBe(8926.87)
    expect(b!.balance).toBe(8926.87)
  })

  it('repli sur available si ledger absent', () => {
    const b = findAccountBalance(
      [{ number: '000447954555', currency: 'MUR', available: '1,000.00' }],
      '000447954555',
    )
    expect(b!.balance).toBe(1000)
  })

  it('compte absent → null', () => {
    expect(findAccountBalance(MCB_ROWS, '999999999999')).toBeNull()
  })

  it('liste vide → null', () => {
    expect(findAccountBalance([], '000447954555')).toBeNull()
  })

  it('match tolérant au formatage du numéro', () => {
    const rows: AccountRow[] = [{ number: '0004 4795 4555', currency: 'MUR', ledger: '2,000.50' }]
    expect(findAccountBalance(rows, '000447954555')!.balance).toBe(2000.5)
  })
})
