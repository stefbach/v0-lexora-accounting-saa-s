import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

async function guard(societeId: string | null) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const supabase = getAdminClient()
  if (societeId) {
    try {
      await assertSocieteAccess(supabase, user.id, societeId)
    } catch (err) {
      if (err instanceof SocieteAccessError) return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) }
      throw err
    }
  }
  return { supabase, user }
}

// GET — liste des dossiers d'une société
export async function GET(request: Request) {
  try {
    const societeId = new URL(request.url).searchParams.get('societe_id')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const g = await guard(societeId)
    if (g.error) return g.error
    const { data, error } = await g.supabase
      .from('juridique_dossiers')
      .select('*')
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dossiers: data || [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — création d'un dossier
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const societeId = String(body.societe_id || '')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!body.intitule) return NextResponse.json({ error: 'Intitulé requis' }, { status: 400 })
    const g = await guard(societeId)
    if (g.error) return g.error
    const { data, error } = await g.supabase
      .from('juridique_dossiers')
      .insert({
        societe_id: societeId,
        intitule: body.intitule,
        reference: body.reference ?? null,
        type_contentieux: body.type_contentieux ?? null,
        partie_adverse: body.partie_adverse ?? null,
        notre_role: body.notre_role ?? null,
        montant_en_jeu: body.montant_en_jeu ?? null,
        devise: body.devise ?? 'MUR',
        juridiction: body.juridiction ?? null,
        statut: body.statut ?? 'ouvert',
        urgence: body.urgence ?? null,
        prescription_date: body.prescription_date ?? null,
        resume: body.resume ?? null,
        created_by: g.user?.id ?? null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dossier: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
