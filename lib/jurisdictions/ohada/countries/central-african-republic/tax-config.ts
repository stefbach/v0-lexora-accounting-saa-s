import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

/**
 * Central African Republic (CF) — CEMAC, devise XAF
 * Source: Code Général des Impôts Centrafrique
 */
export const CAR_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'CF',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.19, description: 'Taux normal 19%' },
    { code: 'REDUCED', label: 'TVA Réduite', rate: 0.05, description: 'Taux réduit 5%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Médical, éducation, assurance, agriculture' },
  ],
  corporateIncomeTaxRate: 0.30, // IS 30%
  withholdingTaxes: [
    { code: 'WHT_SERVICES_NONRESIDENT', rate: 0.05, appliesTo: ['SERVICES_NR'] },
    { code: 'WHT_NON_RESIDENT', rate: 0.15, appliesTo: ['NON_RESIDENT'] },
    { code: 'WHT_DIVIDENDS', rate: 0.15, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.15, appliesTo: ['INTERESTS'] },
    { code: 'WHT_ROYALTIES', rate: 0.15, appliesTo: ['ROYALTIES'] },
  ],
  minimumCorporateTax: { rate: 0.015, minAmount: 500000 }, // IMF 1.5%, min 500k XAF
}
