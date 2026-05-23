import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const BENIN_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'BJ',
  cnss: {
    employeeRate: 0.036,  // 3.6% CNSS cotisation salariée
    employerRate: 0.156,  // 15.6% CNSS cotisation patronale
    cap: 350000,  // Cap mensuel XOF
  },
  familyAllowances: { rate: 0.09 },  // 9% allocations familiales
  workAccident: { rate: 0.04 },  // 4% accidents du travail
  // Barème IPTS Bénin 2024 (mensuel en XOF)
  incomeTaxBrackets: [
    { from: 0, to: 60000, rate: 0 },
    { from: 60000, to: 150000, rate: 0.10 },
    { from: 150000, to: 250000, rate: 0.15 },
    { from: 250000, to: 500000, rate: 0.19 },
    { from: 500000, to: null, rate: 0.30 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.20,  // 20% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 52000,  // SMIG Bénin XOF
}
