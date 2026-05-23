import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const BURKINA_FASO_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'BF',
  cnss: {
    employeeRate: 0.055,  // 5.5% cotisation salarié
    employerRate: 0.16,   // 16% cotisation patronale
    cap: 600000,  // Cap mensuel XOF
  },
  familyAllowances: { rate: 0.07 },  // 7% allocations familiales
  workAccident: { rate: 0.035 },  // 3.5% accidents du travail
  // Barème IUTS Burkina Faso (mensuel en XOF)
  incomeTaxBrackets: [
    { from: 0, to: 30000, rate: 0 },
    { from: 30000, to: 50000, rate: 0.121 },
    { from: 50000, to: 80000, rate: 0.139 },
    { from: 80000, to: 120000, rate: 0.157 },
    { from: 120000, to: 170000, rate: 0.184 },
    { from: 170000, to: 250000, rate: 0.217 },
    { from: 250000, to: 385000, rate: 0.245 },
    { from: 385000, to: null, rate: 0.25 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0,  // No abatement for professional expenses
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 34664,  // SMIG Burkina Faso XOF
}
