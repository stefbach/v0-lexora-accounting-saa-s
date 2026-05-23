import type { JurisdictionCode } from './types'

export interface PayrollEngine {
  readonly jurisdiction: JurisdictionCode

  calculatePayslip(input: PayslipInput): Payslip
  getSocialContributionRates(asOf: Date): SocialContributionRates
  getIncomeTaxBrackets(fiscalYear: number): IncomeTaxBracket[]
  calculateSeverancePay(input: SeveranceInput): SeveranceCalculation
  getMinimumWage(asOf: Date): number
}

export interface PayslipInput {
  employeeId: string
  period: { year: number; month: number }
  grossSalary: number
  benefits: number
  bonuses: number
  overtimeHours: number
  hourlyRate?: number
  familyDependents: number
  isExpat: boolean
}

export interface Payslip {
  grossSalary: number
  taxableGross: number
  employeeContributions: ContributionBreakdown[]
  employerContributions: ContributionBreakdown[]
  incomeTax: number
  netTaxableIncome: number
  netSalary: number
  totalEmployerCost: number
}

export interface ContributionBreakdown {
  code: string
  label: string
  base: number
  rate: number
  amount: number
  cap?: number
}

export interface SocialContributionRates {
  cnss: { employee: number; employer: number; cap?: number }
  health?: { employee: number; employer: number; cap?: number }
  pension?: { employee: number; employer: number; cap?: number }
  familyAllowances?: { rate: number; cap?: number }
  workAccident?: { rate: number }
  professionalTraining?: { rate: number }
  custom?: Record<string, { employee?: number; employer?: number; cap?: number }>
}

export interface IncomeTaxBracket {
  from: number
  to: number | null
  rate: number
}

export interface SeveranceInput {
  monthlyGrossSalary: number
  yearsOfService: number
  reasonForTermination: 'ECONOMIC' | 'PERSONAL' | 'CONTRACT_END' | 'RETIREMENT' | 'DEATH'
  isCadre: boolean
}

export interface SeveranceCalculation {
  totalAmount: number
  basis: number
  yearsConsidered: number
  formula: string
  taxableAmount: number
  exemptAmount: number
}
