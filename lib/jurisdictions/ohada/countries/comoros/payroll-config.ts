import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const COMOROS_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'KM',
  cnss: {
    employeeRate: 0.025,  // CNPS Comores 2.5%
    employerRate: 0.05,   // CNPS Comores 5%
    cap: 250000,  // Cap mensuel KMF
  },
  familyAllowances: { rate: 0.03 },  // 3%
  workAccident: { rate: 0.015 },  // 1.5%
  // Barème IGR Comores (annuel en KMF)
  incomeTaxBrackets: [
    { from: 0, to: 150000, rate: 0 },
    { from: 150000, to: 500000, rate: 0.05 },
    { from: 500000, to: 1500000, rate: 0.10 },
    { from: 1500000, to: 3000000, rate: 0.15 },
    { from: 3000000, to: 7500000, rate: 0.20 },
    { from: 7500000, to: null, rate: 0.30 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.20,  // 20% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,
    maxDependents: 5,
  },
  minimumWage: 55000,  // SMIG Comores KMF
}
