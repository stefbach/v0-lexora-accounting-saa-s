/**
 * Logique de création d'une facture Lexora à partir d'une demande
 * d'inscription validée. Appelée depuis l'API de validation admin.
 *
 * Étapes :
 *   1) Lit la config DDS (singleton lexora_settings)
 *   2) Construit le snapshot client + émetteur
 *   3) Calcule HT/TVA/TTC
 *   4) Génère un numéro via la séquence (next_lexora_invoice_number)
 *   5) Insère la facture
 *   6) Crée l'écriture comptable correspondante dans la société DDS
 *      (si dossier_id renseigné dans lexora_settings)
 *
 * Idempotence : si une facture existe déjà pour `demande_id`, retourne
 * la facture existante sans en créer une seconde.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CustomerSnapshot,
  IssuerSnapshot,
  InvoiceLine,
  LexoraInvoice,
} from './types'

interface CreateInvoiceInput {
  supabaseAdmin: SupabaseClient
  demande_id: string
  client_societe_id: string | null
  client_user_id: string | null
  plan: { code: string; nom: string; prix_mensuel_mur: number } | null
  periodicite: 'mensuelle' | 'annuelle'
  tarif_final_mur: number      // tarif final décidé par l'admin (HT)
  invoice_date: string         // YYYY-MM-DD — typiquement date_cgv ou today
  cgv_accepted_at: string | null
  customer: CustomerSnapshot
  created_by: string | null
}

export async function createLexoraInvoice(input: CreateInvoiceInput): Promise<{
  invoice: LexoraInvoice | null
  reused: boolean
  error?: string
}> {
  const { supabaseAdmin } = input

  // Idempotence : facture déjà émise pour cette demande ?
  if (input.demande_id) {
    const { data: existing } = await supabaseAdmin
      .from('lexora_invoices')
      .select('*')
      .eq('demande_id', input.demande_id)
      .maybeSingle()
    if (existing) return { invoice: existing as any, reused: true }
  }

  // 1) Config émetteur
  const { data: settings, error: setErr } = await supabaseAdmin
    .from('lexora_settings').select('*').eq('id', 1).maybeSingle()
  if (setErr || !settings) {
    return { invoice: null, reused: false, error: `Config lexora_settings manquante : ${setErr?.message || 'singleton absent'}` }
  }

  const issuer: IssuerSnapshot = {
    raison_sociale: settings.raison_sociale,
    brn: settings.brn,
    vat_number: settings.vat_number,
    adresse: settings.adresse,
    ville: settings.ville,
    pays: settings.pays,
    telephone: settings.telephone,
    email: settings.email,
    website: settings.website,
    banque_nom: settings.banque_nom,
    iban: settings.iban,
    swift_bic: settings.swift_bic,
    numero_compte: settings.numero_compte,
  }

  // 2) Montants
  const tvaRate = Number(settings.tva_rate_default) || 15
  const amountHt = Math.round(Number(input.tarif_final_mur) * 100) / 100
  const tvaAmount = Math.round(amountHt * (tvaRate / 100) * 100) / 100
  const amountTtc = Math.round((amountHt + tvaAmount) * 100) / 100

  const designation = input.plan
    ? `Abonnement Lexora — ${input.plan.nom} (${input.periodicite})`
    : `Abonnement Lexora (${input.periodicite})`

  const lines: InvoiceLine[] = [{
    designation,
    quantite: 1,
    prix_unitaire_ht: amountHt,
    tva_rate: tvaRate,
    montant_ht: amountHt,
  }]

  // 3) Numéro de facture
  const { data: numRows, error: numErr } = await supabaseAdmin.rpc(
    'next_lexora_invoice_number',
    { p_prefix: settings.invoice_prefix || 'LEX' }
  )
  if (numErr || !numRows) {
    return { invoice: null, reused: false, error: `Échec génération numéro : ${numErr?.message}` }
  }
  const invoiceNumber: string = typeof numRows === 'string' ? numRows : (numRows as any)?.toString()

  // 4) Date d'échéance
  const dueDate = new Date(input.invoice_date)
  dueDate.setDate(dueDate.getDate() + (Number(settings.payment_terms_days) || 30))

  // 5) Insertion
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('lexora_invoices')
    .insert({
      demande_id: input.demande_id,
      client_societe_id: input.client_societe_id,
      client_user_id: input.client_user_id,
      invoice_number: invoiceNumber,
      invoice_date: input.invoice_date,
      due_date: dueDate.toISOString().slice(0, 10),
      cgv_accepted_at: input.cgv_accepted_at,
      customer_snapshot: input.customer,
      issuer_snapshot: issuer,
      lines,
      devise: 'MUR',
      amount_ht: amountHt,
      tva_amount: tvaAmount,
      amount_ttc: amountTtc,
      status: 'emise',
      created_by: input.created_by,
    })
    .select('*')
    .single()

  if (insErr || !inserted) {
    return { invoice: null, reused: false, error: `Insertion facture : ${insErr?.message}` }
  }

  // 6) Écriture comptable (Sprint 2)
  if (settings.dossier_id) {
    await createAccountingEntry(supabaseAdmin, inserted as any, settings)
  }

  return { invoice: inserted as any, reused: false }
}

/**
 * Sprint 2 — Écriture comptable dans la société DDS.
 *
 * Journal VTE :
 *   - Débit 411-Clients            : amount_ttc
 *   - Crédit 706-Prestations svc   : amount_ht
 *   - Crédit 4457-TVA collectée    : tva_amount
 *
 * On utilise un même `numero_piece` pour les 3 lignes et on le persiste
 * sur la facture (`accounting_entry_ref`).
 */
async function createAccountingEntry(
  supabaseAdmin: SupabaseClient,
  invoice: LexoraInvoice,
  settings: any,
): Promise<void> {
  const numeroPiece = invoice.invoice_number
  const libelle = `Facture ${invoice.invoice_number} — ${(invoice.customer_snapshot as any)?.nom || 'Client'}`

  const lignes = [
    { compte: settings.compte_client,  debit: invoice.amount_ttc, credit: 0 },
    { compte: settings.compte_produit, debit: 0, credit: invoice.amount_ht },
    { compte: settings.compte_tva,     debit: 0, credit: invoice.tva_amount },
  ]

  const rows = lignes.map(l => ({
    dossier_id: settings.dossier_id,
    date_ecriture: invoice.invoice_date,
    journal: settings.journal_vente || 'VTE',
    numero_piece: numeroPiece,
    compte: l.compte,
    libelle,
    debit: l.debit,
    credit: l.credit,
  }))

  const { error } = await supabaseAdmin.from('ecritures_comptables').insert(rows)
  if (error) {
    // On ne fait pas échouer la facture pour ça — on loggue.
    console.warn('[lexora-billing] écriture compta échouée:', error.message)
    return
  }

  await supabaseAdmin
    .from('lexora_invoices')
    .update({
      accounting_entry_ref: numeroPiece,
      accounting_dossier_id: settings.dossier_id,
    })
    .eq('id', invoice.id)
}
