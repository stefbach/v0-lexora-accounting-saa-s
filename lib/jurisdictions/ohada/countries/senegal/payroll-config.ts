import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const SENEGAL_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'SN',
  cnss: {
    employeeRate: 0,  // No employee CNSS in Senegal (only IPRES)
    employerRate: 0.07,  // 7% for prestations familiales
    cap: 63000,  // Cap mensuel XOF
  },
  pensionFund: {
    employeeRate: 0.056,  // IPRES Régime général 5.6%
    employerRate: 0.084,  // IPRES Régime général 8.4%
    cap: 432000,  // Cap mensuel
  },
  familyAllowances: { rate: 0.07, cap: 63000 },
  workAccident: { rate: 0.01 },  // Variable 1-5% selon risque
  professionalTraining: { rate: 0.03 },  // CFCE 3%
  // Barème IRPP Sénégal 2024 (annuel en XOF)
  incomeTaxBrackets: [
    { from: 0, to: 630000, rate: 0 },
    { from: 630000, to: 1500000, rate: 0.20 },
    { from: 1500000, to: 4000000, rate: 0.30 },
    { from: 4000000, to: 8000000, rate: 0.35 },
    { from: 8000000, to: 13500000, rate: 0.37 },
    { from: 13500000, to: null, rate: 0.40 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.30,  // 30% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,  // Quotient familial au Sénégal pas comme France
    maxDependents: 5,
  },
  minimumWage: 60000,  // SMIG Sénégal XOF
}
