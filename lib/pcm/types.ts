/**
 * Types partagés du module PCM (Plan Comptable Mauricien).
 */

export type CompteType = 'actif' | 'passif' | 'charge' | 'produit' | 'mixte' | 'tresorerie'
export type SensNormal = 'debit' | 'credit' | 'mixte'
export type TemplateType = 'core' | 'module'

/** Définition d'un compte dans un template JSON. */
export interface TemplateCompte {
  numero: string
  intitule: string
  classe: number
  type: CompteType
  nature?: string
  sens_normal: SensNormal
  lettrable: boolean
  obligatoire: boolean
  tags?: string[]
  sous_comptes_pattern?: string
}

/** Structure complète d'un template PCM. */
export interface PCMTemplate {
  code: string
  nom: string
  description?: string
  type: TemplateType
  juridiction_code: string
  version: string
  prerequisites: string[]
  comptes: TemplateCompte[]
}

/** Ligne de la table comptes_societes. */
export interface CompteSociete {
  id: string
  societe_id: string
  numero: string
  numero_parent: string | null
  intitule: string
  intitule_custom: boolean
  classe: number
  type: CompteType
  nature: string | null
  sens_normal: SensNormal
  lettrable: boolean
  obligatoire: boolean
  archive: boolean
  archive_at: string | null
  archive_reason: string | null
  archive_target: string | null
  template_source: string | null
  tags: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface InitializeResult {
  template_code: string
  modules_applied: string[]
  comptes_created: number
  comptes_skipped: number
  modules_skipped: string[]
}
