import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const CAMEROON_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'CM',
  cnss: {
    employeeRate: 0.042,  // CNPS 4.2%
    employerRate: 0.115,  // CNPS 11.5%
    cap: 750000,  // Cap mensuel XAF
  },
  familyAllowances: { rate: 0.07, cap: undefined },  // 7%
  workAccident: { rate: 0.0175 },  // Variable 1.75% à 5% selon risque
  professionalTraining: { rate: 0.01 },  // FNE 1%
  // Barème IRPP Cameroun 2024 (mensuel XAF) - avec abattement 30% + CAC 10%
  incomeTaxBrackets: [
    { from: 0, to: 166667, rate: 0.10 },
    { from: 166667, to: 250000, rate: 0.15 },
    { from: 250000, to: 416667, rate: 0.25 },
    { from: 416667, to: null, rate: 0.35 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.30,  // 30% abattement sur salaire imposable
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
    cacRate: 0.10,  // CAC 10% sur IRPP
  },
  minimumWage: 41875,  // SMIG Cameroun XAF
}
