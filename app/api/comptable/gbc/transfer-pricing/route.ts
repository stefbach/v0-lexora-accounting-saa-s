import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: txs }, { data: masterFile }] = await Promise.all([
      supabase.from('tp_transactions').select('*').eq('societe_id', societe_id)
        .order('amount_mur', { ascending: false })
        .then((r: any) => exercice ? supabase.from('tp_transactions').select('*').eq('societe_id', societe_id).eq('exercice', exercice).order('amount_mur', { ascending: false }) : r),
      exercice ? supabase.from('tp_master_file').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle() : Promise.resolve({ data: null }),
    ])

    const summary = (txs || []).reduce((acc: any, t: any) => {
      acc.total_amount_mur += Number(t.amount_mur) || 0
      acc.by_tier[t.amount_mur >= 5000000 ? 'documentation_required' : t.amount_mur >= 1000000 ? 'recommended' : 'optional']++
      if (!t.is_within_range && t.is_within_range !== null) acc.flagged_not_arms_length++
      return acc
    }, { total_amount_mur: 0, count: txs?.length || 0, by_tier: { documentation_required: 0, recommended: 0, optional: 0 }, flagged_not_arms_length: 0 })

    return NextResponse.json({ societe_id, exercice, transactions: txs || [], master_file: masterFile, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const body = await request.json()
    const supabase = getAdminClient()

    if (body.kind === 'transaction') {
      const { data, error } = await supabase.from('tp_transactions').insert(body.payload).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, record: data })
    }
    if (body.kind === 'master_file') {
      const { data, error } = await supabase.from('tp_master_file').upsert(body.payload, { onConflict: 'societe_id,exercice' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, record: data })
    }
    return NextResponse.json({ error: 'kind doit être transaction ou master_file' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
