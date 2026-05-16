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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const admin = getAdminClient()

  const [{ data: invoice, error }, { data: dunning }] = await Promise.all([
    admin.from('lexora_invoices').select('*').eq('id', id).maybeSingle(),
    admin.from('lexora_dunning_log').select('*').eq('invoice_id', id).order('sent_at', { ascending: false }),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoice) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

  return NextResponse.json({ invoice, dunning: dunning || [] })
}

// PUT — actions : mark-paid / cancel / update notes
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const action = body?.action as string
  const admin = getAdminClient()

  const { data: invoice } = await admin.from('lexora_invoices').select('*').eq('id', id).maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

  if (action === 'mark_paid') {
    const paidAt = body.paid_at || new Date().toISOString()
    const { error } = await admin.from('lexora_invoices').update({
      status: 'payee',
      paid_at: paidAt,
      amount_paid: invoice.amount_ttc,
      payment_method: body.payment_method || 'virement',
      payment_reference: body.payment_reference || null,
      bank_transaction_id: body.bank_transaction_id || null,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sprint 2 — pendant comptable : encaissement BNQ ↔ 411
    await postEncaissementEntry(admin, invoice, paidAt)

    return NextResponse.json({ success: true })
  }

  if (action === 'cancel') {
    const { error } = await admin.from('lexora_invoices')
      .update({ status: 'annulee', notes: body.reason || invoice.notes })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update_notes') {
    const { error } = await admin.from('lexora_invoices').update({ notes: body.notes }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 })
}

// Encaissement BNQ → 411 lors du marquage payé.
async function postEncaissementEntry(admin: any, invoice: any, paidAtIso: string) {
  const { data: settings } = await admin.from('lexora_settings').select('*').eq('id', 1).maybeSingle()
  if (!settings?.dossier_id) return
  const date = paidAtIso.slice(0, 10)
  const piece = `${invoice.invoice_number}-PMT`
  const libelle = `Encaissement facture ${invoice.invoice_number}`
  const rows = [
    { dossier_id: settings.dossier_id, date_ecriture: date, journal: 'BNQ', numero_piece: piece, compte: '512000', libelle, debit: invoice.amount_ttc, credit: 0 },
    { dossier_id: settings.dossier_id, date_ecriture: date, journal: 'BNQ', numero_piece: piece, compte: settings.compte_client, libelle, debit: 0, credit: invoice.amount_ttc },
  ]
  await admin.from('ecritures_comptables').insert(rows)
}
