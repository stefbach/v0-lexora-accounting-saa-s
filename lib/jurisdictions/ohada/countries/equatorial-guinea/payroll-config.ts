import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const EQ_GUINEA_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'GQ',
  cnss: {
    employeeRate: 0.045,  // INSESO 4.5%
    employerRate: 0.215,  // INSESO 21.5%
    cap: 600000,  // Cap mensuel XAF
  },
  familyAllowances: { rate: 0.05, cap: undefined },  // 5%
  workAccident: { rate: 0.01 },  // 1%
  // Barème IRPF Guinée Équatoriale (annuel XAF)
  incomeTaxBrackets: [
    { from: 0, to: 1000000, rate: 0.00 },
    { from: 1000000, to: 3000000, rate: 0.10 },
    { from: 3000000, to: 5000000, rate: 0.15 },
    { from: 5000000, to: 10000000, rate: 0.20 },
    { from: 10000000, to: 15000000, rate: 0.25 },
    { from: 15000000, to: 20000000, rate: 0.30 },
    { from: 20000000, to: null, rate: 0.35 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.30,  // 30% abattement sur salaire imposable
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
    cacRate: 0,  // Pas de CAC
  },
  minimumWage: 110000,  // Salaire minimum XAF
}
