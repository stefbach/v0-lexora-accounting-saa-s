import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const MALI_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'ML',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.18, description: 'Taux normal 18%' },
    { code: 'RED', label: 'TVA Réduite', rate: 0.05, description: 'Équipements informatiques 5%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.30,  // IS 30%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.075, appliesTo: ['SERVICES'] },
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.175, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.10, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.09, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.15, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.01, minAmount: 1500000 },  // 1% du CA, min 1.5M XOF
}
