import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const CHAD_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'TD',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.18, description: 'Taux normal 18%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.35,  // IS 35% - taux le plus élevé OHADA
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.125, appliesTo: ['SERVICES'] },
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.25, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.20, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.25, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.25, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.015, minAmount: 500000 },  // Impôt minimum 1.5%, min 500k XAF
}
