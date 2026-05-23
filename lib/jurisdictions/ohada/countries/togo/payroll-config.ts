// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaPayrollConfig } from '../../payroll';

export const TOGO_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'TG',

  cnss: {
    employee: 0.04,
    employer: 0.175,
    cap: 400000, // XOF
  },

  familyAllowances: 0.03,

  workAccident: 0.02,

  irpp: {
    brackets: [
      {
        min: 0,
        max: 60000,
        rate: 0.005, // 0.5%
      },
      {
        min: 60000,
        max: 150000,
        rate: 0.07, // 7%
      },
      {
        min: 150000,
        max: 300000,
        rate: 0.15, // 15%
      },
      {
        min: 300000,
        max: 500000,
        rate: 0.25, // 25%
      },
      {
        min: 500000,
        max: 800000,
        rate: 0.30, // 30%
      },
      {
        min: 800000,
        max: Infinity,
        rate: 0.35, // 35%
      },
    ],
  },

  abatementSalaire: 0.28, // 28%

  minimumWage: 35000, // XOF
};