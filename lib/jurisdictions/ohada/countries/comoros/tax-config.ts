import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const COMOROS_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'KM',
  vatRates: [
    { code: 'STD', label: 'TVA Comores', rate: 0.10, description: 'Taux normal 10%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.35,  // IS 35%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.10, appliesTo: ['SERVICES'] },
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.15, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.15, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.15, appliesTo: ['INTERESTS'] },
  ],
  minimumCorporateTax: { rate: 0.01, minAmount: 250000 },  // 1% du CA, min 250k KMF
}
