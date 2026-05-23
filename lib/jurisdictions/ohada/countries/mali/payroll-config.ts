import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const MALI_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'ML',
  cnss: {
    employeeRate: 0.0356,  // 3.56% cotisations sociales employé
    employerRate: 0.0813,  // 8.13% cotisations sociales employeur
    cap: 1320000,  // Cap mensuel XOF
  },
  pensionFund: {
    employeeRate: 0.0306,  // AMO assurance maladie 3.06% employé
    employerRate: 0.0535,  // AMO assurance maladie 5.35% employeur
    cap: 1320000,  // Cap mensuel
  },
  familyAllowances: { rate: 0.08, cap: 1320000 },  // 8% allocations familiales
  workAccident: { rate: 0.04 },  // 4% accidents du travail (moyenne)
  professionalTraining: { rate: 0.02 },  // 2% formation professionnelle
  // Barème ITS Mali 2024 (mensuel en XOF)
  incomeTaxBrackets: [
    { from: 0, to: 175000, rate: 0 },
    { from: 175000, to: 250000, rate: 0.05 },
    { from: 250000, to: 400000, rate: 0.13 },
    { from: 400000, to: 600000, rate: 0.20 },
    { from: 600000, to: 900000, rate: 0.28 },
    { from: 900000, to: 1500000, rate: 0.34 },
    { from: 1500000, to: null, rate: 0.37 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.10,  // 10% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,  // Pas de quotient familial au Mali
    maxDependents: 6,
  },
  minimumWage: 40000,  // SMIG Mali XOF
}
