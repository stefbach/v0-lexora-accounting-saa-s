/**
 * BEPS Pillar Two — Global Minimum Tax 15% (GloBE rules).
 * OECD Model Rules (Dec 2021) + Commentary 2022.
 */

export const PILLAR_TWO_REVENUE_THRESHOLD_EUR = 750_000_000
export const MINIMUM_ETR_PCT = 15

/** SBIE phase-in : 2024 → 5%/5%, dégressif jusqu'à 5%/5% en 2033 (puis stable). */
export function sbieRates(year: number): { payrollPct: number; tangiblesPct: number } {
  // Phase-in OECD Model Rules — taux annuels par défaut conservateurs
  if (year >= 2024) return { payrollPct: 5.0, tangiblesPct: 5.0 }
  // Avant 2024 (transitional) : taux plus élevés
  const transitional: Record<number, { payrollPct: number; tangiblesPct: number }> = {
    2023: { payrollPct: 9.0, tangiblesPct: 7.6 },
    2022: { payrollPct: 9.4, tangiblesPct: 7.8 },
  }
  return transitional[year] || { payrollPct: 5.0, tangiblesPct: 5.0 }
}

export function isInScope(consolidatedRevenueEur: number): boolean {
  return consolidatedRevenueEur >= PILLAR_TWO_REVENUE_THRESHOLD_EUR
}

export function computeEtr(globeIncomeMur: number, coveredTaxesMur: number): number {
  if (globeIncomeMur <= 0) return 0
  return (coveredTaxesMur / globeIncomeMur) * 100
}

export function computeSbie(opts: { payrollMur: number; tangibleAssetsMur: number; year: number }): number {
  const rates = sbieRates(opts.year)
  return opts.payrollMur * (rates.payrollPct / 100) + opts.tangibleAssetsMur * (rates.tangiblesPct / 100)
}

export function computeTopUp(opts: {
  globeIncomeMur: number
  coveredTaxesMur: number
  payrollMur: number
  tangibleAssetsMur: number
  year: number
}): { etrPct: number; sbie: number; excess: number; topUpMur: number; isBelowMinimum: boolean } {
  const etrPct = computeEtr(opts.globeIncomeMur, opts.coveredTaxesMur)
  const sbie = computeSbie(opts)
  const excess = Math.max(0, opts.globeIncomeMur - sbie)
  const topUpMur = etrPct < MINIMUM_ETR_PCT ? excess * (MINIMUM_ETR_PCT - etrPct) / 100 : 0
  return {
    etrPct: Math.round(etrPct * 1000) / 1000,
    sbie: Math.round(sbie * 100) / 100,
    excess: Math.round(excess * 100) / 100,
    topUpMur: Math.round(topUpMur * 100) / 100,
    isBelowMinimum: etrPct < MINIMUM_ETR_PCT,
  }
}
