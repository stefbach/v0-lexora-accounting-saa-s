// =============================================================================
// lib/crm/types.ts — Types TypeScript du module CRM Prospection
// =============================================================================

export type CrmProspectStatus =
  | 'nouveau'
  | 'a_qualifier'
  | 'qualifie'
  | 'contacte'
  | 'en_discussion'
  | 'gagne'
  | 'perdu'
  | 'opt_out'

export type CrmSource =
  | 'cbrd'
  | 'yellowpages_mu'
  | 'mcci'
  | 'apollo'
  | 'linkedin'
  | 'manuel'
  | 'import_csv'
  | 'referral'

export type CrmActivityType =
  | 'note'
  | 'email_sent'
  | 'email_received'
  | 'call_outbound'
  | 'call_inbound'
  | 'meeting'
  | 'linkedin_dm'
  | 'whatsapp_msg'
  | 'status_change'
  | 'enrichment_run'
  | 'ingest'
  | 'outreach_trigger'

export interface CrmCompany {
  id: string
  nom: string
  brn?: string | null
  tan?: string | null
  linkedin_url?: string | null
  site_web?: string | null
  email_principal?: string | null
  telephone?: string | null

  activite?: string | null
  nic_code?: string | null
  industrie?: string | null
  taille_effectif?: string | null
  ca_estime_mur?: number | null
  annee_creation?: number | null

  pays: string
  region?: string | null
  ville?: string | null
  adresse?: string | null

  description?: string | null

  raw_data?: Record<string, unknown> | null
  enrichment?: CrmEnrichmentResult | null
  strategy?: string | null

  statut: CrmProspectStatus
  score?: number | null
  source: CrmSource
  tags: string[]
  notes?: string | null

  assigned_to?: string | null
  created_by?: string | null

  created_at: string
  updated_at: string
  last_contacted_at?: string | null
  enriched_at?: string | null
}

export interface CrmContact {
  id: string
  company_id?: string | null

  prenom?: string | null
  nom?: string | null
  titre?: string | null
  seniorite?: string | null
  decision_maker: boolean

  linkedin_url?: string | null
  email?: string | null
  email_verified: boolean
  telephone?: string | null
  whatsapp?: string | null

  raw_data?: Record<string, unknown> | null
  enrichment?: CrmEnrichmentResult | null
  strategy?: string | null

  langue_preferee?: string | null
  canal_prefere?: string | null

  opt_out: boolean
  opt_out_reason?: string | null
  opt_out_at?: string | null

  statut: CrmProspectStatus
  source: CrmSource
  tags: string[]
  notes?: string | null

  assigned_to?: string | null
  created_by?: string | null

  created_at: string
  updated_at: string
  last_contacted_at?: string | null
  enriched_at?: string | null
}

export interface CrmActivity {
  id: string
  contact_id?: string | null
  company_id?: string | null
  type: CrmActivityType
  direction?: 'outbound' | 'inbound' | null
  sujet?: string | null
  contenu?: string | null
  metadata?: Record<string, unknown> | null
  created_by?: string | null
  created_at: string
}

// -----------------------------------------------------------------------------
// Sortie structurée de l'enrichissement Claude
// -----------------------------------------------------------------------------
export interface CrmEnrichmentResult {
  // Société
  resume?: string
  industrie_normalisee?: string
  taille_estimee?: string
  pain_points?: string[]
  opportunites_lexora?: string[]
  niveau_priorite?: 'haute' | 'moyenne' | 'basse'
  score_qualification?: number          // 0-100

  // Contact (si appelé sur un contact)
  persona?: string
  motivations?: string[]
  objections_probables?: string[]

  // Stratégie (cf. champ strategy)
  accroches?: {
    email_court?: string
    email_long?: string
    linkedin_dm?: string
    whatsapp?: string
  }
  canal_recommande?: 'email' | 'linkedin' | 'whatsapp' | 'phone'
  timing_recommande?: string

  // Méta
  generated_at?: string
  model?: string
}

// -----------------------------------------------------------------------------
// Payload normalisé pour l'endpoint d'ingestion
// -----------------------------------------------------------------------------
export interface CrmIngestPayload {
  source: CrmSource
  company: Partial<CrmCompany> & { nom: string }
  contacts?: Array<Partial<CrmContact>>
  raw?: Record<string, unknown>
}
