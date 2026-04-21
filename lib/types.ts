export type DocumentStatus = 'en_attente' | 'en_cours' | 'traite' | 'erreur'

export type DocumentType = 'facture_fournisseur' | 'facture_client' | 'releve_bancaire' | 'bulletin_paie' | 'payroll_report' | 'charges_sociales' | 'fiche_paie' | 'contrat' | 'autre' | string

export interface Document {
  id: string
  nom_fichier: string
  type_document: DocumentType
  statut: DocumentStatus
  societe_detectee: string | null
  dossier_id: string | null
  uploaded_by: string
  created_at: string
  taille_fichier: number
  confiance: number | null
  n8n_result: any
  [key: string]: any
}

export type TVAStatut = 'a_payer' | 'credit' | 'neant'

export interface TVAMensuelle {
  periode: string
  tva_collectee: number
  tva_deductible: number
  tva_nette: number
  statut: TVAStatut
  [key: string]: any
}

export interface ParametresPaieMRA {
  csg_seuil_taux_reduit: number
  csg_salarie_taux_reduit: number
  csg_salarie_taux_plein: number
  csg_patronal: number
  csg_patronal_taux_reduit: number  // 3% employeur si brut <= 50K
  nsf_salarie: number
  nsf_patronal: number
  /** F9 — Plafond mensuel NSF (insurable ceiling), 28 600 MUR en 2025-2026. */
  nsf_plafond_mensuel?: number
  training_levy: number
  prgf_patronal_par_jour: number    // PRGF par jour travaillé
  prgf_taux_emoluments: number      // 4.5% — Portable Retirement Gratuity Fund
  paye_seuil_exoneration: number
  paye_taux_1: number
  paye_seuil_taux_2: number
  paye_taux_2: number
  salary_compensation: number       // Rs 635 Salary Compensation
  salary_compensation_seuil: number // Applicable si salaire <= 50,000
}
