import { OhadaTaxConfig } from '../../types';

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
