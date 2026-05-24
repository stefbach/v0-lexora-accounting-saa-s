import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

/**
 * Guinée (Conakry) — devise GNF
 * Source: Code du Travail Guinée, CNSS Guinée
 */
export const GUINEA_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'GN',
  cnss: {
    employeeRate: 0.05, // CNSS salarié 5%
    employerRate: 0.18, // CNSS patronal 18%
    cap: 2500000, // GNF — plafond mensuel
  },
  familyAllowances: { rate: 0.06 }, // 6%
  workAccident: { rate: 0.04 }, // 4%
  // RTS (Retenue sur Traitements et Salaires) — barème mensuel GNF
  incomeTaxBrackets: [
    { from: 0, to: 1000000, rate: 0 },
    { from: 1000000, to: 3000000, rate: 0.05 },
    { from: 3000000, to: 5000000, rate: 0.10 },
    { from: 5000000, to: 10000000, rate: 0.15 },
    { from: 10000000, to: null, rate: 0.20 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.30, // 30% abattement
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 550000, // SMIG GNF
}
