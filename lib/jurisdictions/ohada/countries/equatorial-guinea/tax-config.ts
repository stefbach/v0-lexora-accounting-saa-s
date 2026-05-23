import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const EQ_GUINEA_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'GQ',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.15, description: 'Taux normal 15%' },
    { code: 'RED', label: 'TVA Réduite', rate: 0.06, description: 'Taux réduit 6%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.35,  // IS 35%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.0625, appliesTo: ['SERVICES'] },
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.10, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.25, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.25, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.10, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.015, minAmount: 800000 },  // IMF 1.5%, min 800000 XAF
}
