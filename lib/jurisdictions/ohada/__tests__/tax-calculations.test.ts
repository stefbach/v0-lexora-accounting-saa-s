import { describe, it, expect } from 'vitest'

describe('OHADA Tax Calculations', () => {
  describe('VAT calculation', () => {
    it('calculates VAT 18% (Senegal/CI standard rate)', () => {
      const netAmount = 1000000  // 1M XOF HT
      const vatRate = 0.18
      const vatAmount = netAmount * vatRate
      const grossAmount = netAmount + vatAmount

      expect(vatAmount).toBe(180000)
      expect(grossAmount).toBe(1180000)
    })

    it('calculates VAT 19.25% (Cameroon standard rate with CAC)', () => {
      const netAmount = 1000000
      const vatRate = 0.1925
      const vatAmount = netAmount * vatRate

      expect(vatAmount).toBe(192500)
    })

    it('calculates VAT reverse (extract from TTC)', () => {
      const grossAmount = 1180000  // TTC
      const vatRate = 0.18
      const netAmount = grossAmount / (1 + vatRate)
      const vatAmount = grossAmount - netAmount

      expect(Math.round(netAmount)).toBe(1000000)
      expect(Math.round(vatAmount)).toBe(180000)
    })
  })

  describe('Corporate Income Tax (IS)', () => {
    it('Senegal IS 30%', () => {
      const taxableIncome = 50000000  // 50M XOF
      const taxRate = 0.30
      const isAmount = taxableIncome * taxRate
      expect(isAmount).toBe(15000000)
    })

    it('Côte d\'Ivoire IS 25%', () => {
      const taxableIncome = 50000000
      const taxRate = 0.25
      expect(taxableIncome * taxRate).toBe(12500000)
    })

    it('Cameroon IS 33% (30% + CAC 10%)', () => {
      const taxableIncome = 50000000
      const taxRate = 0.33
      expect(taxableIncome * taxRate).toBe(16500000)
    })
  })

  describe('Progressive Income Tax (IRPP/IUTS)', () => {
    it('Senegal IRPP progressive calculation - 5M XOF annuel', () => {
      const annualIncome = 5000000  // 5M XOF
      const brackets = [
        { from: 0, to: 630000, rate: 0 },
        { from: 630000, to: 1500000, rate: 0.20 },
        { from: 1500000, to: 4000000, rate: 0.30 },
        { from: 4000000, to: 8000000, rate: 0.35 },
      ]

      let tax = 0
      let remaining = annualIncome

      for (const bracket of brackets) {
        if (remaining <= 0) break
        const bracketSize = (bracket.to ?? Infinity) - bracket.from
        const taxableInBracket = Math.min(remaining - Math.max(0, bracket.from - (annualIncome - remaining)), bracketSize)
        if (annualIncome > bracket.from) {
          const inBracket = Math.min(annualIncome, bracket.to ?? Infinity) - bracket.from
          tax += inBracket * bracket.rate
        }
      }

      // Expected: (1500000-630000)*0.20 + (4000000-1500000)*0.30 + (5000000-4000000)*0.35
      //         = 870000*0.20 + 2500000*0.30 + 1000000*0.35
      //         = 174000 + 750000 + 350000 = 1274000
      expect(tax).toBeCloseTo(1274000, 0)
    })
  })

  describe('Minimum Corporate Tax (IMF)', () => {
    it('Côte d\'Ivoire IMF 0.5% sur CA', () => {
      const turnover = 100000000  // 100M XOF
      const imfRate = 0.005
      const minTax = 3000000  // Min IMF CI

      const computedImf = Math.max(turnover * imfRate, minTax)
      expect(computedImf).toBe(3000000)  // floor applies
    })

    it('Senegal IMF 0.5% sur CA - high turnover', () => {
      const turnover = 2000000000  // 2 milliards XOF
      const imfRate = 0.005
      const minImf = 500000

      const computedImf = Math.max(turnover * imfRate, minImf)
      expect(computedImf).toBe(10000000)  // 0.5% applies
    })
  })

  describe('Withholding Tax (BRS/Précompte)', () => {
    it('Senegal WHT services non-resident 20%', () => {
      const grossPayment = 1000000  // 1M XOF
      const whtRate = 0.20
      expect(grossPayment * whtRate).toBe(200000)
    })

    it('Cameroon WHT services resident 5.5%', () => {
      const grossPayment = 1000000
      const whtRate = 0.055
      expect(grossPayment * whtRate).toBe(55000)
    })
  })
})
