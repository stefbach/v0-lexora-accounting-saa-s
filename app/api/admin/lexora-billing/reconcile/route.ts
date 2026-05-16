/**
 * Sprint 3 — Rapprochement bancaire dédié aux factures Lexora.
 *
 * GET  : retourne les transactions bancaires non rapprochées du dossier DDS
 *        + suggestions de matching avec les factures impayées (par montant
 *        et/ou présence du numéro de facture dans le libellé).
 *
 * POST : { invoice_id, transaction_id } — marque la facture comme payée,
 *        lie la transaction, et passe par la route PUT existante pour
 *        générer l'écriture d'encaissement.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()

  const { data: settings } = await admin.from('lexora_settings').select('*').eq('id', 1).maybeSingle()
  if (!settings?.dossier_id) {
    return NextResponse.json({
      transactions: [], invoices: [], suggestions: [],
      warning: 'Société DDS non liée — renseignez dossier_id dans lexora_settings.',
    })
  }

  // 1) Transactions bancaires non rapprochées du dossier DDS
  //    (table `bank_transactions` standard du module compta Lexora).
  //    On filtre les crédits (entrées d'argent) non encore lettrés.
  const { data: txs } = await admin
    .from('bank_transactions')
    .select('id, date_operation, libelle, reference, montant, sens, lettrage_id')
    .eq('dossier_id', settings.dossier_id)
    .gt('montant', 0)
    .is('lettrage_id', null)
    .order('date_operation', { ascending: false })
    .limit(200)

  // 2) Factures impayées
  const { data: unpaid } = await admin
    .from('lexora_invoices')
    .select('id, invoice_number, invoice_date, due_date, amount_ttc, status, customer_snapshot, client_societe_id')
    .in('status', ['emise', 'partiellement_payee', 'en_retard'])
    .order('due_date', { ascending: true })

  // 3) Suggestions de matching : montant exact + numéro de facture dans le libellé/ref
  const suggestions: Array<{ transaction_id: string; invoice_id: string; score: number; reason: string }> = []
  for (const tx of (txs || [])) {
    for (const inv of (unpaid || [])) {
      const amountMatch = Math.abs(Number(tx.montant) - Number(inv.amount_ttc)) < 0.01
      const refIncludesNum =
        (tx.libelle || '').toUpperCase().includes(inv.invoice_number) ||
        (tx.reference || '').toUpperCase().includes(inv.invoice_number)
      if (amountMatch && refIncludesNum) {
        suggestions.push({ transaction_id: tx.id, invoice_id: inv.id, score: 100, reason: 'montant + référence' })
      } else if (amountMatch) {
        suggestions.push({ transaction_id: tx.id, invoice_id: inv.id, score: 70, reason: 'montant exact' })
      } else if (refIncludesNum) {
        suggestions.push({ transaction_id: tx.id, invoice_id: inv.id, score: 50, reason: 'référence trouvée' })
      }
    }
  }

  return NextResponse.json({
    transactions: txs || [],
    invoices: unpaid || [],
    suggestions: suggestions.sort((a, b) => b.score - a.score),
  })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { invoice_id, transaction_id } = body
  if (!invoice_id || !transaction_id) {
    return NextResponse.json({ error: 'invoice_id et transaction_id requis' }, { status: 400 })
  }

  const admin = getAdminClient()
  const [{ data: invoice }, { data: tx }] = await Promise.all([
    admin.from('lexora_invoices').select('*').eq('id', invoice_id).maybeSingle(),
    admin.from('bank_transactions').select('*').eq('id', transaction_id).maybeSingle(),
  ])
  if (!invoice) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
  if (!tx) return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 })

  // Marque la facture payée + lie la transaction
  await admin.from('lexora_invoices').update({
    status: 'payee',
    paid_at: tx.date_operation,
    amount_paid: invoice.amount_ttc,
    payment_method: 'virement',
    payment_reference: tx.reference || tx.libelle,
    bank_transaction_id: transaction_id,
  }).eq('id', invoice_id)

  // Écriture compta encaissement
  const { data: settings } = await admin.from('lexora_settings').select('*').eq('id', 1).maybeSingle()
  if (settings?.dossier_id) {
    const piece = `${invoice.invoice_number}-PMT`
    await admin.from('ecritures_comptables').insert([
      { dossier_id: settings.dossier_id, date_ecriture: tx.date_operation, journal: 'BNQ', numero_piece: piece, compte: '512000', libelle: `Encaissement ${invoice.invoice_number}`, debit: invoice.amount_ttc, credit: 0 },
      { dossier_id: settings.dossier_id, date_ecriture: tx.date_operation, journal: 'BNQ', numero_piece: piece, compte: settings.compte_client, libelle: `Encaissement ${invoice.invoice_number}`, debit: 0, credit: invoice.amount_ttc },
    ])
  }

  return NextResponse.json({ success: true })
}
