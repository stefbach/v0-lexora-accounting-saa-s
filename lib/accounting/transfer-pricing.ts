/**
 * Transfer Pricing helpers — Maurice TP Act 2023 + OECD TPG 2022.
 */

export type TpMethod = 'CUP' | 'RPM' | 'CPM' | 'TNMM' | 'PSM'

export const TP_METHODS_LABELS: Record<TpMethod, string> = {
  CUP:  'Comparable Uncontrolled Price',
  RPM:  'Resale Price Method',
  CPM:  'Cost Plus Method',
  TNMM: 'Transactional Net Margin Method',
  PSM:  'Profit Split Method',
}

export type RelationshipType = 'parent' | 'subsidiary' | 'sister' | 'common_control' | 'key_management'

export type TpDocumentationTier = 'documentation_required' | 'recommended' | 'optional'

/** Seuils Maurice TP Act 2023 */
export const TP_THRESHOLD_MUR_REQUIRED = 5_000_000
export const TP_THRESHOLD_MUR_RECOMMENDED = 1_000_000
export const CBCR_THRESHOLD_EUR = 750_000_000  // BEPS Action 13

export function getDocumentationTier(amountMur: number): TpDocumentationTier {
  if (amountMur >= TP_THRESHOLD_MUR_REQUIRED) return 'documentation_required'
  if (amountMur >= TP_THRESHOLD_MUR_RECOMMENDED) return 'recommended'
  return 'optional'
}

/** Vérifie si un prix est dans la fourchette arm's length */
export function isArmsLength(price: number, rangeLow: number, rangeHigh: number, toleranceP: number = 0.05): boolean {
  return price >= rangeLow * (1 - toleranceP) && price <= rangeHigh * (1 + toleranceP)
}

/** Recommande la méthode TP appropriée selon le type de transaction */
export function recommendTpMethod(transactionType: string): TpMethod {
  const t = transactionType.toLowerCase()
  if (t.includes('goods') || t.includes('commodity')) return 'CUP'
  if (t.includes('resale') || t.includes('distribution')) return 'RPM'
  if (t.includes('manufacture') || t.includes('production')) return 'CPM'
  if (t.includes('royalt') || t.includes('intangible')) return 'TNMM'
  if (t.includes('integrated') || t.includes('joint')) return 'PSM'
  return 'TNMM'  // fallback : la méthode la plus utilisée en pratique
}

/** Vérifie si la société est dans une MNE éligible CbCR */
export function isCbcrRequired(consolidatedRevenueEur: number): boolean {
  return consolidatedRevenueEur >= CBCR_THRESHOLD_EUR
}
