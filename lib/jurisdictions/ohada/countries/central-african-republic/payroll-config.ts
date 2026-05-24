import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

/**
 * Central African Republic (CF) — CEMAC, devise XAF
 * Source: Code du Travail Centrafrique, OCSS
 */
export const CAR_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'CF',
  cnss: {
    employeeRate: 0.03, // CNSS salarié 3%
    employerRate: 0.19, // CNSS patronal 19%
    cap: 600000,        // XAF — plafond mensuel
  },
  familyAllowances: { rate: 0.12 }, // 12%
  workAccident: { rate: 0.03 }, // 3%
  // IRPP (RCA) — barème mensuel XAF
  incomeTaxBrackets: [
    { from: 0, to: 50000, rate: 0 },
    { from: 50000, to: 100000, rate: 0.08 },
    { from: 100000, to: 200000, rate: 0.15 },
    { from: 200000, to: 400000, rate: 0.28 },
    { from: 400000, to: null, rate: 0.40 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.15, // 15% abattement
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 35000, // SMIG XAF
}
