// FIXME(lint-fix): @ts-nocheck conservé volontairement — le fichier a des erreurs TS multiples (cf PR #232).
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaTaxConfig } from '../../tax';

export const GUINEA_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'GN',
  country: 'Guinea',
  currency: 'GNF',

  vatRates: {
    standard: 0.18,
    zero: 0.0,
    exempt: null,
  },

  corporateIncomeTax: {
    rate: 0.25,
    jurisdictionCode: 'GN',
  },

  withholdingTax: {
    services_resident: 0.05,
    services_nonresident: 0.15,
    dividends: 0.10,
    interests: 0.10,
    royalties: 0.15,
  },

  minimumCorporateTax: {
    rate: 0.015,
    flatAmount: 15000000, // GNF
    currency: 'GNF',
  },

  deductibilityRules: {
    interest_limitation: null,
    transfer_pricing_required: false,
    documentation_threshold: null,
  },
};