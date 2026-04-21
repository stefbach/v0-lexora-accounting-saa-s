/**
 * Shared types for the reconciliation (rapprochement) / aged balance /
 * accounting-ledger modules. Replaces the `useState<any>` soup on the
 * client pages and the implicit shapes in `/api/comptable/rapprochement`.
 */

export type FactureStatut = 'en_attente' | 'partiel' | 'paye' | 'retard' | 'annule'
export type FactureType = 'client' | 'fournisseur'
export type RapprochementSource =
  | 'auto'
  | 'auto_intelligent'
  | 'auto_repair'
  | 'ai'
  | 'manual'
  | 'paye_par_associe'
  | 'marquer_paye'

export type TxStatut =
  | 'rapproche'
  | 'interne'
  | 'interne_en_attente'
  | 'propose'
  | 'a_verifier'
  | 'non_identifie'

export interface Facture {
  id: string
  societe_id: string
  numero_facture: string | null
  tiers: string | null
  type_facture: FactureType
  description: string | null
  date_facture: string | null
  date_echeance: string | null
  conditions_paiement: number | null
  devise: string | null
  taux_change: number | null
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  montant_mur: number | null
  statut: FactureStatut
  client_offshore?: boolean | null
  notes?: string | null

  // Reconciliation link (migration 121)
  rapproche_releve_id?: string | null
  rapproche_transaction_idx?: number | null
  rapproche_date?: string | null
  rapproche_by?: string | null
  rapproche_source?: RapprochementSource | null

  // Partial payment / TDS (migrations 128, 159)
  solde_non_paye?: number | null
  tds_retenu?: number | null
  tds_code?: string | null
  tds_compte?: string | null

  // Credit-note link (migration 134)
  avoir_origine_id?: string | null

  // Enriched at read-time (not in DB)
  rapproche_tx_libelle?: string
  rapproche_tx_date?: string | null
}

export interface BankTransaction {
  releve_id: string
  transaction_idx: number
  date: string
  libelle: string
  debit: number
  credit: number
  devise: string
  tiers_detecte: string | null
  statut: TxStatut
  matched_type?: string | null
  match_confidence?: string | null
  note?: string | null
  lettre?: string | null
  facture_id?: string | null
  facture_ids?: string[]
  ecriture_id?: string | null
  rapprochement_multi?: boolean
  nb_factures?: number
  ecart_montant?: number
  rapproche_at?: string | null
  classification_compte?: string | null
  director_id?: string | null
  vi_pair_code?: string | null
  vi_pair_releve?: string | null
}

export interface EcritureComptable {
  id: string
  societe_id: string | null
  dossier_id: string | null
  date_ecriture: string
  journal: string
  numero_piece: string | null
  numero_compte: string
  nom_compte: string | null
  libelle: string
  description: string | null
  debit_mur: number
  credit_mur: number
  ref_folio: string | null
  exercice: string | null
  facture_id?: string | null
  lettre?: string | null
  date_lettrage?: string | null
  lettrage_auto?: boolean
  rapproche_releve_id?: string | null
  rapproche_transaction_idx?: number | null
  rapproche_at?: string | null
}

export interface TransitAlert {
  compte: string
  type: 'inter_societes_non_solde' | 'transit_non_solde' | 'transit_ancien_non_lettre'
  solde?: number
  count?: number
  message: string
}

export interface ReleveBancaire {
  id: string
  societe_id: string
  compte_bancaire_id: string
  periode: string | null
  date_debut: string | null
  date_fin: string | null
  transactions_json: BankTransaction[]
  solde_ouverture: number | null
  solde_cloture: number | null
}

export interface CompteBancaire {
  id: string
  societe_id: string
  banque: string | null
  numero_compte: string | null
  devise: string | null
  compte_comptable: string | null
  actif?: boolean
}

export interface RapprochementGetResponse {
  rapprochements: Record<string, unknown>[]
  bankTransactions: BankTransaction[]
  factures: Facture[]
  ecritures: EcritureComptable[]
  releves: ReleveBancaire[]
  comptesBancaires: CompteBancaire[]
  transit_alerts: TransitAlert[]
}

// ── Aged balance (balance âgée) ────────────────────────────────────
export type AgeBucket = 'current' | 'b_0_30' | 'b_31_60' | 'b_61_90' | 'b_90_plus'

export interface AgedFactureRow {
  id: string
  numero_facture: string | null
  date_facture: string | null
  date_echeance: string | null
  amount_open: number
  days_overdue: number
  bucket: AgeBucket
  devise: string | null
  statut: FactureStatut
}

export interface AgedTiersAgg {
  tiers: string
  count: number
  total: number
  current: number
  b_0_30: number
  b_31_60: number
  b_61_90: number
  b_90_plus: number
  factures: AgedFactureRow[]
}

export interface AgedBalanceResponse {
  as_of: string
  type: FactureType
  reference: 'echeance' | 'facture'
  totals: {
    count: number
    total: number
    current: number
    b_0_30: number
    b_31_60: number
    b_61_90: number
    b_90_plus: number
  }
  tiers: AgedTiersAgg[]
}

// ── TDS (Tax Deducted at Source) ────────────────────────────────────
export interface TdsDefault {
  id: string
  societe_id: string
  tiers: string
  tds_code: string
  tds_rate_pct: number
  tds_compte: string
  created_at: string
  updated_at: string
}

export type TdsCode =
  | 'TDS_3'
  | 'TDS_5'
  | 'TDS_075'
  | 'TDS_10'
  | 'TDS_15'
  | 'TDS_EXEMPT'
