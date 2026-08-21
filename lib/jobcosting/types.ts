/**
 * lib/jobcosting/types.ts — Types partagés du module Job Costing (Module D).
 * Réf. spec : docs/roadmap/manufacturing-job-costing.md §2.2 / §2.4.
 */

export type StatutJob =
  | 'ouvert'
  | 'en_cours'
  | 'en_pause'
  | 'cloture'
  | 'facture'
  | 'annule'

export type TypeFacturation = 'temps_materiel' | 'forfait' | 'abonnement'

export type StatutValidation =
  | 'brouillon'
  | 'soumis'
  | 'valide'
  | 'rejete'
  | 'facture'

export type TypeHeures = 'normale' | 'heures_sup' | 'deplacement'

export type TypeDepense =
  | 'achat_materiel'
  | 'sous_traitance'
  | 'frais_deplacement'
  | 'autre'

/** Transitions de statut d'un job (garde-fou métier). */
export const TRANSITIONS_JOB: Record<StatutJob, StatutJob[]> = {
  ouvert: ['en_cours', 'en_pause', 'cloture', 'annule'],
  en_cours: ['en_pause', 'cloture', 'annule'],
  en_pause: ['en_cours', 'cloture', 'annule'],
  cloture: ['facture', 'en_cours'],
  facture: [],
  annule: [],
}

export function peutTransitionnerJob(de: StatutJob, vers: StatutJob): boolean {
  return (TRANSITIONS_JOB[de] || []).includes(vers)
}

/** Transitions de validation d'une imputation de temps. */
export const TRANSITIONS_VALIDATION: Record<StatutValidation, StatutValidation[]> = {
  brouillon: ['soumis', 'valide'],
  soumis: ['valide', 'rejete'],
  rejete: ['soumis', 'brouillon'],
  valide: ['facture', 'rejete'],
  facture: [],
}

export function peutTransitionnerValidation(
  de: StatutValidation,
  vers: StatutValidation,
): boolean {
  return (TRANSITIONS_VALIDATION[de] || []).includes(vers)
}

export const LIBELLES_STATUT_JOB: Record<StatutJob, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  en_pause: 'En pause',
  cloture: 'Clôturé',
  facture: 'Facturé',
  annule: 'Annulé',
}

export const LIBELLES_TYPE_DEPENSE: Record<TypeDepense, string> = {
  achat_materiel: 'Achat de matériel',
  sous_traitance: 'Sous-traitance',
  frais_deplacement: 'Frais de déplacement',
  autre: 'Autre',
}

/**
 * Comptes de reclassement analytique de personnel (mig 491).
 * NB : la spec §4 proposait 6412/6413 mais ces codes sont déjà pris dans le
 * PCM canonique (Transport/Petrol allowance) — on utilise 6421/6422 libres.
 */
export const COMPTE_PERSONNEL_PRODUCTION = '6421'
export const COMPTE_PERSONNEL_JOBS = '6422'
/** Compte d'origine des charges de personnel (journal SAL). */
export const COMPTE_SALAIRES_BRUTS = '6411'

/** Heures contractuelles mensuelles par défaut (45 h/sem × 52 / 12 ≈ 195). */
export const HEURES_MENSUELLES_DEFAUT = 195
/** Taux de charges patronales par défaut (convention IAS 19, mig 187). */
export const CHARGES_PATRONALES_PCT_DEFAUT = 0.13

export interface Job {
  id: string
  societe_id: string
  dossier_id: string | null
  contrat_id: string | null
  code: string
  libelle: string
  client_nom: string | null
  type_facturation: TypeFacturation
  statut: StatutJob
  responsable_id: string | null
  date_debut: string | null
  date_fin_prevue: string | null
  date_cloture: string | null
  budget_heures: number | null
  budget_montant: number | null
  devise: string
  facture_id: string | null
  cout_temps_reel: number
  cout_depenses_reel: number
  montant_facturable: number
  montant_facture: number | null
}

export interface ImputationTemps {
  id: string
  societe_id: string
  job_id: string | null
  ordre_fabrication_id: string | null
  employe_id: string
  pointage_id: string | null
  date_prestation: string
  heures: number
  type_heures: TypeHeures
  tache: string | null
  description: string | null
  facturable: boolean
  taux_horaire_facture: number | null
  cout_horaire_charge: number
  cout_total: number
  statut_validation: StatutValidation
}

export interface DepenseJob {
  id: string
  societe_id: string
  job_id: string
  type_depense: TypeDepense
  description: string | null
  montant_ht: number
  devise: string
  facturable: boolean
  marge_refacturation_pct: number
  mouvement_stock_id: string | null
}
