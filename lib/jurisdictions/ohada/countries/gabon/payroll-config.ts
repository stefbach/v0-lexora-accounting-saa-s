import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const GABON_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'GA',
  cnss: {
    employeeRate: 0.025,  // 2.5% cotisations sociales employé
    employerRate: 0.205,  // 20.5% cotisations sociales employeur
    cap: 1500000,  // Cap mensuel XAF
  },
  familyAllowances: { rate: 0.08, cap: 1500000 },  // 8% allocations familiales
  workAccident: { rate: 0.03 },  // 3% accidents du travail
  // Barème IRPP Gabon (annuel en XAF)
  incomeTaxBrackets: [
    { from: 0, to: 1500000, rate: 0 },
    { from: 1500000, to: 1920000, rate: 0.05 },
    { from: 1920000, to: 2700000, rate: 0.10 },
    { from: 2700000, to: 3600000, rate: 0.15 },
    { from: 3600000, to: 5160000, rate: 0.20 },
    { from: 5160000, to: 7500000, rate: 0.25 },
    { from: 7500000, to: 11000000, rate: 0.30 },
    { from: 11000000, to: null, rate: 0.35 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.20,  // 20% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,  // Pas de quotient familial au Gabon
    maxDependents: 5,
  },
  minimumWage: 150000,  // SMIG Gabon XAF
}
