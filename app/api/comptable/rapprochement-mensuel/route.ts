import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Tableau de rapprochement bancaire mensuel officiel
 * Spec: NIVEAU P1-C4
 *
 * GET  /api/comptable/rapprochement-mensuel?societe_id=...&compte_bancaire_id=...&period_end=...
 *      Retourne le tableau pour le compte + période donnés (ou le dernier existant)
 * POST /api/comptable/rapprochement-mensuel
 *      action: 'create' | 'submit' | 'validate' | 'lock' | 'add_item' | 'remove_item'
 */

export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const compte_bancaire_id = searchParams.get('compte_bancaire_id')
    const period_end = searchParams.get('period_end')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Liste de tous les rapprochements mensuels pour la société
    if (!compte_bancaire_id && !period_end) {
      const { data: list, error } = await supabase
        .from('bank_reconciliations')
        .select('*, comptes_bancaires(banque, numero_compte, devise)')
        .eq('societe_id', societe_id)
        .order('period_end', { ascending: false })
        .limit(50)

      if (error) {
        if ((error.message || '').includes('does not exist')) {
          return NextResponse.json({ reconciliations: [], migrated: false })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ reconciliations: list || [] })
    }

    // Détail d'un rapprochement spécifique
    if (compte_bancaire_id && period_end) {
      const { data: recon, error } = await supabase
        .from('bank_reconciliations')
        .select('*, comptes_bancaires(banque, numero_compte, devise, compte_comptable)')
        .eq('societe_id', societe_id)
        .eq('compte_bancaire_id', compte_bancaire_id)
        .eq('period_end', period_end)
        .maybeSingle()

      if (error && !error.message.includes('does not exist')) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const { data: items } = recon ? await supabase
        .from('reconciliation_items')
        .select('*')
        .eq('reconciliation_id', recon.id)
        .order('date_operation', { ascending: false }) : { data: [] }

      return NextResponse.json({ reconciliation: recon, items: items || [] })
    }

    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ── CREATE: Créer un nouveau rapprochement pour un compte/période ──
    if (action === 'create') {
      const { societe_id, compte_bancaire_id, period_start, period_end, bank_balance } = body
      if (!societe_id || !compte_bancaire_id || !period_end) {
        return NextResponse.json({ error: 'societe_id, compte_bancaire_id, period_end requis' }, { status: 400 })
      }

      // Récupérer le compte comptable
      const { data: compte } = await supabase.from('comptes_bancaires')
        .select('compte_comptable').eq('id', compte_bancaire_id).single()
      const numeroCompteCompta = compte?.compte_comptable || '512'

      // Calculer le solde GL depuis ecritures_comptables_v2
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      let glBalance = 0
      if (dossier) {
        const { data: ecritures } = await supabase
          .from('ecritures_comptables_v2')
          .select('debit_mur, credit_mur')
          .eq('dossier_id', dossier.id)
          .eq('numero_compte', numeroCompteCompta)
          .lte('date_ecriture', period_end)
        glBalance = (ecritures || []).reduce((s: number, e: any) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0)
        glBalance = Math.round(glBalance * 100) / 100
      }

      const { data: created, error } = await supabase.from('bank_reconciliations').upsert({
        societe_id, compte_bancaire_id,
        numero_compte_compta: numeroCompteCompta,
        period_start: period_start || null,
        period_end,
        bank_balance: Number(bank_balance) || 0,
        gl_balance: glBalance,
        adjusted_bank_balance: Number(bank_balance) || 0,
        adjusted_gl_balance: glBalance,
        residual_gap: (Number(bank_balance) || 0) - glBalance,
        status: 'draft',
        prepared_by: user.id,
      }, { onConflict: 'societe_id,compte_bancaire_id,period_end' }).select().single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ reconciliation: created })
    }

    // ── ADD_ITEM: Ajouter un élément de rapprochement ──
    if (action === 'add_item') {
      const { reconciliation_id, side, nature, amount, category, date_operation, description } = body
      if (!reconciliation_id || !side || !amount) {
        return NextResponse.json({ error: 'reconciliation_id, side, amount requis' }, { status: 400 })
      }

      // B3 — bloquer si le rapprochement est verrouillé/validé
      const { data: reconStatus } = await supabase.from('bank_reconciliations')
        .select('status').eq('id', reconciliation_id).single()
      if (reconStatus && (reconStatus.status === 'locked' || reconStatus.status === 'validated')) {
        return NextResponse.json({
          error: `Rapprochement ${reconStatus.status === 'locked' ? 'verrouillé' : 'validé'} — modification interdite. Contactez un administrateur pour déverrouiller.`,
        }, { status: 403 })
      }

      const { data, error } = await supabase.from('reconciliation_items').insert({
        reconciliation_id, side, nature, amount: Number(amount), category,
        date_operation, description,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await recalculateBalance(supabase, reconciliation_id)
      return NextResponse.json({ item: data })
    }

    // ── REMOVE_ITEM: Supprimer un élément ──
    if (action === 'remove_item') {
      const { item_id, reconciliation_id } = body

      // B3 — bloquer si le rapprochement est verrouillé/validé
      if (reconciliation_id) {
        const { data: reconStatus } = await supabase.from('bank_reconciliations')
          .select('status').eq('id', reconciliation_id).single()
        if (reconStatus && (reconStatus.status === 'locked' || reconStatus.status === 'validated')) {
          return NextResponse.json({
            error: `Rapprochement ${reconStatus.status === 'locked' ? 'verrouillé' : 'validé'} — suppression interdite.`,
          }, { status: 403 })
        }
      }

      const { error } = await supabase.from('reconciliation_items').delete().eq('id', item_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (reconciliation_id) await recalculateBalance(supabase, reconciliation_id)
      return NextResponse.json({ ok: true })
    }

    // ── SUBMIT: Soumettre pour validation (comptable) ──
    if (action === 'submit') {
      const { id } = body
      const { error } = await supabase.from('bank_reconciliations')
        .update({ status: 'submitted' }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── VALIDATE: Valider (DAF uniquement) ──
    if (action === 'validate') {
      const { id } = body
      const { error } = await supabase.from('bank_reconciliations')
        .update({ status: 'validated', validated_by: user.id, validated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── LOCK: Verrouiller (irréversible sans intervention admin) ──
    if (action === 'lock') {
      const { id } = body
      const { data: recon } = await supabase.from('bank_reconciliations')
        .select('societe_id, period_end').eq('id', id).single()

      const { error } = await supabase.from('bank_reconciliations')
        .update({ status: 'locked', locked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Verrouiller la période comptable correspondante
      if (recon) {
        await supabase.from('accounting_periods').upsert({
          societe_id: recon.societe_id,
          period_start: new Date(new Date(recon.period_end).getFullYear(), new Date(recon.period_end).getMonth(), 1).toISOString().split('T')[0],
          period_end: recon.period_end,
          status: 'locked',
          closed_by: user.id,
          closed_at: new Date().toISOString(),
        }, { onConflict: 'societe_id,period_end' })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function recalculateBalance(supabase: any, reconciliationId: string) {
  const { data: recon } = await supabase.from('bank_reconciliations').select('bank_balance, gl_balance').eq('id', reconciliationId).single()
  if (!recon) return

  const { data: items } = await supabase.from('reconciliation_items').select('side, amount').eq('reconciliation_id', reconciliationId)
  const bankSide = (items || []).filter((i: any) => i.side === 'bank').reduce((s: number, i: any) => s + Number(i.amount), 0)
  const comptaSide = (items || []).filter((i: any) => i.side === 'compta').reduce((s: number, i: any) => s + Number(i.amount), 0)

  const adjustedBank = Number(recon.bank_balance) + bankSide
  const adjustedGl = Number(recon.gl_balance) + comptaSide
  const gap = Math.round((adjustedBank - adjustedGl) * 100) / 100

  await supabase.from('bank_reconciliations').update({
    adjusted_bank_balance: adjustedBank,
    adjusted_gl_balance: adjustedGl,
    residual_gap: gap,
  }).eq('id', reconciliationId)
}
