/**
 * Régime de société Lexora — source unique pour activer/désactiver les
 * modules GBC + Full IFRS.
 *
 * Lié à la colonne societes.regime (mig 258).
 */

export type SocieteRegime =
  | 'domestic'              // PME Maurice classique
  | 'gbc1'                  // Global Business License
  | 'authorised_company'    // Authorised Company (ex-GBC2)
  | 'holding'               // Holding consolidante
  | 'branch_foreign_pe'     // Succursale entité étrangère

export const REGIME_LABELS: Record<SocieteRegime, string> = {
  domestic: 'PME Maurice (domestic)',
  gbc1: 'GBC1 — Global Business License',
  authorised_company: 'Authorised Company',
  holding: 'Holding consolidante',
  branch_foreign_pe: 'Succursale étrangère',
}

export const REGIME_DESCRIPTIONS: Record<SocieteRegime, string> = {
  domestic: 'PME mauricienne standard. IFRS for SMEs, IS 15 %, déclarations MRA (PAYE, NSF, CSG, TVA, IT Form 3).',
  gbc1: 'Global Business License (FSC). Full IFRS, PER 80 % sur revenus étrangers, substance CIGA obligatoire, UBO ≥ 10 %.',
  authorised_company: 'Authorised Company (FSC, ex-GBC2). Non résidente fiscale Maurice. UBO obligatoire. Pas de PER.',
  holding: 'Holding consolidante avec filiales. IFRS 10 (consolidation), Goodwill IFRS 3, NCI. Possible MNE Pillar Two si CA > €750M.',
  branch_foreign_pe: "Succursale d'une entité étrangère. Reporting au siège + IAS 21 monnaie fonctionnelle.",
}

/**
 * Carte des modules actifs par régime.
 * Source de vérité pour le sidebar dynamique et le dashboard.
 */
export type ModuleActivation = {
  gbc_modules_active: boolean
  per_active: boolean
  substance_required: boolean
  ubo_required: boolean
  tp_required: boolean
  consolidation_active: boolean
  crs_fatca_active: boolean
  pillar_two_eligible: boolean
  ias21_translation_active: boolean
  ifrs16_leases_active: boolean
}

export function getActiveModules(opts: {
  regime: SocieteRegime
  devise_fonctionnelle?: string | null
}): ModuleActivation {
  const r = opts.regime
  const isMultiCcy = !!opts.devise_fonctionnelle && opts.devise_fonctionnelle.toUpperCase() !== 'MUR'
  return {
    gbc_modules_active: r !== 'domestic',
    per_active: r === 'gbc1' || r === 'authorised_company' || r === 'holding',
    substance_required: r === 'gbc1' || r === 'holding',
    ubo_required: r === 'gbc1' || r === 'authorised_company' || r === 'holding',
    tp_required: r === 'gbc1' || r === 'authorised_company' || r === 'holding',
    consolidation_active: r === 'holding',
    crs_fatca_active: r === 'gbc1' || r === 'authorised_company',
    pillar_two_eligible: r === 'holding',
    ias21_translation_active: isMultiCcy || r === 'branch_foreign_pe',
    ifrs16_leases_active: true,  // IFRS 16 cross-cutting
  }
}

/** Devise fonctionnelle par défaut suggérée selon le régime */
export function suggestedDevise(regime: SocieteRegime): string {
  switch (regime) {
    case 'gbc1':
    case 'authorised_company':
    case 'holding':
      return 'USD'
    case 'branch_foreign_pe':
      return 'EUR'  // hypothèse par défaut, à ajuster
    case 'domestic':
    default:
      return 'MUR'
  }
}

/** TRUE si la société est considérée GBC (vue large) */
export function isGbc(regime: SocieteRegime | null | undefined): boolean {
  return regime !== null && regime !== undefined && regime !== 'domestic'
}

/** Validation : licence FSC obligatoire pour gbc1 + authorised_company */
export function requiresFscLicense(regime: SocieteRegime): boolean {
  return regime === 'gbc1' || regime === 'authorised_company'
}
