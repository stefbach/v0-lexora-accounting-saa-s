import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkPeriodLock } from '@/lib/accounting/period-lock'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * PATCH /api/comptable/transactions-bancaires
 *   body: { releve_id, transaction_idx, societe_id, tiers_detecte?, libelle?, date?, debit?, credit? }
 *
 * Permet de corriger manuellement une transaction bancaire importee
 * (ex: l OCR a mal detecte le tiers "MYT MAURITIUS TELECOM" au lieu de "MyT").
 */
export async function PATCH(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { releve_id, transaction_idx, societe_id, tiers_detecte, libelle, date, debit, credit } = body
    if (!releve_id || transaction_idx === undefined || transaction_idx === null) {
      return NextResponse.json({ error: 'releve_id et transaction_idx requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { data: releve, error: relErr } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json, societe_id')
      .eq('id', releve_id)
      .single()
    if (relErr || !releve) {
      return NextResponse.json({ error: `Releve non trouve: ${relErr?.message}` }, { status: 404 })
    }

    const txs = [...(releve.transactions_json || [])]
    const idx = Number(transaction_idx)
    if (idx < 0 || idx >= txs.length) {
      return NextResponse.json({ error: 'transaction_idx hors bornes' }, { status: 400 })
    }
    const tx = txs[idx]

    // Verif periode non verrouillee
    const checkDate = date || tx.date
    if (checkDate && (societe_id || releve.societe_id)) {
      const lockStatus = await checkPeriodLock(supabase, societe_id || releve.societe_id, checkDate)
      if (lockStatus.locked) {
        return NextResponse.json({
          error: `Periode verrouillee — ${lockStatus.reason}`,
        }, { status: 403 })
      }
    }

    const updated = { ...tx }
    if (tiers_detecte !== undefined) updated.tiers_detecte = tiers_detecte
    if (libelle !== undefined) updated.libelle = libelle
    if (date !== undefined) updated.date = date
    if (debit !== undefined) updated.debit = Number(debit) || 0
    if (credit !== undefined) updated.credit = Number(credit) || 0

    txs[idx] = updated

    const { error: updErr } = await supabase
      .from('releves_bancaires')
      .update({ transactions_json: txs })
      .eq('id', releve_id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      releve_id,
      transaction_idx: idx,
      tx: updated,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
