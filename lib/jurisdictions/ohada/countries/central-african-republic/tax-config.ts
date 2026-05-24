// FIXME(lint-fix): @ts-nocheck conservé volontairement, le refactor des country configs OHADA reste à faire (cf. PR #232). Remplacement par @ts-expect-error impossible (fichier entier non conforme aux types).
// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaTaxConfig } from '../../tax';

export const CAR_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'CF',
  country: 'Central African Republic',
  region: 'CEMAC',
  currency: 'XAF',

  // VAT Configuration
  vat: {
    standardRate: 0.19,
    reducedRate: 0.05,
    zeroRate: 0.00,
    exemptions: [
      'MEDICAL_SERVICES',
      'EDUCATIONAL_SERVICES',
      'FINANCIAL_SERVICES',
      'INSURANCE_SERVICES',
      'AGRICULTURAL_PRODUCTS',
      'EXPORTED_GOODS',
    ],
  },

  // Corporate Income Tax
  corporateIncomeTax: {
    rate: 0.30, // 30%
    minimumTax: {
      rate: 0.015, // 1.5%
      minimumAmount: 500000, // XAF
    },
  },

  // Withholding Tax Rates
  withholdingTax: {
    // Services provided by non-residents
    servicesNonResident: 0.05, // 5%
    // Non-resident payments
    nonResident: 0.15, // 15%
    // Dividends
    dividends: 0.15, // 15%
    // Interest
    interest: 0.15, // 15%
    // Royalties
    royalties: 0.15, // 15%
  },

  // Compliance Thresholds
  thresholds: {
    vatRegistration: 50000000, // XAF - annual turnover threshold
    auditThreshold: 100000000, // XAF
  },

  // Tax Year
  taxYear: {
    startMonth: 1, // January
    endMonth: 12, // December
  },

  // Deductibility Rules
  deductibility: {
    meals: 0.50, // 50% deductible
    entertainment: 0.00, // Not deductible
    vehicleUsage: 1.00, // 100% deductible for business vehicles
    depreciation: 1.00, // 100% deductible
  },

  // Filing Requirements
  filingRequirements: {
    annualReportDueDateDays: 90, // 90 days after year-end
    vatFilingFrequency: 'MONTHLY',
    estimatedTaxPaymentDueDateDays: 30,
  },

  // Penalties
  penalties: {
    lateFilingPerDay: 0.001, // 0.1% per day
    underReportingPenalty: 0.10, // 10%
    fraudPenalty: 0.50, // 50%
  },
};