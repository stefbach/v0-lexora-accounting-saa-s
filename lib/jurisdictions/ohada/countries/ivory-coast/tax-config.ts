import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const IVORY_COAST_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'CI',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.18, description: 'Taux normal 18%' },
    { code: 'RED', label: 'TVA Réduite', rate: 0.09, description: 'Taux réduit 9%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.25,  // IS 25%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.05, appliesTo: ['SERVICES'] },
    { code: 'WHT_NONRESIDENT', rate: 0.25, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.15, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.18, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.20, appliesTo: ['ROYALTIES'] },
    { code: 'ITS', rate: 0, appliesTo: ['SALARIES'] },  // Impôt sur traitements et salaires (via IRPP)
  ],
  minimumCorporateTax: { rate: 0.005, minAmount: 3000000 },  // IMF 0.5% CA, min 3M XOF
}
