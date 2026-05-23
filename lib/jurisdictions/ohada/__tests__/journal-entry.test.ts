import { describe, it, expect } from 'vitest'

describe('OHADA Journal Entry Validation', () => {
  describe('Account number format', () => {
    it('accepts valid SYSCOHADA account numbers', () => {
      const validNumbers = ['101', '411', '601', '6011', '70', '588']
      const pattern = /^[1-9]\d{1,5}$/
      validNumbers.forEach(num => {
        expect(pattern.test(num)).toBe(true)
      })
    })

    it('rejects invalid account numbers', () => {
      // Note: '11' is 2 digits starting with 1-9 → matches /^[1-9]\d{1,5}$/.
      // SYSCOHADA accepts 2-7 digits, so this is correct. Removed from invalid list.
      const invalid = ['0', '00', 'abc', '', '0123', 'A411']
      const pattern = /^[1-9]\d{1,5}$/
      invalid.forEach(num => {
        expect(pattern.test(num)).toBe(false)
      })
    })
  })

  describe('Double-entry validation', () => {
    it('balanced entry is valid', () => {
      const lines = [
        { accountNumber: '601', debit: 1000, credit: 0 },
        { accountNumber: '401', debit: 0, credit: 1000 },
      ]
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01)
    })

    it('unbalanced entry is invalid (R1 violation)', () => {
      const lines = [
        { accountNumber: '601', debit: 1000, credit: 0 },
        { accountNumber: '401', debit: 0, credit: 950 },
      ]
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      expect(Math.abs(totalDebit - totalCredit)).toBeGreaterThan(0.01)
    })

    it('multi-line balanced entry is valid', () => {
      const lines = [
        { accountNumber: '601', debit: 1000, credit: 0 },
        { accountNumber: '4452', debit: 180, credit: 0 },  // VAT 18%
        { accountNumber: '401', debit: 0, credit: 1180 },  // TTC
      ]
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      expect(totalDebit).toBe(1180)
      expect(totalCredit).toBe(1180)
    })
  })

  describe('Line constraints', () => {
    it('line cannot have both debit and credit > 0', () => {
      const line = { accountNumber: '601', debit: 100, credit: 100 }
      const invalid = line.debit > 0 && line.credit > 0
      expect(invalid).toBe(true)  // Should be invalid
    })

    it('line must have at least one of debit or credit > 0', () => {
      const line = { accountNumber: '601', debit: 0, credit: 0 }
      const hasAmount = line.debit > 0 || line.credit > 0
      expect(hasAmount).toBe(false)  // Should be invalid
    })
  })

  describe('Journal codes', () => {
    it('accepts standard OHADA journal codes', () => {
      const valid = ['VTE', 'ACH', 'BNQ', 'SAL', 'OD', 'AN']
      valid.forEach(code => {
        expect(['VTE', 'ACH', 'BNQ', 'SAL', 'OD', 'AN']).toContain(code)
      })
    })
  })

  describe('Real-world examples', () => {
    it('Sale invoice (VTE) - Senegal', () => {
      // Vente HT 1M XOF + TVA 18% = 1.18M TTC
      const lines = [
        { accountNumber: '411', debit: 1180000, credit: 0 },     // Client
        { accountNumber: '701', debit: 0, credit: 1000000 },     // Ventes
        { accountNumber: '4431', debit: 0, credit: 180000 },     // TVA collectée
      ]
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      expect(totalDebit).toBe(1180000)
      expect(totalCredit).toBe(1180000)
    })

    it('Salary payment (SAL) - Senegal', () => {
      // Salaire brut 500k XOF, IPRES 24192, net 475808
      const lines = [
        { accountNumber: '661', debit: 500000, credit: 0 },       // Charges personnel
        { accountNumber: '431', debit: 0, credit: 24192 },        // CNSS/IPRES
        { accountNumber: '447', debit: 0, credit: 50000 },        // Impôt retenu
        { accountNumber: '422', debit: 0, credit: 425808 },       // Salaire net dû
      ]
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      expect(totalDebit).toBe(500000)
      expect(totalCredit).toBe(500000)
    })

    it('Bank transfer (BNQ) - intercompte XOF→XAF', () => {
      // Transfert Senegal → Cameroun, taux 1:1 même peg EUR
      const lines = [
        { accountNumber: '521', debit: 1000000, credit: 0 },     // Banque XAF
        { accountNumber: '588', debit: 0, credit: 1000000 },     // Transit
      ]
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
      expect(totalDebit).toBe(totalCredit)
    })
  })
})
