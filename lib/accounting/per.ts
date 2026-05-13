/**
 * Partial Exemption Regime (PER) — Income Tax Act 1995 §50C.
 *
 * Une GBC peut bénéficier d'une exonération de 80% sur certains revenus
 * de source étrangère, à condition de remplir les substance requirements.
 * IS effectif = 15% × 20% = 3% sur revenu PER-éligible.
 *
 * 7 catégories prévues par la loi (voir migration 250).
 */

export type PerCategory =
  | 'foreign_dividends'
  | 'foreign_interest'
  | 'foreign_pe_profits'
  | 'foreign_royalties'
  | 'ship_aircraft'
  | 'cis_reinsurance'
  | 'not_eligible'

export const PER_EXEMPTION_PCT: Record<PerCategory, number> = {
  foreign_dividends:  80,
  foreign_interest:   80,
  foreign_pe_profits: 80,
  foreign_royalties:  80,
  ship_aircraft:      80,
  cis_reinsurance:    80,
  not_eligible:        0,
}

export const CORPORATE_TAX_RATE_PCT = 15

/**
 * Calcule l'IS effectif pour un revenu donné.
 * Pour PER-éligible : 15% × (1 - 80%) = 3%.
 * Pour non éligible : 15%.
 *
 * Requiert substance_met = true pour que le PER s'applique réellement
 * (sinon retraitement comme non éligible).
 */
export function effectiveTaxRatePct(category: PerCategory, substanceMet: boolean): number {
  if (category === 'not_eligible' || !substanceMet) return CORPORATE_TAX_RATE_PCT
  return CORPORATE_TAX_RATE_PCT * (1 - PER_EXEMPTION_PCT[category] / 100)
}

/**
 * Calcule la portion taxable d'un revenu PER-éligible.
 * Par défaut 20% (= 100% - 80% exemption).
 */
export function taxablePortion(category: PerCategory, substanceMet: boolean): number {
  if (category === 'not_eligible' || !substanceMet) return 1.0
  return 1 - PER_EXEMPTION_PCT[category] / 100
}

/**
 * Foreign Tax Credit limitation (ITA §77).
 * Le crédit est limité au plus bas de :
 *   - L'impôt étranger payé
 *   - L'impôt mauricien sur ce revenu (effective tax rate appliqué)
 */
export function computeFtcCap(
  foreignIncome: number,
  foreignTaxPaid: number,
  category: PerCategory,
  substanceMet: boolean,
): number {
  const mauritiusTaxOnIncome = foreignIncome * (effectiveTaxRatePct(category, substanceMet) / 100)
  return Math.min(foreignTaxPaid, mauritiusTaxOnIncome)
}

/**
 * Détermine si une catégorie nécessite substance pour bénéficier du PER.
 * Toutes les catégories PER-éligibles requièrent substance (par défaut TRUE
 * dans la table de référence migration 250).
 */
export function requiresSubstance(category: PerCategory): boolean {
  return category !== 'not_eligible'
}

/**
 * Heuristique d'auto-classification PER pour une facture/écriture.
 * Sur la base de la nature du compte + tiers étranger.
 *
 * NOTE : pas définitif — l'utilisateur peut toujours surcharger manuellement.
 * Sert de premier jet pour pré-remplir la catégorie.
 */
export function autoClassifyPer(opts: {
  numero_compte?: string | null
  tiers?: string | null
  tiers_country_iso?: string | null
  description?: string | null
}): PerCategory {
  const compte = opts.numero_compte || ''
  const desc = (opts.description || '').toLowerCase()
  const isForeign = opts.tiers_country_iso && opts.tiers_country_iso.toUpperCase() !== 'MU'

  if (!isForeign) return 'not_eligible'

  // Dividendes (compte 76 produits financiers)
  if (compte.startsWith('761') || desc.includes('dividend')) return 'foreign_dividends'
  // Intérêts (compte 762)
  if (compte.startsWith('762') || desc.includes('interest') || desc.includes('intérêt')) return 'foreign_interest'
  // Redevances IP
  if (compte.startsWith('706') && (desc.includes('royalt') || desc.includes('redevance') || desc.includes('license'))) return 'foreign_royalties'
  // Profits PE étrangère — nécessite tagging manuel
  if (desc.includes('pe profit') || desc.includes('permanent establishment')) return 'foreign_pe_profits'

  return 'not_eligible'
}
