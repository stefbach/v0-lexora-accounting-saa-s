import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

/**
 * Congo Brazzaville (CG) — CEMAC, devise XAF
 * Source: Code Général des Impôts Congo
 */
export const CONGO_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'CG',
  vatRates: [
    // TVA standard 18% + surtaxe 5% = 18.9% effectif
    { code: 'STD', label: 'TVA Normale', rate: 0.189, description: 'Taux normal 18.9% (TVA 18% + surtaxe 5%)' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Produits exonérés' },
  ],
  corporateIncomeTaxRate: 0.30, // IS 30%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_RESIDENT', rate: 0.077, appliesTo: ['SERVICES'] },
    { code: 'WHT_NON_RESIDENT', rate: 0.20, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_DIVIDENDS', rate: 0.20, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.20, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.20, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.01, minAmount: 1000000 }, // 1% du CA, min 1M XAF
}
