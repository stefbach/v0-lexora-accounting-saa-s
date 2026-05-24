import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

/**
 * Congo Brazzaville (CG) — CEMAC, devise XAF
 * Source: Code du Travail Congo, CNSS Congo
 */
export const CONGO_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'CG',
  cnss: {
    employeeRate: 0.04,  // CNSS salarié 4%
    employerRate: 0.205, // CNSS patronal 20.5%
    cap: 1200000,        // XAF — plafond mensuel
  },
  familyAllowances: { rate: 0.10 }, // 10%
  workAccident: { rate: 0.0225 }, // 2.25%
  // IRPP Congo — barème annuel XAF
  incomeTaxBrackets: [
    { from: 0, to: 464000, rate: 0.01 },
    { from: 464000, to: 1000000, rate: 0.10 },
    { from: 1000000, to: 3000000, rate: 0.25 },
    { from: 3000000, to: null, rate: 0.40 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.20, // 20% abattement
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 90000, // SMIG XAF
}
