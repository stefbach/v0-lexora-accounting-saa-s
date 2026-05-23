import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const GABON_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'GA',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.18, description: 'Taux normal 18%' },
    { code: 'RED', label: 'TVA Réduite', rate: 0.10, description: 'Taux réduit 10%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.30,  // IS 30%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.095, appliesTo: ['SERVICES'] },
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.20, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.20, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.20, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.20, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.01, minAmount: 1000000 },  // 1% du CA, min 1M XAF
}
