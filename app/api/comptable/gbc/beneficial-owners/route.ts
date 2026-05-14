import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: ubos }, { data: history }] = await Promise.all([
      supabase.from('beneficial_owners').select('*').eq('societe_id', societe_id).is('effective_to', null).order('pct_detention', { ascending: false }),
      supabase.from('beneficial_owners_history').select('*').eq('societe_id', societe_id).order('changed_at', { ascending: false }).limit(50),
    ])
    const totalPct = (ubos || []).reduce((s: number, u: any) => s + Number(u.pct_detention || 0), 0)
    return NextResponse.json({
      societe_id, ubos: ubos || [], history: history || [],
      summary: {
        total_pct_declared: totalPct,
        compliance_warning: totalPct < 75 ? 'Détention déclarée < 75% — vérifier si UBOs manquants ≥10%' : null,
        nb_active: ubos?.length || 0,
      },
    })
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
    const { action, ubo_id, payload, societe_id } = body
    const supabase = getAdminClient()

    if (action === 'declare') {
      const { data, error } = await supabase.from('beneficial_owners').insert({ ...payload, declared_by: user.id }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await supabase.from('beneficial_owners_history').insert({
        societe_id: payload.societe_id, ubo_id: data.id, action: 'declared',
        new_value: payload, changed_by: user.id,
      })
      return NextResponse.json({ ok: true, ubo: data })
    }

    if (action === 'revoke') {
      if (!ubo_id) return NextResponse.json({ error: 'ubo_id requis' }, { status: 400 })
      const { data: prev } = await supabase.from('beneficial_owners').select('*').eq('id', ubo_id).single()
      const { error } = await supabase.from('beneficial_owners').update({ effective_to: new Date().toISOString().slice(0, 10) }).eq('id', ubo_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await supabase.from('beneficial_owners_history').insert({
        societe_id: prev?.societe_id, ubo_id, action: 'revoked',
        old_value: prev, changed_by: user.id,
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'attest') {
      if (!ubo_id) return NextResponse.json({ error: 'ubo_id requis' }, { status: 400 })
      const { error } = await supabase.from('beneficial_owners')
        .update({ last_verified_at: new Date().toISOString() }).eq('id', ubo_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await supabase.from('beneficial_owners_history').insert({
        societe_id, ubo_id, action: 'attested', changed_by: user.id,
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
