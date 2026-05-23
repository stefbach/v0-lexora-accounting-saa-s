import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

export const BENIN_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'BJ',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.18, description: 'Taux normal 18%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.30,  // IS 30%
  withholdingTaxes: [
    { code: 'WHT_RES', rate: 0.05, appliesTo: ['SERVICES'] },
    { code: 'WHT_NR', rate: 0.12, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.15, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.06, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.12, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.0125, minAmount: 250000 },  // 1.25% du CA, min 250k XOF
}
