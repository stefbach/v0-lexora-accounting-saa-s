import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const NIGER_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'NE',
  cnss: {
    employeeRate: 0.0525,  // 5.25% CNSS salarié
    employerRate: 0.155,   // 15.5% CNSS patronal
    cap: 250000,  // Cap mensuel XOF
  },
  familyAllowances: { rate: 0.085 },  // 8.5% allocations familiales
  workAccident: { rate: 0.0175 },  // 1.75% accidents du travail
  // Barème ITS Niger 2024 (mensuel en XOF)
  incomeTaxBrackets: [
    { from: 0, to: 25000, rate: 0.01 },
    { from: 25000, to: 50000, rate: 0.02 },
    { from: 50000, to: 100000, rate: 0.06 },
    { from: 100000, to: 150000, rate: 0.13 },
    { from: 150000, to: 300000, rate: 0.25 },
    { from: 300000, to: 400000, rate: 0.30 },
    { from: 400000, to: 700000, rate: 0.32 },
    { from: 700000, to: 1000000, rate: 0.34 },
    { from: 1000000, to: null, rate: 0.35 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.17,  // 17% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,
    maxDependents: 5,
  },
  minimumWage: 30047,  // SMIG Niger XOF
}
