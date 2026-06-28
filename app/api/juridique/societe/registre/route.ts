import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

const REGISTRES = new Set(['associes', 'administrateurs', 'beneficiaires'])

async function authed() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  return { supabase: getAdminClient(), user }
}

// GET — inscriptions manuelles d'un registre (?societe_id=&registre=)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const societeId = url.searchParams.get('societe_id')
    const registre = url.searchParams.get('registre')
    if (!societeId || !registre) return NextResponse.json({ error: 'societe_id et registre requis' }, { status: 400 })
    const a = await authed(); if (a.error) return a.error
    try { await assertSocieteAccess(a.supabase, a.user.id, societeId) }
    catch (e) { if (e instanceof SocieteAccessError) return apiError('access_denied', 403); throw e }
    const { data, error } = await a.supabase
      .from('juridique_registre_entries')
      .select('id, data, created_at')
      .eq('societe_id', societeId).eq('registre', registre)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ entries: data || [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — ajouter une inscription { societe_id, registre, data }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { societe_id?: string; registre?: string; data?: Record<string, unknown> }
    if (!body.societe_id || !body.registre || !REGISTRES.has(body.registre)) {
      return NextResponse.json({ error: 'societe_id et registre valides requis' }, { status: 400 })
    }
    const a = await authed(); if (a.error) return a.error
    try { await assertSocieteAccess(a.supabase, a.user.id, body.societe_id) }
    catch (e) { if (e instanceof SocieteAccessError) return apiError('access_denied', 403); throw e }
    const { data, error } = await a.supabase
      .from('juridique_registre_entries')
      .insert({ societe_id: body.societe_id, registre: body.registre, data: body.data ?? {}, created_by: a.user.id })
      .select('id, data, created_at').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ entry: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE — supprimer une inscription (?id=)
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
    const a = await authed(); if (a.error) return a.error
    const { data: row, error: e1 } = await a.supabase.from('juridique_registre_entries').select('societe_id').eq('id', id).single()
    if (e1 || !row) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    try { await assertSocieteAccess(a.supabase, a.user.id, row.societe_id) }
    catch (e) { if (e instanceof SocieteAccessError) return apiError('access_denied', 403); throw e }
    const { error } = await a.supabase.from('juridique_registre_entries').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
