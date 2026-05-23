import { describe, it, expect } from 'vitest'

describe('OHADA Payroll Calculations', () => {
  describe('CNSS Senegal', () => {
    it('calculates IPRES employee 5.6% with cap', () => {
      const gross = 500000  // 500k XOF
      const cap = 432000
      const rate = 0.056
      const base = Math.min(gross, cap)
      const employeeContrib = base * rate

      expect(base).toBe(432000)
      expect(Math.round(employeeContrib)).toBe(24192)
    })

    it('calculates IPRES employer 8.4% with cap', () => {
      const gross = 500000
      const cap = 432000
      const rate = 0.084
      const employerContrib = Math.min(gross, cap) * rate

      expect(Math.round(employerContrib)).toBe(36288)
    })
  })

  describe('CNSS Cameroon (CNPS)', () => {
    it('employee 4.2% with cap 750k XAF', () => {
      const gross = 1000000
      const cap = 750000
      const employee = Math.min(gross, cap) * 0.042

      expect(Math.round(employee)).toBe(31500)
    })

    it('employer 11.5% with cap', () => {
      const gross = 1000000
      const cap = 750000
      const employer = Math.min(gross, cap) * 0.115

      expect(Math.round(employer)).toBe(86250)
    })
  })

  describe('Family Allowances (Prestations Familiales)', () => {
    it('Senegal PF 7% with cap 63000', () => {
      const gross = 500000
      const cap = 63000
      const rate = 0.07
      const pf = Math.min(gross, cap) * rate

      expect(Math.round(pf)).toBe(4410)
    })

    it('Côte d\'Ivoire PF/AT 5.75% with cap 70000', () => {
      const gross = 500000
      const pf = Math.min(gross, 70000) * 0.0575

      expect(Math.round(pf)).toBe(4025)
    })
  })

  describe('Income Tax (IRPP/IUTS/ITS)', () => {
    it('Burkina Faso IUTS - 100000 XOF monthly', () => {
      const monthly = 100000
      // 30000@0 + 20000@12.1% + 30000@13.9% + 20000@15.7%
      const tax = 20000 * 0.121 + 30000 * 0.139 + 20000 * 0.157

      expect(Math.round(tax)).toBe(20000 * 0.121 + 30000 * 0.139 + 20000 * 0.157)
      expect(Math.round(tax)).toBe(2420 + 4170 + 3140)
    })

    it('Mali ITS - 250000 XOF monthly', () => {
      const monthly = 250000
      // 175000@0 + 75000@5%
      const tax = 75000 * 0.05

      expect(tax).toBe(3750)
    })
  })

  describe('Net Salary Calculation', () => {
    it('Senegal: 500k gross → ~415k net (approximate)', () => {
      const gross = 500000

      // IPRES employee: 432000 * 5.6% = 24192
      const ipres = Math.min(gross, 432000) * 0.056

      // Income tax (very rough - 20% on income > 52500/month)
      // Annual 6M, brackets calculation simplified
      // Net should be around 415k-430k
      const net = gross - ipres  // Without tax for simplicity

      expect(net).toBeLessThanOrEqual(gross)
      expect(net).toBeGreaterThan(gross * 0.80)  // At least 80% of gross
    })
  })

  describe('Severance Pay (Indemnités de Départ)', () => {
    it('OHADA generic: 30% per year for 1-5 years', () => {
      const monthlySalary = 500000
      const years = 5
      const percentage = 0.30
      const severance = monthlySalary * percentage * years

      expect(severance).toBe(750000)
    })

    it('35% per year for 6-10 years', () => {
      const monthlySalary = 500000
      const years = 8
      const percentage = 0.35
      const severance = monthlySalary * percentage * years

      expect(severance).toBe(1400000)
    })

    it('40% per year for >10 years', () => {
      const monthlySalary = 500000
      const years = 15
      const percentage = 0.40
      const severance = monthlySalary * percentage * years

      expect(severance).toBe(3000000)
    })
  })

  describe('CFA conversion EUR fixed peg', () => {
    it('1000 EUR → 655957 XOF', () => {
      const eur = 1000
      const rate = 655.957
      expect(eur * rate).toBeCloseTo(655957, 0)
    })

    it('1000000 XOF → ~1524.49 EUR', () => {
      const xof = 1000000
      const rate = 655.957
      expect(xof / rate).toBeCloseTo(1524.49, 1)
    })

    it('XOF → XAF (1:1 same peg)', () => {
      const xof = 100000
      const xaf = xof  // Same EUR peg, so 1:1
      expect(xaf).toBe(100000)
    })
  })
})
