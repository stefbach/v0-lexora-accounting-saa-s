/**
 * IAS 38 Intangible Assets
 * Covers internally generated intangibles, research/development, amortization
 */

export interface IntangibleAsset {
  assetId: string
  description: string
  classification: 'PURCHASED' | 'INTERNALLY_GENERATED' | 'BUSINESS_COMBINATION'
  type: 'SOFTWARE' | 'PATENT' | 'TRADEMARK' | 'CUSTOMER_LIST' | 'LICENSE' | 'OTHER'
  costAtRecognition: number
  amortizationMethod: 'STRAIGHT_LINE' | 'UNITS_OF_PRODUCTION' | 'DECLINING_BALANCE'
  usefulLifeYears: number | 'INDEFINITE'
  residualValue: number
  acquisitionDate: Date
  hasActiveMarket: boolean
}

export interface DevelopmentProject {
  projectId: string
  description: string
  phase: 'RESEARCH' | 'DEVELOPMENT'
  expensesByPeriod: Array<{ period: string; amount: number; capitalizable: boolean }>
  technicalFeasibility: boolean
  intentionToComplete: boolean
  abilityToUse: boolean
  futureBenefitsProbable: boolean
  resourcesAvailable: boolean
  reliableMeasurement: boolean
}

/**
 * Determine if development costs can be capitalized (IAS 38.57).
 * All 6 criteria must be met.
 */
export function canCapitalizeDevelopment(project: DevelopmentProject): {
  canCapitalize: boolean
  reasons: string[]
} {
  const reasons: string[] = []

  if (project.phase === 'RESEARCH') {
    reasons.push('Phase de recherche - les coûts doivent être passés en charge (IAS 38.54)')
    return { canCapitalize: false, reasons }
  }

  if (!project.technicalFeasibility) reasons.push('Pas de faisabilité technique démontrée')
  if (!project.intentionToComplete) reasons.push('Pas d\'intention de compléter')
  if (!project.abilityToUse) reasons.push('Capacité d\'utiliser non démontrée')
  if (!project.futureBenefitsProbable) reasons.push('Bénéfices futurs non probables')
  if (!project.resourcesAvailable) reasons.push('Ressources non disponibles')
  if (!project.reliableMeasurement) reasons.push('Mesure non fiable')

  return { canCapitalize: reasons.length === 0, reasons }
}

/**
 * Calculate annual amortization for an intangible.
 */
export function calculateAmortization(asset: IntangibleAsset): number {
  if (asset.usefulLifeYears === 'INDEFINITE') {
    return 0  // No amortization, only annual impairment test
  }

  const depreciableAmount = asset.costAtRecognition - asset.residualValue

  switch (asset.amortizationMethod) {
    case 'STRAIGHT_LINE':
      return depreciableAmount / asset.usefulLifeYears
    case 'DECLINING_BALANCE':
      return depreciableAmount * (2 / asset.usefulLifeYears)
    case 'UNITS_OF_PRODUCTION':
      return 0  // Requires units data
    default:
      return depreciableAmount / asset.usefulLifeYears
  }
}

/**
 * Generate IAS 38 journal entries.
 */
export function generateIAS38Entries(asset: IntangibleAsset, currentYearAmortization: number) {
  return [
    { account: '6811', debit: currentYearAmortization, credit: 0, description: `Amortization ${asset.description}` },
    { account: '281', debit: 0, credit: currentYearAmortization, description: 'Accumulated amortization' },
  ]
}
