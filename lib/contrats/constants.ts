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

export interface ParametresContrat {
  type_contrat?: string
  titre?: string
  nom_client?: string
  nom_societe_client?: string
  nom_cabinet?: string
  services?: string[]
  honoraires_mensuels?: number
  honoraires_annuels?: number
  modalites_paiement?: string
  date_debut?: string
  date_fin?: string
  duree_mois?: number
  periodicite_facturation?: string
  delai_paiement?: number
  clause_resiliation?: string
  clause_confidentialite?: boolean
  clause_propriete_intellectuelle?: boolean
  droit_applicable?: string
  juridiction?: string
  [key: string]: unknown
}

export interface AnalyseConversation {
  parametres_extraits: ParametresContrat
  informations_manquantes: string[]
  pret_a_generer: boolean
  prochaine_question?: string
}

export const TYPES_CONTRATS = [
  { value: 'lettre_mission', label: 'Lettre de mission', description: 'Mission comptable récurrente' },
  { value: 'convention_honoraires', label: "Convention d'honoraires", description: 'Mission ponctuelle' },
  { value: 'prestation_service', label: 'Prestation de service', description: 'Services techniques ou consulting' },
  { value: 'nda', label: 'NDA / Confidentialité', description: 'Protection des informations' },
  { value: 'mandat', label: 'Mandat de représentation', description: 'Représentation MRA, ROC, FSC' },
  { value: 'autre', label: 'Autre contrat', description: 'Format libre' },
] as const

export const STATUTS_CONTRATS = [
  { value: 'brouillon', label: 'Brouillon', color: 'gray' },
  { value: 'en_revision', label: 'En révision', color: 'yellow' },
  { value: 'valide', label: 'Validé', color: 'blue' },
  { value: 'envoye', label: 'Envoyé', color: 'purple' },
  { value: 'signe', label: 'Signé', color: 'green' },
  { value: 'archive', label: 'Archivé', color: 'gray' },
  { value: 'resilie', label: 'Résilié', color: 'red' },
] as const
