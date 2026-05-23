// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaPayrollConfig } from '../../payroll';

export const GUINEA_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'GN',
  country: 'Guinea',
  currency: 'GNF',

  cnss: {
    name: 'CNSS Guinée',
    employee_rate: 0.05,
    employer_rate: 0.18,
    ceiling: 2500000, // GNF
    ceiling_currency: 'GNF',
  },

  familyAllowances: {
    rate: 0.06,
  },

  workAccidentInsurance: {
    rate: 0.04,
  },

  rts: {
    name: 'Retenue sur Traitements et Salaires (RTS)',
    type: 'monthly_progressive',
    brackets: [
      {
        min: 0,
        max: 1000000,
        rate: 0.0,
      },
      {
        min: 1000000,
        max: 3000000,
        rate: 0.05,
      },
      {
        min: 3000000,
        max: 5000000,
        rate: 0.10,
      },
      {
        min: 5000000,
        max: 10000000,
        rate: 0.15,
      },
      {
        min: 10000000,
        max: Infinity,
        rate: 0.20,
      },
    ],
    currency: 'GNF',
  },

  abatement: {
    salary_abatement: 0.30, // 30% abatement on salary
  },

  minimumWage: {
    amount: 550000, // GNF
    currency: 'GNF',
  },
};