/**
 * IFRS 13 Fair Value Measurement
 * Implements the fair value hierarchy (Level 1, 2, 3) and measurement techniques.
 */

export type FairValueLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3'

export interface FairValueMeasurement {
  assetOrLiabilityId: string
  assetType: AssetType
  carryingAmount: number
  fairValue: number
  fairValueLevel: FairValueLevel
  valuationTechnique: ValuationTechnique
  observableInputs: Input[]
  unobservableInputs: Input[]
  valuationDate: Date
  currency: string
  uncertaintyDisclosure?: SensitivityDisclosure[]
}

export type AssetType =
  | 'QUOTED_EQUITY'
  | 'UNQUOTED_EQUITY'
  | 'BOND_LISTED'
  | 'BOND_UNLISTED'
  | 'DERIVATIVE'
  | 'REAL_ESTATE'
  | 'INVESTMENT_PROPERTY'
  | 'INTANGIBLE'
  | 'GOODWILL'
  | 'BIOLOGICAL'

export type ValuationTechnique =
  | 'MARKET_APPROACH'  // Quoted prices
  | 'INCOME_APPROACH'  // DCF, capitalization
  | 'COST_APPROACH'    // Replacement cost

export interface Input {
  name: string
  value: number | string
  isObservable: boolean
  source?: string
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface SensitivityDisclosure {
  inputName: string
  baseValue: number
  variation: number  // % change tested
  fvImpactPositive: number  // FV when input +variation
  fvImpactNegative: number  // FV when input -variation
}

/**
 * Determine the fair value hierarchy level based on inputs.
 */
export function determineFVLevel(measurement: Partial<FairValueMeasurement>): FairValueLevel {
  const hasUnobservable = (measurement.unobservableInputs?.length ?? 0) > 0
  const significantUnobservable = measurement.unobservableInputs?.some(
    i => i.confidenceLevel === 'LOW' || i.confidenceLevel === 'MEDIUM'
  )
  const hasOnlyQuotedPrices = (measurement.observableInputs?.length ?? 0) === 1
    && measurement.observableInputs?.[0]?.name === 'quoted_price'

  if (hasOnlyQuotedPrices) return 'LEVEL_1'
  if (hasUnobservable && significantUnobservable) return 'LEVEL_3'
  return 'LEVEL_2'
}

/**
 * Level 1: Quoted prices in active markets.
 */
export function measureLevel1(quotedPrice: number, quantity: number, currency = 'MUR'): Pick<FairValueMeasurement, 'fairValue' | 'fairValueLevel' | 'valuationTechnique' | 'observableInputs'> {
  return {
    fairValue: quotedPrice * quantity,
    fairValueLevel: 'LEVEL_1',
    valuationTechnique: 'MARKET_APPROACH',
    observableInputs: [
      { name: 'quoted_price', value: quotedPrice, isObservable: true, source: 'Active market', confidenceLevel: 'HIGH' },
      { name: 'quantity', value: quantity, isObservable: true, confidenceLevel: 'HIGH' },
    ],
  }
}

/**
 * Level 2: Inputs other than quoted prices that are observable.
 * Example: Discounted Cash Flow using observable interest rates.
 */
export interface DCFInputs {
  cashFlows: number[]  // Projected cash flows by period
  discountRate: number
  terminalValue?: number
}

export function measureLevel2_DCF(inputs: DCFInputs): Pick<FairValueMeasurement, 'fairValue' | 'fairValueLevel' | 'valuationTechnique' | 'observableInputs'> {
  const pv = inputs.cashFlows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + inputs.discountRate, i + 1), 0)
  const terminalPV = inputs.terminalValue
    ? inputs.terminalValue / Math.pow(1 + inputs.discountRate, inputs.cashFlows.length)
    : 0

  return {
    fairValue: pv + terminalPV,
    fairValueLevel: 'LEVEL_2',
    valuationTechnique: 'INCOME_APPROACH',
    observableInputs: [
      { name: 'discount_rate', value: inputs.discountRate, isObservable: true, confidenceLevel: 'HIGH' },
      { name: 'cash_flows', value: inputs.cashFlows.join(','), isObservable: true, confidenceLevel: 'MEDIUM' },
    ],
  }
}

/**
 * Level 3: Significant unobservable inputs.
 * Example: Internal models for unquoted equity, illiquid assets.
 */
export interface Level3Inputs {
  expectedCashFlows: number[]
  growthRate: number  // Unobservable
  riskAdjustedDiscountRate: number  // Unobservable internal estimate
  marketAdjustment?: number  // Liquidity / control premium/discount
}

export function measureLevel3(inputs: Level3Inputs): Pick<FairValueMeasurement, 'fairValue' | 'fairValueLevel' | 'valuationTechnique' | 'observableInputs' | 'unobservableInputs'> {
  // DCF with growth + risk premium
  const fv = inputs.expectedCashFlows.reduce((sum, cf, i) => {
    const grownCf = cf * Math.pow(1 + inputs.growthRate, i)
    return sum + grownCf / Math.pow(1 + inputs.riskAdjustedDiscountRate, i + 1)
  }, 0)

  const adjustedFv = fv * (1 + (inputs.marketAdjustment ?? 0))

  return {
    fairValue: adjustedFv,
    fairValueLevel: 'LEVEL_3',
    valuationTechnique: 'INCOME_APPROACH',
    observableInputs: [],
    unobservableInputs: [
      { name: 'growth_rate', value: inputs.growthRate, isObservable: false, confidenceLevel: 'LOW' },
      { name: 'risk_adjusted_discount_rate', value: inputs.riskAdjustedDiscountRate, isObservable: false, confidenceLevel: 'MEDIUM' },
      ...(inputs.marketAdjustment ? [{ name: 'market_adjustment', value: inputs.marketAdjustment, isObservable: false, confidenceLevel: 'LOW' as const }] : []),
    ],
  }
}

/**
 * Sensitivity analysis for Level 3 disclosures (IFRS 13.93(h)).
 */
export function calculateSensitivity(
  baseInputs: Level3Inputs,
  inputName: keyof Level3Inputs,
  variationPercent: number = 0.10
): SensitivityDisclosure {
  const baseValue = baseInputs[inputName] as number
  const baseFv = measureLevel3(baseInputs).fairValue

  const positiveInputs = { ...baseInputs, [inputName]: baseValue * (1 + variationPercent) }
  const negativeInputs = { ...baseInputs, [inputName]: baseValue * (1 - variationPercent) }

  const positiveFv = measureLevel3(positiveInputs).fairValue
  const negativeFv = measureLevel3(negativeInputs).fairValue

  return {
    inputName: inputName as string,
    baseValue,
    variation: variationPercent,
    fvImpactPositive: positiveFv - baseFv,
    fvImpactNegative: negativeFv - baseFv,
  }
}

/**
 * Generate IFRS 13 disclosure for the notes.
 */
export function generateIFRS13Disclosure(measurements: FairValueMeasurement[]) {
  const byLevel = {
    LEVEL_1: measurements.filter(m => m.fairValueLevel === 'LEVEL_1'),
    LEVEL_2: measurements.filter(m => m.fairValueLevel === 'LEVEL_2'),
    LEVEL_3: measurements.filter(m => m.fairValueLevel === 'LEVEL_3'),
  }

  return {
    hierarchy: {
      level1: { count: byLevel.LEVEL_1.length, totalFV: byLevel.LEVEL_1.reduce((s, m) => s + m.fairValue, 0) },
      level2: { count: byLevel.LEVEL_2.length, totalFV: byLevel.LEVEL_2.reduce((s, m) => s + m.fairValue, 0) },
      level3: { count: byLevel.LEVEL_3.length, totalFV: byLevel.LEVEL_3.reduce((s, m) => s + m.fairValue, 0) },
    },
    level3Disclosure: byLevel.LEVEL_3.map(m => ({
      assetId: m.assetOrLiabilityId,
      fairValue: m.fairValue,
      unobservableInputs: m.unobservableInputs,
      sensitivity: m.uncertaintyDisclosure,
    })),
  }
}
