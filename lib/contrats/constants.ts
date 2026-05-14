/**
 * constants.ts — Constantes et types partagés pour le module Contrats Clients
 *
 * Ce fichier ne contient AUCUNE dépendance serveur (Anthropic, Supabase, etc.)
 * afin de pouvoir être importé depuis des composants client sans tirer le
 * SDK Anthropic dans le bundle browser.
 */

export interface MessageConversation {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

/**
 * Paramètres extraits par l'IA depuis la conversation.
 * Champs structurés couvrant TOUS les types de contrats supportés
 * (prestation, bail, vente, travail, etc.). Les champs non pertinents
 * pour un type donné restent simplement undefined.
 */
export interface ParametresContrat {
  // Identification & parties
  type_contrat?: string
  titre?: string
  nom_partie_a?: string             // bailleur, vendeur, employeur, donneur d'ordre
  nom_partie_b?: string             // locataire, acheteur, salarié, prestataire
  qualite_partie_a?: string         // "société", "particulier", "indivision"
  qualite_partie_b?: string
  representant_a?: string           // signataire (si société)
  representant_b?: string
  adresse_partie_a?: string
  adresse_partie_b?: string
  brn_partie_a?: string             // Business Registration Number Maurice
  brn_partie_b?: string
  vat_partie_a?: string
  vat_partie_b?: string
  nic_partie_a?: string             // National ID Card Maurice (particuliers)
  nic_partie_b?: string

  // Legacy / cabinet comptable (rétro-compatibilité)
  nom_client?: string
  nom_societe_client?: string
  nom_cabinet?: string

  // Prestation de service / mission
  services?: string[]
  honoraires_mensuels?: number
  honoraires_annuels?: number
  montant_total?: number
  modalites_paiement?: string
  date_debut?: string
  date_fin?: string
  duree_mois?: number
  periodicite_facturation?: string
  delai_paiement?: number

  // Bail immobilier (résidentiel ou commercial)
  adresse_bien?: string
  type_bien?: string                // appartement, maison, local commercial, bureau, entrepôt
  surface_m2?: number
  nombre_pieces?: number
  loyer_mensuel?: number
  charges_mensuelles?: number
  depot_garantie?: number           // souvent = 2 ou 3 mois de loyer à Maurice
  duree_bail_mois?: number          // 12 mois par défaut résidentiel, 3/6/9 ans commercial
  date_entree?: string
  preavis_jours?: number            // 1 mois résidentiel, 3-6 mois commercial
  revision_loyer?: string           // annuelle, indice CPI Maurice
  destination_bien?: string         // habitation, commerce, profession libérale
  meuble?: boolean
  inventaire_inclus?: boolean

  // Vente (bien immobilier ou meuble)
  designation_bien?: string
  prix_vente?: number
  modalites_prix?: string
  date_vente?: string
  date_remise_bien?: string
  condition_suspensive_financement?: boolean
  garantie_eviction?: boolean
  garantie_vices_caches?: boolean
  notaire?: string                  // obligatoire pour immobilier Maurice
  droits_enregistrement_charge?: string // qui paie (acquéreur typiquement)

  // Contrat de travail (CDI / CDD)
  poste?: string
  description_fonction?: string
  salaire_brut?: number
  periodicite_salaire?: string      // mensuel
  periode_essai_mois?: number       // max 6 mois à Maurice (Workers' Rights Act 2019)
  heures_semaine?: number           // 45h Maurice (standard), 40h secteur public
  lieu_travail?: string
  date_embauche?: string
  motif_cdd?: string                // requis pour CDD
  benefits?: string[]               // assurance santé, transport, etc.
  conges_annuels_jours?: number     // 20 jours min Maurice
  preavis_cessation?: string

  // Freelance / Indépendant
  statut_independant?: boolean
  numero_tan?: string               // Tax Account Number Maurice
  tds_applicable?: boolean          // Tax Deducted at Source

  // Sous-traitance / Distribution / Franchise / Agent
  territoire?: string
  exclusivite?: boolean
  redevance?: string
  duree_exclusivite_mois?: number
  obligations_specifiques?: string[]

  // NDA / Confidentialité
  objet_echange?: string
  duree_confidentialite_annees?: number
  exclusions_confidentialite?: string[]

  // Construction / Travaux
  nature_travaux?: string
  delai_execution?: string
  retenue_garantie?: number
  garantie_decennale?: boolean

  // Mandat
  objet_mandat?: string
  pouvoirs_mandataire?: string[]
  remuneration_mandataire?: string

  // Clauses transversales
  devise?: string                   // MUR par défaut
  tva_applicable?: boolean          // 15% Maurice si assujetti
  clause_resiliation?: string
  clause_confidentialite?: boolean
  clause_propriete_intellectuelle?: boolean
  clause_non_concurrence?: boolean
  duree_non_concurrence_mois?: number
  clause_force_majeure?: boolean
  droit_applicable?: string         // "Droit mauricien" par défaut
  juridiction?: string              // "Tribunaux de Maurice" par défaut
  langue_contrat?: string           // "français" ou "anglais"
  arbitrage?: boolean
  mediation_prealable?: boolean
  notes_specifiques?: string

  [key: string]: unknown
}

export interface AnalyseConversation {
  parametres_extraits: ParametresContrat
  informations_manquantes: string[]
  pret_a_generer: boolean
  prochaine_question?: string
}

/**
 * Catégories pour grouper les types dans l'UI (sélecteur).
 */
export type CategorieContrat =
  | 'mission'         // Cabinet comptable / consulting
  | 'immobilier'
  | 'vente'
  | 'travail'
  | 'commercial'
  | 'confidentialite'
  | 'autre'

/**
 * Référentiel exhaustif des types de contrats supportés.
 * `category` sert au regroupement UI. `requires_notaire` flag tout contrat
 * qui doit légalement passer devant notaire à Maurice (vente immobilière).
 */
export const TYPES_CONTRATS = [
  // Mission / Cabinet
  { value: 'lettre_mission', label: 'Lettre de mission', description: 'Mission comptable récurrente', category: 'mission' as CategorieContrat },
  { value: 'convention_honoraires', label: "Convention d'honoraires", description: 'Mission ponctuelle (audit, conseil, fiscalité)', category: 'mission' as CategorieContrat },
  { value: 'prestation_service', label: 'Prestation de service', description: 'Consulting, IT, marketing, formation, design…', category: 'mission' as CategorieContrat },
  { value: 'mandat', label: 'Mandat de représentation', description: 'Représentation MRA, ROC, FSC, banque', category: 'mission' as CategorieContrat },
  { value: 'sous_traitance', label: 'Sous-traitance', description: 'Sous-traitance entre professionnels', category: 'mission' as CategorieContrat },
  { value: 'maintenance', label: 'Contrat de maintenance', description: 'SLA, support, hotline', category: 'mission' as CategorieContrat },

  // Immobilier
  { value: 'bail_residentiel', label: 'Bail résidentiel', description: 'Location habitation (Landlord and Tenant Act)', category: 'immobilier' as CategorieContrat },
  { value: 'bail_commercial', label: 'Bail commercial', description: 'Local commercial, bureau, entrepôt', category: 'immobilier' as CategorieContrat },
  { value: 'bail_meuble', label: 'Bail meublé courte durée', description: 'Location saisonnière / Airbnb', category: 'immobilier' as CategorieContrat },
  { value: 'colocation', label: 'Bail de colocation', description: 'Plusieurs locataires solidaires', category: 'immobilier' as CategorieContrat },

  // Vente
  { value: 'vente_immobilier', label: 'Vente immobilière', description: 'Promesse/acte (notaire obligatoire)', category: 'vente' as CategorieContrat, requires_notaire: true },
  { value: 'vente_fonds_commerce', label: 'Vente fonds de commerce', description: 'Cession activité avec clientèle', category: 'vente' as CategorieContrat, requires_notaire: true },
  { value: 'vente_vehicule', label: 'Vente de véhicule', description: 'Auto / moto / bateau', category: 'vente' as CategorieContrat },
  { value: 'vente_bien_meuble', label: 'Vente de bien meuble', description: 'Équipement, machine, mobilier', category: 'vente' as CategorieContrat },
  { value: 'cession_parts', label: 'Cession de parts sociales', description: 'Transfert d\'actions / parts SARL', category: 'vente' as CategorieContrat },

  // Travail / RH
  { value: 'contrat_travail_cdi', label: 'CDI', description: 'Contrat de travail permanent (Workers\' Rights Act)', category: 'travail' as CategorieContrat },
  { value: 'contrat_travail_cdd', label: 'CDD', description: 'Contrat à durée déterminée (motif requis)', category: 'travail' as CategorieContrat },
  { value: 'contrat_temps_partiel', label: 'Temps partiel', description: 'CDI/CDD à temps partiel', category: 'travail' as CategorieContrat },
  { value: 'contrat_apprentissage', label: 'Apprentissage / stage', description: 'Internship / apprenticeship', category: 'travail' as CategorieContrat },
  { value: 'contrat_freelance', label: 'Freelance / Indépendant', description: 'Self-employed, prestataire externe', category: 'travail' as CategorieContrat },
  { value: 'contrat_consultant', label: 'Consultant expert', description: 'Mission expertise ponctuelle', category: 'travail' as CategorieContrat },

  // Commercial
  { value: 'distribution', label: 'Contrat de distribution', description: 'Distribution exclusive ou sélective', category: 'commercial' as CategorieContrat },
  { value: 'franchise', label: 'Franchise', description: 'Concession marque + savoir-faire', category: 'commercial' as CategorieContrat },
  { value: 'agent_commercial', label: 'Agent commercial', description: 'Apporteur d\'affaires indépendant', category: 'commercial' as CategorieContrat },
  { value: 'partenariat', label: 'Partenariat / JV', description: 'Coopération commerciale, joint-venture', category: 'commercial' as CategorieContrat },
  { value: 'apport_affaires', label: 'Apport d\'affaires', description: 'Commission sur prospects', category: 'commercial' as CategorieContrat },
  { value: 'licence_marque', label: 'Licence de marque / logiciel', description: 'IP licensing', category: 'commercial' as CategorieContrat },

  // Construction & travaux
  { value: 'construction', label: 'Contrat de construction', description: 'Marché de travaux, BTP', category: 'autre' as CategorieContrat },
  { value: 'architecte', label: "Contrat d'architecte", description: 'Conception, maîtrise d\'œuvre', category: 'autre' as CategorieContrat },

  // Confidentialité / Juridique
  { value: 'nda', label: 'NDA / Confidentialité', description: 'Protection informations échangées', category: 'confidentialite' as CategorieContrat },
  { value: 'non_concurrence', label: 'Non-concurrence', description: 'Engagement post-emploi ou post-cession', category: 'confidentialite' as CategorieContrat },
  { value: 'transaction', label: 'Protocole transactionnel', description: 'Règlement amiable d\'un litige', category: 'confidentialite' as CategorieContrat },

  // Catch-all
  { value: 'autre', label: 'Autre contrat', description: 'Format libre — décris-le à l\'IA', category: 'autre' as CategorieContrat },
] as const

export type TypeContratValue = typeof TYPES_CONTRATS[number]['value']

export const STATUTS_CONTRATS = [
  { value: 'brouillon', label: 'Brouillon', color: 'gray' },
  { value: 'en_revision', label: 'En révision', color: 'yellow' },
  { value: 'valide', label: 'Validé', color: 'blue' },
  { value: 'envoye', label: 'Envoyé', color: 'purple' },
  { value: 'signe', label: 'Signé', color: 'green' },
  { value: 'archive', label: 'Archivé', color: 'gray' },
  { value: 'resilie', label: 'Résilié', color: 'red' },
] as const
