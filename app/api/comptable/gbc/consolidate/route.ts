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
    const parent_societe_id = searchParams.get('parent_societe_id')
    const exercice = searchParams.get('exercice')
    if (!parent_societe_id || !exercice) return NextResponse.json({ error: 'parent_societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: relationships }, { data: aggregate }, { data: eliminations }, { data: nci }] = await Promise.all([
      supabase.from('societes_relationships').select('*, child:societes!child_societe_id(id, nom, devise_fonctionnelle)').eq('parent_societe_id', parent_societe_id).is('effective_to', null),
      supabase.rpc('consolidate_aggregate', { p_parent_societe_id: parent_societe_id, p_exercice: exercice }),
      supabase.from('consolidation_eliminations').select('*').eq('parent_societe_id', parent_societe_id).eq('exercice', exercice),
      supabase.rpc('compute_nci', { p_parent_societe_id: parent_societe_id, p_exercice: exercice }),
    ])

    // Apply eliminations
    const elimMap = new Map<string, number>()
    for (const elim of eliminations || []) {
      // Each elimination is a debit/credit pair on certain accounts — for now we keep it simple
      // and just expose them so the consumer can apply.
    }

    return NextResponse.json({
      parent_societe_id, exercice,
      relationships: relationships || [],
      consolidation_scope: { full: (relationships || []).filter((r: any) => r.consolidation_method === 'full').length },
      aggregate: aggregate || [],
      eliminations: eliminations || [],
      nci: nci || [],
      total_goodwill_mur: (relationships || []).reduce((s: number, r: any) => s + Number(r.goodwill_mur || 0), 0),
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
    const supabase = getAdminClient()

    if (body.action === 'add_relationship') {
      const { data, error } = await supabase.from('societes_relationships').insert(body.payload).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, relationship: data })
    }
    if (body.action === 'add_elimination') {
      const { data, error } = await supabase.from('consolidation_eliminations').insert(body.payload).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, elimination: data })
    }
    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
