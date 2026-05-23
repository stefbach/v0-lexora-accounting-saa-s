import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const CHAD_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'TD',
  cnss: {
    employeeRate: 0.035,  // CNSS employee 3.5%
    employerRate: 0.165,  // CNSS employer 16.5%
    cap: 500000,  // Cap mensuel XAF
  },
  familyAllowances: { rate: 0.075, cap: undefined },  // 7.5%
  workAccident: { rate: 0.04 },  // 4%
  // Barème IRPP Tchad (annuel XAF)
  incomeTaxBrackets: [
    { from: 0, to: 300000, rate: 0.00 },
    { from: 300000, to: 800000, rate: 0.10 },
    { from: 800000, to: 2500000, rate: 0.20 },
    { from: 2500000, to: 5000000, rate: 0.30 },
    { from: 5000000, to: null, rate: 0.35 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.25,  // 25% abattement sur salaire imposable
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
    cacRate: 0,  // Pas de CAC
  },
  minimumWage: 60000,  // SMIG Tchad XAF
}
