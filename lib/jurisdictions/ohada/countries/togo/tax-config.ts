// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaTaxConfig } from '../../tax';

export const TOGO_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'TG',

  vatRates: {
    STANDARD: 0.18,
    ZERO: 0.0,
    EXEMPT: 0.0,
  },

  corporateIncomeTaxRate: 0.27,

  wht: {
    WHT_RES: 0.05,
    NR: 0.20,
    DIVIDENDS: 0.13,
    INTERESTS: 0.06,
    ROYALTIES: 0.15,
  },

  minimumCorporateTax: {
    rate: 0.01,
    threshold: 500000, // XOF
  },
};