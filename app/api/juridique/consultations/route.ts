import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

async function guard(societeId: string) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const supabase = getAdminClient()
  try {
    await assertSocieteAccess(supabase, user.id, societeId)
  } catch (e) {
    if (e instanceof SocieteAccessError) return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) }
    throw e
  }
  return { supabase, user }
}

// POST — enregistrer une consultation / un acte dans l'historique (et un dossier)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const societeId = String(body.societe_id || '')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!body.type) return NextResponse.json({ error: 'type requis' }, { status: 400 })
    const g = await guard(societeId)
    if (g.error) return g.error
    const { data, error } = await g.supabase
      .from('juridique_consultations')
      .insert({
        societe_id: societeId,
        dossier_id: body.dossier_id ?? null,
        type: body.type,
        titre: body.titre ?? null,
        contenu: body.contenu ?? {},
        sources: body.sources ?? null,
        created_by: g.user?.id ?? null,
      })
      .select('id, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, consultation: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE — supprimer une note / consultation (?id=...)
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const supabase = getAdminClient()
    // Vérifie l'accès via la société de la consultation.
    const { data: row, error: e1 } = await supabase.from('juridique_consultations').select('societe_id').eq('id', id).single()
    if (e1 || !row) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    try {
      await assertSocieteAccess(supabase, user.id, row.societe_id)
    } catch (e) {
      if (e instanceof SocieteAccessError) return apiError('access_denied', 403)
      throw e
    }
    const { error } = await supabase.from('juridique_consultations').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// GET — liste des consultations d'une société (option ?dossier_id=)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const societeId = url.searchParams.get('societe_id')
    const dossierId = url.searchParams.get('dossier_id')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const g = await guard(societeId)
    if (g.error) return g.error
    let q = g.supabase.from('juridique_consultations').select('id, type, titre, sources, created_at, dossier_id').eq('societe_id', societeId).order('created_at', { ascending: false }).limit(100)
    if (dossierId) q = q.eq('dossier_id', dossierId)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ consultations: data || [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
