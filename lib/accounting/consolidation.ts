/**
 * Consolidation IFRS 10 — helpers.
 */

export type RelationshipType = 'subsidiary' | 'associate' | 'joint_venture'
export type ConsolidationMethod = 'full' | 'equity' | 'proportional'

/** Détermine la méthode de consolidation selon IFRS 10 §B86 + IAS 28. */
export function recommendConsolidationMethod(
  pctDetention: number,
  pctVotingRights: number | null,
  hasControl: boolean,
): ConsolidationMethod {
  const voting = pctVotingRights ?? pctDetention
  if (hasControl || voting > 50) return 'full'              // contrôle exclusif → consolidation intégrale
  if (voting >= 20) return 'equity'                          // influence notable → mise en équivalence
  return 'equity'                                            // <20% : pas de consolidation, juste participation
}

/** Calcule le goodwill IFRS 3 à l'acquisition. */
export function computeGoodwill(opts: {
  acquisitionCostMur: number
  fairValueNetAssetsMur: number
  pctDetention: number
}): number {
  const fvAttributable = opts.fairValueNetAssetsMur * (opts.pctDetention / 100)
  return Math.round((opts.acquisitionCostMur - fvAttributable) * 100) / 100
}

/** NCI pct = 100% - pct détention parent */
export function nciPct(pctDetention: number): number {
  return Math.max(0, 100 - pctDetention)
}

/** Test d'impairment goodwill (IAS 36) — approche simplifiée */
export function isGoodwillImpaired(opts: {
  carryingValue: number
  recoverableAmount: number
  toleranceP?: number  // défaut 5%
}): boolean {
  const tol = opts.toleranceP ?? 0.05
  return opts.recoverableAmount < opts.carryingValue * (1 - tol)
}
