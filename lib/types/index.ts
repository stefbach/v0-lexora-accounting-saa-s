export type Role = 'admin' | 'client_admin' | 'client_user' | 'comptable'

export type Societe = 'TIBOK' | 'BPO' | 'OBESITY_CARE' | 'NHS_S2'

export type DocumentType =
  | 'facture_fournisseur'
  | 'facture_client'
  | 'releve_bancaire'
  | 'fiche_paie'
  | 'charges_sociales'
  | 'contrat'
  | 'autre'

export type DocumentStatus = 'en_attente' | 'en_cours' | 'traite' | 'erreur'

export type TVAStatut = 'a_payer' | 'credit' | 'neant'

export type DeclarationStatut = 'a_faire' | 'declare' | 'en_retard'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  phone?: string
  comptable_id?: string
  created_at: string
}

export interface SocieteRecord {
  id: string
  nom: string
  brn: string
  numero_tva_mra?: string
  statut_tva: boolean
  comptable_id?: string
  created_at: string
}

export interface Dossier {
  id: string
  client_id: string
  comptable_id: string
  societe_id: string
  statut: 'actif' | 'inactif'
  created_at: string
}

export interface Document {
  id: string
  dossier_id: string
  uploaded_by: string
  nom_fichier: string
  type_fichier: 'pdf' | 'jpeg' | 'png' | 'xlsx'
  type_document?: DocumentType
  categorie?: string
  societe_detectee?: Societe
  statut: DocumentStatus
  n8n_result?: Record<string, unknown>
  storage_path: string
  created_at: string
}

export interface TVAMensuelle {
  id: string
  client_id: string
  societe: Societe
  periode: string
  tva_collectee: number
  tva_deductible: number
  credit_reporte: number
  tva_nette: number
  statut: TVAStatut
  date_limite: string
  date_declaration?: string
  date_paiement?: string
  reference_mra?: string
  penalites: number
  statut_declaration: DeclarationStatut
}

export interface RapportMensuel {
  id: string
  client_id: string
  periode: string
  data: Record<string, unknown>
  created_at: string
}

export interface ChargesSociales {
  id: string
  client_id: string
  societe_id: string
  periode: string
  npf: number
  hrdc: number
  nps: number
  paye: number
  statut: 'conforme' | 'ecart_detecte'
  details?: Record<string, unknown>
  created_at: string
}

export interface Notification {
  id: string
  destinataire_id: string
  type: 'whatsapp' | 'email'
  message: string
  statut: 'pending' | 'sent' | 'failed'
  created_at: string
}

export interface EcritureComptable {
  id: string
  dossier_id: string
  date_ecriture: string
  journal: string
  compte: string
  libelle: string
  debit: number
  credit: number
  piece_justificative?: string
  created_at: string
}
