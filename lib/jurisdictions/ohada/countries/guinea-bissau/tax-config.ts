import type { OhadaTaxConfig } from '../../tax/base-tax-engine'

/**
 * Guinée-Bissau (GW) — UEMOA, devise XOF
 * Source: Code Général des Impôts Guinée-Bissau
 */
export const GUINEA_BISSAU_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'GW',
  vatRates: [
    { code: 'STD', label: 'TVA Normale', rate: 0.17, description: 'Taux normal 17%' },
    { code: 'ZERO', label: 'TVA 0%', rate: 0, description: 'Exportations / services essentiels' },
    { code: 'EXEMPT', label: 'Exonéré', rate: 0, description: 'Services financiers, médicaux, éducatifs' },
  ],
  corporateIncomeTaxRate: 0.25, // IS 25%
  withholdingTaxes: [
    { code: 'WHT_SERVICES', rate: 0.10, appliesTo: ['SERVICES'] },
    { code: 'WHT_DIVIDENDS', rate: 0.10, appliesTo: ['DIVIDENDS'] },
    { code: 'WHT_INTERESTS', rate: 0.10, appliesTo: ['INTERESTS'] },
  ],
  minimumCorporateTax: { rate: 0.01, minAmount: 250000 }, // IFU 1% du CA, min 250k XOF
}

export default GUINEA_BISSAU_TAX_CONFIG
