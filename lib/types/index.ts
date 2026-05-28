// =============================================================================
// LEXORA — Types TypeScript (synchronisés avec le schéma SQL réel)
// Régénéré le 2026-03-28 — Sprint 0
// =============================================================================

// ---------------------------------------------------------------------------
// Rôles utilisateur
// ---------------------------------------------------------------------------
export type Role =
  | 'admin'
  | 'super_admin'
  | 'client_admin'
  | 'client_user'
  | 'comptable'
  | 'comptable_dedie'
  | 'commercial'

// ---------------------------------------------------------------------------
// Types de documents
// ---------------------------------------------------------------------------
export type DocumentType =
  | 'facture_fournisseur'
  | 'facture_client'
  | 'releve_bancaire'
  | 'fiche_paie'
  | 'charges_sociales'
  | 'contrat'
  | 'rapport'
  | 'rapport_mensuel'
  | 'autre'

export type DocumentStatus = 'en_attente' | 'en_cours' | 'traite' | 'erreur'

// ---------------------------------------------------------------------------
// Statuts TVA / Déclarations
// ---------------------------------------------------------------------------
export type TVAStatut = 'a_payer' | 'credit' | 'neant'
export type DeclarationStatut = 'a_faire' | 'declare' | 'en_retard'

// ---------------------------------------------------------------------------
// Profile utilisateur (table: profiles)
// ---------------------------------------------------------------------------
export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  phone?: string
  comptable_id?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Société (table: societes)
// ---------------------------------------------------------------------------
export interface SocieteRecord {
  id: string
  nom: string
  brn?: string
  numero_tva_mra?: string
  statut_tva: boolean
  client_id?: string
  comptable_id?: string
  date_debut_exercice?: string
  date_fin_exercice?: string
  mois_cloture?: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Dossier (table: dossiers)
// ---------------------------------------------------------------------------
export interface Dossier {
  id: string
  client_id: string
  comptable_id?: string | null
  societe_id: string
  statut: 'actif' | 'inactif'
  created_at: string
}

// ---------------------------------------------------------------------------
// Document (table: documents)
// ---------------------------------------------------------------------------
export interface Document {
  id: string
  dossier_id: string
  uploaded_by: string
  nom_fichier: string
  type_fichier: 'pdf' | 'jpeg' | 'png' | 'xlsx'
  type_document?: DocumentType
  categorie?: string
  societe_detectee?: string
  statut: DocumentStatus
  n8n_result?: Record<string, unknown>
  storage_path: string
  taille_fichier?: number
  confiance_type?: number
  corrige_manuellement?: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// TVA mensuelle (table: tva_mensuelle)
// ---------------------------------------------------------------------------
export interface TVAMensuelle {
  id: string
  client_id?: string
  societe_id: string
  periode: string
  tva_collectee: number
  tva_deductible: number
  credit_reporte: number
  tva_nette: number
  statut?: TVAStatut
  date_limite: string
  date_declaration?: string
  date_paiement?: string
  reference_mra?: string
  penalites?: number
  statut_declaration: DeclarationStatut
}

// ---------------------------------------------------------------------------
// Rapport mensuel (table: rapports_mensuels)
// ---------------------------------------------------------------------------
export interface RapportMensuel {
  id: string
  client_id: string
  societe_id?: string
  periode: string
  data: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Charges sociales (table: charges_sociales)
// Mise à jour : CSG/NSF (pas npf/hrdc/nps obsolètes)
// ---------------------------------------------------------------------------
export interface ChargesSociales {
  id: string
  client_id: string
  societe_id: string
  periode: string
  // CSG (Contribution Sociale Généralisée) — remplace NPF depuis 2021
  csg_salarie_3pct: number
  csg_patronal_6pct: number
  // NSF (National Savings Fund)
  nsf_salarie: number    // MUR 1.00 fixe / employé
  nsf_patronal: number   // MUR 2.50 fixe / employé
  // Training Levy (ex-HRDC)
  training_levy_1pct: number
  // PAYE
  paye: number
  statut: 'conforme' | 'ecart_detecte' | 'paye' | 'a_payer'
  details?: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Notification (table: notifications)
// ---------------------------------------------------------------------------
export interface Notification {
  id: string
  destinataire_id: string
  destinataire_type?: 'client' | 'comptable' | 'admin'
  type: string
  titre?: string
  message: string
  niveau?: 'info' | 'important' | 'urgent'
  statut: 'pending' | 'sent' | 'failed' | 'lue'
  canaux?: string[]
  societe_id?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Écriture comptable v1 (table: ecritures_comptables)
// ---------------------------------------------------------------------------
export interface EcritureComptable {
  id: string
  dossier_id: string
  societe_id?: string
  date_ecriture: string
  journal: string
  numero_piece?: string
  compte: string
  libelle: string
  debit: number
  credit: number
  piece_justificative?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Écriture comptable v2 (table: ecritures_comptables_v2)
// ---------------------------------------------------------------------------
export interface EcritureComptableV2 {
  id: string
  societe_id: string
  dossier_id?: string
  document_id?: string
  date_ecriture: string
  journal: string
  numero_piece?: string
  compte: string
  libelle?: string
  debit: number
  credit: number
  piece_justificative?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Alerte (table: alertes)
// ---------------------------------------------------------------------------
export interface Alerte {
  id: string
  client_id: string
  societe_id?: string
  type: string
  titre: string
  message: string
  niveau: 'info' | 'avertissement' | 'critique'
  statut: 'active' | 'lue' | 'resolue'
  date_echeance?: string
  montant?: number
  devise?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Compte bancaire (table: comptes_bancaires)
// ---------------------------------------------------------------------------
export interface CompteBancaire {
  id: string
  societe_id: string
  banque: string
  nom_compte: string
  numero_compte?: string
  iban?: string
  devise: string
  solde_actuel: number
  solde_dernier_releve?: number
  date_dernier_releve?: string
  actif: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Transaction bancaire (table: transactions_bancaires)
// ---------------------------------------------------------------------------
export interface TransactionBancaire {
  id: string
  compte_bancaire_id?: string
  societe_id: string
  date_transaction: string
  libelle: string
  libelle_banque?: string
  montant: number
  sens: 'debit' | 'credit'
  tiers_detecte?: string
  compte_comptable?: string
  statut_lettrage?: 'non_lettre' | 'lettre' | 'justifie'
  document_lie_id?: string
  // Devise étrangère
  devise_origine?: string
  montant_origine?: number
  taux_change_applique?: number
  source_taux?: string
  ecart_change_mur?: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Relevé bancaire (table: releves_bancaires)
// ---------------------------------------------------------------------------
export interface ReleveBancaire {
  id: string
  compte_bancaire_id: string
  societe_id: string
  periode: string
  date_debut: string
  date_fin: string
  solde_ouverture: number
  solde_cloture: number
  total_debits: number
  total_credits: number
  document_id?: string
  transactions_json?: TransactionBancaire[]
  statut_rapprochement: 'en_attente' | 'en_cours' | 'rapproche' | 'ecart'
  created_at: string
}

// ---------------------------------------------------------------------------
// Bilan officiel (table: bilans_officiels)
// ---------------------------------------------------------------------------
export interface BilanOfficiel {
  id: string
  societe_id: string
  exercice: string
  date_cloture: string
  total_actif: number
  total_passif: number
  total_capitaux_propres: number
  resultat_net: number
  chiffre_affaires?: number
  publie_client: boolean
  statut: 'brouillon' | 'valide' | 'publie'
  data?: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Prévisionnel (table: previsionnels)
// ---------------------------------------------------------------------------
export interface Previsionnel {
  id: string
  client_id: string
  societe_id?: string
  periode: string
  type: 'mensuel' | 'trimestriel' | 'annuel'
  data: Record<string, unknown>
  revenus_prevus: number
  charges_prevues: number
  resultat_prevu: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Simulation (table: simulations)
// ---------------------------------------------------------------------------
export interface Simulation {
  id: string
  client_id: string
  societe_id?: string
  cree_par_id: string
  titre: string
  type: 'nouveau_client' | 'embauche' | 'investissement' | 'expansion' | 'variation_prix' | 'perte_client'
  parametres: Record<string, unknown>
  resultats?: Record<string, unknown>
  visible_comptable: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Tiers pattern — apprentissage OCR bancaire (table: tiers_patterns)
// ---------------------------------------------------------------------------
export interface TiersPattern {
  id: string
  societe_id?: string
  pattern: string
  tiers_identifie?: string
  compte_comptable?: string
  nb_utilisations: number
  cree_par?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Assignation comptable (table: assignations)
// ---------------------------------------------------------------------------
export interface Assignation {
  id: string
  comptable_id: string
  client_id?: string
  societe_id?: string
  type: 'client' | 'societe'
  created_at: string
}

// ---------------------------------------------------------------------------
// Parametres Paie MRA — Mauritius Revenue Authority
// ---------------------------------------------------------------------------
export interface ParametresPaieMRA {
  csg_seuil_taux_reduit: number
  csg_salarie_taux_reduit: number
  csg_salarie_taux_plein: number
  csg_patronal: number
  csg_patronal_taux_reduit?: number
  nsf_salarie: number
  nsf_patronal: number
  training_levy: number
  prgf_patronal_par_jour: number
  prgf_taux_emoluments: number
  paye_seuil_exoneration: number
  paye_taux_1: number
  paye_seuil_taux_2: number
  paye_taux_2: number
  salary_compensation: number
  salary_compensation_seuil: number
}

// ---------------------------------------------------------------------------
// Period management for payroll
// ---------------------------------------------------------------------------
export type PeriodStatut = 'open' | 'closed'

export interface PeriodePaie {
  id: string
  societe_id: string
  periode: string
  date_debut: string
  date_fin: string
  statut: PeriodStatut
  cloture_par?: string
  cloture_le?: string
  created_at: string
}
