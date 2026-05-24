import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const TOGO_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'TG',
  cnss: {
    employeeRate: 0.04,
    employerRate: 0.175,
    cap: 400000, // XOF — plafond mensuel
  },
  familyAllowances: { rate: 0.03 }, // 3%
  workAccident: { rate: 0.02 }, // 2%
  // Barème IRPP Togo (mensuel XOF)
  incomeTaxBrackets: [
    { from: 0, to: 60000, rate: 0.005 },     // 0.5%
    { from: 60000, to: 150000, rate: 0.07 }, // 7%
    { from: 150000, to: 300000, rate: 0.15 },
    { from: 300000, to: 500000, rate: 0.25 },
    { from: 500000, to: 800000, rate: 0.30 },
    { from: 800000, to: null, rate: 0.35 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.28, // 28% abattement
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 35000, // SMIG XOF
}
