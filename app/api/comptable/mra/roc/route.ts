import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** GET — ROC Annual Return */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice   = searchParams.get('exercice')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase.from('roc_annual_returns').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ roc: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, exercice, action, payload } = body
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    if (action === 'save') {
      const { data, error } = await supabase.from('roc_annual_returns').upsert({
        societe_id, exercice, ...payload, updated_at: new Date().toISOString(),
      }, { onConflict: 'societe_id,exercice' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, roc: data })
    }

    if (['submit_review', 'approve', 'submit_mra'].includes(action)) {
      const updateFields: any = { updated_at: new Date().toISOString() }
      if (action === 'submit_review') { updateFields.statut = 'review'; updateFields.reviewer_id = user.id }
      if (action === 'approve')       { updateFields.statut = 'approved'; updateFields.approver_id = user.id }
      if (action === 'submit_mra')    { updateFields.statut = 'submitted'; updateFields.date_filing = new Date().toISOString().slice(0, 10) }
      const { error } = await supabase.from('roc_annual_returns').update(updateFields).eq('societe_id', societe_id).eq('exercice', exercice)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, statut: updateFields.statut })
    }
    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
