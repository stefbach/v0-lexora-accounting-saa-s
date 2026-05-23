import { OhadaTaxConfig } from '../../types/ohada-tax.types';

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
