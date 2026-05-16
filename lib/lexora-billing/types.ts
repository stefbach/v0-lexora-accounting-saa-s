// Types partagés pour la facturation Lexora (DDS Ltd → clients SaaS).
// Sources de vérité : tables `lexora_settings`, `lexora_invoices`,
// `lexora_dunning_log` (migration 278).

export type InvoiceStatus =
  | 'brouillon'
  | 'emise'
  | 'partiellement_payee'
  | 'payee'
  | 'en_retard'
  | 'annulee'

export type DunningChannel = 'email' | 'telegram' | 'sms' | 'whatsapp'

export interface InvoiceLine {
  designation: string
  quantite: number
  prix_unitaire_ht: number
  tva_rate: number
  montant_ht: number
}

export interface CustomerSnapshot {
  nom: string
  brn: string | null
  vat: string | null
  adresse: string | null
  ville: string | null
  dirigeant_nom: string | null
  dirigeant_email: string | null
  telephone: string | null
}

export interface IssuerSnapshot {
  raison_sociale: string
  brn: string | null
  vat_number: string | null
  adresse: string | null
  ville: string | null
  pays: string | null
  telephone: string | null
  email: string | null
  website: string | null
  banque_nom: string | null
  iban: string | null
  swift_bic: string | null
  numero_compte: string | null
}

export interface LexoraInvoice {
  id: string
  demande_id: string | null
  client_societe_id: string | null
  client_user_id: string | null
  invoice_number: string
  invoice_date: string
  due_date: string
  cgv_accepted_at: string | null
  customer_snapshot: CustomerSnapshot
  issuer_snapshot: IssuerSnapshot
  lines: InvoiceLine[]
  devise: string
  amount_ht: number
  tva_amount: number
  amount_ttc: number
  amount_paid: number
  status: InvoiceStatus
  paid_at: string | null
  payment_method: string | null
  payment_reference: string | null
  bank_transaction_id: string | null
  accounting_entry_ref: string | null
  accounting_dossier_id: string | null
  pdf_storage_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
