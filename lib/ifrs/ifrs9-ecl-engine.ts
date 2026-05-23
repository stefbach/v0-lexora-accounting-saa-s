/**
 * IFRS 9 Expected Credit Loss (ECL) Engine
 * Implémente le modèle ECL en 3 étapes (Stage 1/2/3) selon IFRS 9
 */

export type ECLStage = 'STAGE_1' | 'STAGE_2' | 'STAGE_3'

export interface CounterpartyExposure {
  counterpartyId: string
  exposureAtDefault: number  // EAD
  carryingAmount: number
  daysPastDue: number  // DPD
  creditRating?: string  // AAA, AA, A, BBB, BB, B, CCC, D
  countryRiskRating?: string
  industry?: string
  collateralValue?: number
  collateralType?: 'CASH' | 'PROPERTY' | 'GUARANTEE' | 'NONE'
  originationDate: Date
  maturityDate?: Date
  isCreditImpaired: boolean
  hasSICR: boolean  // Significant Increase in Credit Risk
}

export interface ECLParameters {
  pd: number  // Probability of Default (0-1)
  lgd: number  // Loss Given Default (0-1)
  ead: number  // Exposure at Default (currency amount)
  ecl: number  // Expected Credit Loss = PD × LGD × EAD
  stage: ECLStage
  rationale: string
}

export interface MacroScenario {
  name: 'BASE' | 'OPTIMISTIC' | 'PESSIMISTIC'
  weight: number  // Probability weight 0-1
  gdpGrowth: number
  unemploymentRate: number
  inflationRate: number
  fxStress?: number  // For FX-denominated exposures
}

/**
 * Stage classification per IFRS 9 paragraph 5.5
 */
export function classifyStage(exposure: CounterpartyExposure): ECLStage {
  // Stage 3: Credit-impaired (already in default)
  if (exposure.isCreditImpaired || exposure.daysPastDue >= 90) {
    return 'STAGE_3'
  }

  // Stage 2: Significant Increase in Credit Risk (SICR)
  if (exposure.hasSICR || exposure.daysPastDue >= 30) {
    return 'STAGE_2'
  }

  // Stage 1: Performing (low credit risk)
  return 'STAGE_1'
}

/**
 * Default PD rates by credit rating (annualized).
 * Based on Moody's/S&P historical default rates.
 */
export const DEFAULT_PD_BY_RATING: Record<string, number> = {
  'AAA': 0.0001,
  'AA': 0.0003,
  'A': 0.0008,
  'BBB': 0.0024,
  'BB': 0.0090,
  'B': 0.0350,
  'CCC': 0.1500,
  'D': 1.0000,
}

/**
 * Default LGD rates by collateral type (per Basel III).
 */
export const DEFAULT_LGD_BY_COLLATERAL: Record<string, number> = {
  'CASH': 0.10,
  'PROPERTY': 0.25,
  'GUARANTEE': 0.40,
  'NONE': 0.65,
}

/**
 * Calculate ECL for an exposure with macro adjustment.
 */
export function calculateECL(
  exposure: CounterpartyExposure,
  scenarios: MacroScenario[] = [
    { name: 'BASE', weight: 0.50, gdpGrowth: 0.03, unemploymentRate: 0.07, inflationRate: 0.02 },
    { name: 'OPTIMISTIC', weight: 0.25, gdpGrowth: 0.05, unemploymentRate: 0.05, inflationRate: 0.015 },
    { name: 'PESSIMISTIC', weight: 0.25, gdpGrowth: -0.01, unemploymentRate: 0.10, inflationRate: 0.04 },
  ]
): ECLParameters {
  const stage = classifyStage(exposure)

  // Base PD from rating
  const basePd = DEFAULT_PD_BY_RATING[exposure.creditRating ?? 'BB'] ?? 0.03

  // Adjust for stage
  let stagedPd = basePd
  let timeHorizon = '12 months'

  if (stage === 'STAGE_2') {
    // Lifetime PD = base PD × (maturity / 12 months)
    const monthsToMaturity = exposure.maturityDate
      ? Math.max(1, (exposure.maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
      : 60  // Default 5 years if no maturity
    stagedPd = Math.min(1, basePd * (monthsToMaturity / 12))
    timeHorizon = `${Math.round(monthsToMaturity)} months (lifetime)`
  } else if (stage === 'STAGE_3') {
    stagedPd = 1.0  // Default has occurred
    timeHorizon = 'lifetime'
  }

  // Macro-economic overlay (weighted average)
  const macroAdjustment = scenarios.reduce((sum, scenario) => {
    let adj = 1
    // Pessimistic scenarios increase PD
    if (scenario.gdpGrowth < 0) adj += Math.abs(scenario.gdpGrowth) * 2
    if (scenario.unemploymentRate > 0.08) adj += (scenario.unemploymentRate - 0.08) * 5
    return sum + (adj * scenario.weight)
  }, 0)

  const finalPd = Math.min(1, stagedPd * macroAdjustment)

  // LGD with collateral consideration
  let lgd = DEFAULT_LGD_BY_COLLATERAL[exposure.collateralType ?? 'NONE']
  if (exposure.collateralValue && exposure.collateralValue > 0) {
    const collateralCoverage = Math.min(1, exposure.collateralValue / exposure.exposureAtDefault)
    lgd = lgd * (1 - collateralCoverage * 0.5)  // Collateral reduces LGD
  }

  // EAD
  const ead = exposure.exposureAtDefault

  // ECL = PD × LGD × EAD
  const ecl = finalPd * lgd * ead

  const rationale = `${stage}: Base PD ${(basePd * 100).toFixed(2)}% (${exposure.creditRating ?? 'unrated'}), ` +
    `Staged PD ${(stagedPd * 100).toFixed(2)}% (${timeHorizon}), ` +
    `Macro adj ×${macroAdjustment.toFixed(2)}, ` +
    `LGD ${(lgd * 100).toFixed(0)}%, ECL=${ecl.toFixed(0)}`

  return { pd: finalPd, lgd, ead, ecl, stage, rationale }
}

/**
 * Calculate portfolio-level ECL with aggregation.
 */
export interface PortfolioECL {
  totalExposure: number
  totalECL: number
  byStage: Record<ECLStage, { exposure: number; ecl: number; count: number }>
  coverageRatio: number  // ECL / Total Exposure
}

export function calculatePortfolioECL(
  exposures: CounterpartyExposure[],
  scenarios?: MacroScenario[]
): PortfolioECL {
  const byStage = {
    STAGE_1: { exposure: 0, ecl: 0, count: 0 },
    STAGE_2: { exposure: 0, ecl: 0, count: 0 },
    STAGE_3: { exposure: 0, ecl: 0, count: 0 },
  } satisfies Record<ECLStage, { exposure: number; ecl: number; count: number }>

  let totalExposure = 0
  let totalECL = 0

  for (const exposure of exposures) {
    const ecl = calculateECL(exposure, scenarios)
    byStage[ecl.stage].exposure += ecl.ead
    byStage[ecl.stage].ecl += ecl.ecl
    byStage[ecl.stage].count += 1
    totalExposure += ecl.ead
    totalECL += ecl.ecl
  }

  return {
    totalExposure,
    totalECL,
    byStage,
    coverageRatio: totalExposure > 0 ? totalECL / totalExposure : 0,
  }
}

/**
 * Generate IFRS 7 disclosure for credit risk.
 */
export function generateIFRS7Disclosure(portfolio: PortfolioECL) {
  return {
    creditQuality: {
      stage1: {
        gross: portfolio.byStage.STAGE_1.exposure,
        ecl: portfolio.byStage.STAGE_1.ecl,
        count: portfolio.byStage.STAGE_1.count,
        coverage: portfolio.byStage.STAGE_1.exposure > 0
          ? portfolio.byStage.STAGE_1.ecl / portfolio.byStage.STAGE_1.exposure
          : 0,
      },
      stage2: {
        gross: portfolio.byStage.STAGE_2.exposure,
        ecl: portfolio.byStage.STAGE_2.ecl,
        count: portfolio.byStage.STAGE_2.count,
        coverage: portfolio.byStage.STAGE_2.exposure > 0
          ? portfolio.byStage.STAGE_2.ecl / portfolio.byStage.STAGE_2.exposure
          : 0,
      },
      stage3: {
        gross: portfolio.byStage.STAGE_3.exposure,
        ecl: portfolio.byStage.STAGE_3.ecl,
        count: portfolio.byStage.STAGE_3.count,
        coverage: portfolio.byStage.STAGE_3.exposure > 0
          ? portfolio.byStage.STAGE_3.ecl / portfolio.byStage.STAGE_3.exposure
          : 0,
      },
    },
    totals: {
      grossExposure: portfolio.totalExposure,
      totalECL: portfolio.totalECL,
      overallCoverage: portfolio.coverageRatio,
    },
  }
}
