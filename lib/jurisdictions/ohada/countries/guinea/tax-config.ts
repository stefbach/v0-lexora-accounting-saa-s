import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

/**
 * Guinée (Conakry) — devise GNF
 * Source: Code Général des Impôts Guinée
 */
export const GUINEA_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'GN',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.18, description: 'Taux normal 18%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.25, // IS 25%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.05, appliesTo: ['SERVICES'] },
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.15, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.10, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.10, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.15, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.015, minAmount: 15000000 }, // 1.5% du CA, min 15M GNF
}
