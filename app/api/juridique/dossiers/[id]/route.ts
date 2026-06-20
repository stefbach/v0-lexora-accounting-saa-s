import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

async function authed() {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  return { supabase: getAdminClient(), user }
}

async function loadDossier(supabase: ReturnType<typeof getAdminClient>, id: string, userId: string) {
  const { data: dossier, error } = await supabase.from('juridique_dossiers').select('*').eq('id', id).single()
  if (error || !dossier) return { err: NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 }) }
  try {
    await assertSocieteAccess(supabase, userId, dossier.societe_id)
  } catch (e) {
    if (e instanceof SocieteAccessError) return { err: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) }
    throw e
  }
  return { dossier }
}

// GET — détail dossier + pièces + consultations
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const a = await authed(); if (a.error) return a.error
    const r = await loadDossier(a.supabase, id, a.user.id); if (r.err) return r.err

    const [pieces, consultations] = await Promise.all([
      a.supabase.from('juridique_pieces').select('id, nom, storage_path, media_type, taille_bytes, categorie, created_at').eq('dossier_id', id).order('created_at', { ascending: false }),
      a.supabase.from('juridique_consultations').select('id, type, titre, contenu, sources, created_at').eq('dossier_id', id).order('created_at', { ascending: false }),
    ])
    const withUrls = (pieces.data || []).map((p) => ({
      ...p,
      url: a.supabase.storage.from('documents').getPublicUrl(p.storage_path).data?.publicUrl ?? null,
    }))
    return NextResponse.json({ dossier: r.dossier, pieces: withUrls, consultations: consultations.data || [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// PATCH — mise à jour
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const a = await authed(); if (a.error) return a.error
    const r = await loadDossier(a.supabase, id, a.user.id); if (r.err) return r.err
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const allowed = ['intitule', 'reference', 'type_contentieux', 'partie_adverse', 'notre_role', 'montant_en_jeu', 'devise', 'juridiction', 'statut', 'urgence', 'prescription_date', 'resume']
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in body) patch[k] = body[k]
    const { data, error } = await a.supabase.from('juridique_dossiers').update(patch).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dossier: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const a = await authed(); if (a.error) return a.error
    const r = await loadDossier(a.supabase, id, a.user.id); if (r.err) return r.err
    const { error } = await a.supabase.from('juridique_dossiers').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
