/**
 * IAS 36 Impairment of Assets
 * Impairment test: Carrying Amount > Recoverable Amount → Impairment loss
 * Recoverable Amount = max(Fair Value less costs to sell, Value in Use)
 */

export interface ImpairmentTestable {
  assetId: string
  assetType: 'GOODWILL' | 'TANGIBLE' | 'INTANGIBLE' | 'CGU'  // Cash-Generating Unit
  carryingAmount: number
  isIndependentCashFlows: boolean
  fairValueLessCostsToSell?: number
  cashGeneratingUnit?: string  // ID of CGU if grouped
  hasIndicatorsOfImpairment: boolean
  isGoodwillOrIntangibleWithIndefiniteLife: boolean  // Annual test required
}

export interface CashGeneratingUnit {
  cguId: string
  description: string
  assets: string[]  // Asset IDs
  totalCarryingAmount: number
  goodwillAllocated: number
  projectedCashFlows: number[]  // Years 1-5 typically
  growthRate: number  // Terminal growth (e.g., 0.02 = 2%)
  discountRate: number  // Pre-tax discount rate (WACC)
  budgetYears: number
}

export interface ImpairmentTestResult {
  assetId: string
  carryingAmount: number
  recoverableAmount: number
  fairValueLessCostsToSell: number
  valueInUse: number
  impairmentLoss: number
  impairmentExists: boolean
  testDate: Date
  reversalRoom?: number  // For non-goodwill: how much can be reversed if recovery
}

/**
 * Calculate Value in Use (VIU) using discounted cash flows.
 */
export function calculateValueInUse(cgu: CashGeneratingUnit): number {
  const { projectedCashFlows, growthRate, discountRate, budgetYears } = cgu

  // Sum of PV of explicit forecast period
  let viu = projectedCashFlows.reduce((sum, cf, i) => {
    return sum + cf / Math.pow(1 + discountRate, i + 1)
  }, 0)

  // Terminal value (perpetuity with growth)
  if (projectedCashFlows.length > 0 && discountRate > growthRate) {
    const finalCf = projectedCashFlows[projectedCashFlows.length - 1]
    const terminalValue = (finalCf * (1 + growthRate)) / (discountRate - growthRate)
    const tvPv = terminalValue / Math.pow(1 + discountRate, budgetYears)
    viu += tvPv
  }

  return viu
}

/**
 * Perform IAS 36 impairment test on a single asset or CGU.
 */
export function performImpairmentTest(
  asset: ImpairmentTestable,
  cgu?: CashGeneratingUnit
): ImpairmentTestResult {
  // For non-goodwill, test only if indicators exist (IAS 36.9)
  // For goodwill / indefinite-life intangibles, test annually (IAS 36.10)

  const fvlcs = asset.fairValueLessCostsToSell ?? 0

  // Calculate VIU if CGU provided
  const viu = cgu ? calculateValueInUse(cgu) : 0

  // Recoverable amount = max(FVLCS, VIU)
  const recoverableAmount = Math.max(fvlcs, viu)

  const impairmentLoss = Math.max(0, asset.carryingAmount - recoverableAmount)

  return {
    assetId: asset.assetId,
    carryingAmount: asset.carryingAmount,
    recoverableAmount,
    fairValueLessCostsToSell: fvlcs,
    valueInUse: viu,
    impairmentLoss,
    impairmentExists: impairmentLoss > 0,
    testDate: new Date(),
    // Goodwill impairment cannot be reversed (IAS 36.124)
    reversalRoom: asset.assetType === 'GOODWILL' ? 0 : impairmentLoss,
  }
}

/**
 * Allocate impairment loss to assets within a CGU.
 * Order per IAS 36.104:
 * 1. Reduce goodwill first
 * 2. Then pro-rata to other assets (but not below their RA or zero)
 */
export interface CGUAsset {
  assetId: string
  carryingAmount: number
  recoverableAmount?: number  // Individual RA if determinable
  isGoodwill: boolean
}

export function allocateCGUImpairment(
  cguAssets: CGUAsset[],
  totalImpairmentLoss: number
): Array<{ assetId: string; allocatedLoss: number; newCarryingAmount: number }> {
  if (totalImpairmentLoss <= 0) {
    return cguAssets.map(a => ({
      assetId: a.assetId,
      allocatedLoss: 0,
      newCarryingAmount: a.carryingAmount
    }))
  }

  let remainingLoss = totalImpairmentLoss
  const allocations: Array<{ assetId: string; allocatedLoss: number; newCarryingAmount: number }> = []

  // Step 1: Reduce goodwill first
  const goodwillAssets = cguAssets.filter(a => a.isGoodwill)
  for (const gw of goodwillAssets) {
    const lossToGw = Math.min(remainingLoss, gw.carryingAmount)
    allocations.push({
      assetId: gw.assetId,
      allocatedLoss: lossToGw,
      newCarryingAmount: gw.carryingAmount - lossToGw,
    })
    remainingLoss -= lossToGw
  }

  // Step 2: Pro-rata to remaining assets
  if (remainingLoss > 0) {
    const otherAssets = cguAssets.filter(a => !a.isGoodwill)
    const totalOtherCA = otherAssets.reduce((s, a) => s + a.carryingAmount, 0)

    for (const asset of otherAssets) {
      const proRataLoss = (asset.carryingAmount / totalOtherCA) * remainingLoss
      // Don't reduce below recoverable amount or zero
      const floor = Math.max(0, asset.recoverableAmount ?? 0)
      const actualLoss = Math.min(proRataLoss, asset.carryingAmount - floor)

      allocations.push({
        assetId: asset.assetId,
        allocatedLoss: actualLoss,
        newCarryingAmount: asset.carryingAmount - actualLoss,
      })
    }
  }

  return allocations
}

/**
 * Check for indicators of impairment (IAS 36.12).
 */
export interface ImpairmentIndicators {
  externalIndicators: {
    significantDeclineInMarketValue: boolean
    significantChangesInTechEnvironment: boolean
    interestRatesIncreased: boolean
    netAssetsExceedMarketCap: boolean
  }
  internalIndicators: {
    obsolescenceOrPhysicalDamage: boolean
    significantChangesInUse: boolean  // Idle, restructuring plan
    economicPerformanceWorseThanExpected: boolean
  }
}

export function hasImpairmentIndicators(indicators: ImpairmentIndicators): boolean {
  return Object.values(indicators.externalIndicators).some(v => v) ||
         Object.values(indicators.internalIndicators).some(v => v)
}

/**
 * Generate IAS 36 impairment journal entries.
 */
export function generateIAS36Entries(result: ImpairmentTestResult, isCGU: boolean = false) {
  if (!result.impairmentExists) return []

  if (isCGU) {
    return [
      { account: '6815', debit: result.impairmentLoss, credit: 0, description: 'Impairment loss on CGU (P&L)' },
      { account: '291', debit: 0, credit: result.impairmentLoss, description: 'Accumulated impairment on CGU' },
    ]
  }

  return [
    { account: '6816', debit: result.impairmentLoss, credit: 0, description: 'Impairment loss (P&L)' },
    { account: '29', debit: 0, credit: result.impairmentLoss, description: 'Accumulated impairment' },
  ]
}
