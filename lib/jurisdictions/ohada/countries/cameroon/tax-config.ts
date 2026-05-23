import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const CAMEROON_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'CM',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.1925, description: 'Taux normal 19.25% (TVA 17.5% + CAC 10%)' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.33,  // IS 30% + CAC 10% = 33%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.055, appliesTo: ['SERVICES'] },
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.165, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.165, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.165, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.15, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.022, minAmount: 1000000 },  // IMF 2.2%, min 1M XAF
}
