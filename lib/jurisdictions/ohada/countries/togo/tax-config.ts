import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const TOGO_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'TG',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.18, description: 'Taux normal 18%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.27, // IS 27%
  withholdingTaxes: [
    { code: 'WHT_RES', rate: 0.05, appliesTo: ['SERVICES'] },
    { code: 'WHT_NR', rate: 0.20, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.13, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.06, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.15, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.01, minAmount: 500000 }, // 1% du CA, min 500k XOF
}
