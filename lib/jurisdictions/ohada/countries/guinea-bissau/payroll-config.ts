import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

/**
 * Guinée-Bissau (GW) — UEMOA, devise XOF
 * Organisme: INPS (Institut National de Prévoyance Sociale)
 */
export const GUINEA_BISSAU_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'GW',
  cnss: {
    employeeRate: 0.08, // INPS salarié 8%
    employerRate: 0.14, // INPS patronal 14%
    cap: 250000, // XOF — salaire plafonné
  },
  familyAllowances: { rate: 0.02 }, // 2%
  workAccident: { rate: 0.015 }, // 1.5%
  // IRPP (Impôt sur le Revenu) — barème mensuel XOF
  incomeTaxBrackets: [
    { from: 0, to: 50000, rate: 0.01 },
    { from: 50000, to: 100000, rate: 0.06 },
    { from: 100000, to: 200000, rate: 0.10 },
    { from: 200000, to: 500000, rate: 0.15 },
    { from: 500000, to: null, rate: 0.20 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.10, // 10% abattement forfaitaire
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 28000, // SMIG XOF
}
