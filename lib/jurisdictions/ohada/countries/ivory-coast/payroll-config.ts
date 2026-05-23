import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const IVORY_COAST_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'CI',
  cnss: {
    employeeRate: 0.063,  // CNSS salarié 6.3%
    employerRate: 0.157,  // CNSS employeur 15.7%
    cap: 1647000,  // Cap mensuel XOF
  },
  pensionFund: {
    employeeRate: 0,  // Combiné dans CNSS
    employerRate: 0,  // Combiné dans CNSS
    cap: 0,
  },
  familyAllowances: { rate: 0.0575, cap: 70000 },  // Prestations familiales/accidents 5.75%
  workAccident: { rate: 0.02 },  // Variable 2-5% selon risque
  professionalTraining: { rate: 0.012 },  // FDFP 1.2%
  // Barème IRPP Côte d'Ivoire 2024 (annuel en XOF)
  incomeTaxBrackets: [
    { from: 0, to: 600000, rate: 0 },
    { from: 600000, to: 1560000, rate: 0.16 },
    { from: 1560000, to: 2400000, rate: 0.21 },
    { from: 2400000, to: 3600000, rate: 0.24 },
    { from: 3600000, to: 5040000, rate: 0.28 },
    { from: 5040000, to: 7200000, rate: 0.32 },
    { from: 7200000, to: null, rate: 0.36 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.20,  // 20% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,  // Quotient familial (type ITS)
    maxDependents: 6,
  },
  minimumWage: 75000,  // SMIG Côte d'Ivoire XOF
}
