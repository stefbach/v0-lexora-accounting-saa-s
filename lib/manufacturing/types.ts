/**
 * lib/manufacturing/types.ts — Types partagés du module Manufacturing
 * (nomenclatures + ordres de fabrication).
 * Réf. spec : docs/roadmap/manufacturing-job-costing.md §1.2 / §1.4.
 */

export type StatutNomenclature = 'brouillon' | 'active' | 'obsolete'

/** MVP : planifie → en_cours (consommation) → cloture (production, figé). */
export type StatutOF = 'planifie' | 'en_cours' | 'cloture' | 'annule'

export const TRANSITIONS_OF: Record<StatutOF, StatutOF[]> = {
  planifie: ['en_cours', 'annule'],
  en_cours: ['cloture'],
  cloture: [],
  annule: [],
}

export function peutTransitionner(de: StatutOF, vers: StatutOF): boolean {
  return (TRANSITIONS_OF[de] || []).includes(vers)
}

export const LIBELLES_STATUT_OF: Record<StatutOF, string> = {
  planifie: 'Planifié',
  en_cours: 'En cours',
  cloture: 'Clôturé',
  annule: 'Annulé',
}

/**
 * Plan comptable Manufacturing (§1.4 / §4 de la spec, migration 488).
 * 7131 (Production stockée) est le compte canonique existant du PCM
 * (mig 202, IFRS 478/479) — la spec proposait « 7135 », on réutilise.
 */
export const COMPTE_MATIERES_PREMIERES = '3100'
export const COMPTE_EN_COURS_PRODUCTION = '3300'
export const COMPTE_PRODUITS_FINIS = '3500'
export const COMPTE_VARIATION_MATIERES = '6031'
export const COMPTE_PRODUCTION_STOCKEE = '7131'
/** Écarts matière anormaux (réutilisé du Module A, mig 483). */
export const COMPTE_PERTES_STOCKS = '6586'

export interface LigneNomenclature {
  id: string
  nomenclature_id: string
  produit_composant_id: string
  quantite: number
  unite: string | null
  taux_perte_pct: number
  ordre: number
}

export interface Nomenclature {
  id: string
  societe_id: string
  produit_fini_id: string
  version: string
  libelle: string | null
  quantite_produite: number
  statut: StatutNomenclature
  cout_matieres_estime: number | null
  actif: boolean
}

export interface OrdreFabrication {
  id: string
  societe_id: string
  depot_id: string
  nomenclature_id: string
  numero_of: string
  quantite_a_produire: number
  quantite_produite: number
  statut: StatutOF
  date_planifiee: string | null
  cout_matieres_reel: number
  cout_main_oeuvre_reel: number
  cout_unitaire_revient: number | null
  notes: string | null
}

export interface ConsommationOF {
  id: string
  ordre_fabrication_id: string
  produit_id: string
  quantite_theorique: number
  quantite_reelle: number
  cout_unitaire: number
  valeur_theorique: number
  valeur_reelle: number
  date_consommation: string
}
