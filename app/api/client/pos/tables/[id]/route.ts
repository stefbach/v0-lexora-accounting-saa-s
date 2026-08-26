/**
 * /api/client/pos/tables/[id]
 * PATCH  : renomme / change zone / capacité / statut d'une table.
 * DELETE : désactive une table (soft) — refuse si une addition est ouverte.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

async function auth(request: Request) {
  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id') || ''
  if (!societe_id) throw { _http: 400, msg: 'societe_id requis' }
  const supabase = getAdminClient()
  const authClient = await createClient()
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) throw { _http: 401, msg: 'unauthorized' }
  await assertSocieteAccess(supabase, user.id, societe_id)
  return { supabase, societe_id }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { supabase, societe_id } = await auth(request)
    const patch: Record<string, unknown> = {}
    if (typeof body.nom === 'string') patch.nom = body.nom.trim().slice(0, 100)
    if (typeof body.zone === 'string') patch.zone = body.zone.trim().slice(0, 60)
    if (body.capacite !== undefined) patch.capacite = body.capacite === null ? null : Math.trunc(Number(body.capacite)) || null
    if (['libre', 'occupee', 'reservee'].includes(body.statut)) patch.statut = body.statut
    if (body.position_x !== undefined) patch.position_x = Math.trunc(Number(body.position_x)) || null
    if (body.position_y !== undefined) patch.position_y = Math.trunc(Number(body.position_y)) || null
    const { data, error } = await supabase
      .from('tables_restaurant').update(patch).eq('id', id).eq('societe_id', societe_id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (e: any) {
    if (e?._http) return NextResponse.json({ error: e.msg }, { status: e._http })
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, societe_id } = await auth(request)
    const { count } = await supabase
      .from('additions').select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id).eq('table_id', id).eq('statut', 'ouverte')
    if ((count || 0) > 0) return NextResponse.json({ error: 'Addition ouverte sur cette table' }, { status: 409 })
    const { error } = await supabase
      .from('tables_restaurant').update({ actif: false }).eq('id', id).eq('societe_id', societe_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?._http) return NextResponse.json({ error: e.msg }, { status: e._http })
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
