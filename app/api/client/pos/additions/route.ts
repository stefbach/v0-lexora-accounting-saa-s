/**
 * /api/client/pos/additions
 * GET  : additions ouvertes (avec table + nb articles).
 * POST : ouvre une addition (sur une table → table occupée).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data } = await supabase
      .from('additions')
      .select('id, numero, couverts, opened_at, table_id, tables_restaurant(code, nom), additions_lignes(id)')
      .eq('societe_id', societe_id).eq('statut', 'ouverte').order('opened_at')
    const items = (data || []).map((a: any) => ({ ...a, nb_articles: (a.additions_lignes || []).length }))
    return NextResponse.json({ items })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const table_id = body.table_id ? String(body.table_id) : null

    // Une seule addition ouverte par table.
    if (table_id) {
      const { data: existing } = await supabase
        .from('additions').select('id').eq('societe_id', societe_id).eq('table_id', table_id).eq('statut', 'ouverte').maybeSingle()
      if (existing) return NextResponse.json({ item: existing, existed: true })
    }

    const { data: table } = table_id
      ? await supabase.from('tables_restaurant').select('code, depot_id').eq('id', table_id).eq('societe_id', societe_id).maybeSingle()
      : { data: null as any }

    const { data: addition, error } = await supabase
      .from('additions')
      .insert({
        societe_id,
        table_id,
        depot_id: table?.depot_id || body.depot_id || null,
        session_caisse_id: body.session_id || null,
        numero: table?.code ? `T${table.code}` : null,
        couverts: body.couverts ? Math.trunc(Number(body.couverts)) || null : null,
        cree_par: user.id,
      })
      .select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (table_id) {
      await supabase.from('tables_restaurant').update({ statut: 'occupee' }).eq('id', table_id).eq('societe_id', societe_id)
    }
    return NextResponse.json({ item: addition }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
