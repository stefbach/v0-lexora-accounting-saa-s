import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

const NORMALIZED_KEYS = [
  // Modules /tarifs
  'documents','comptabilite','facturation','rh','fiscal',
  'alertes_ia','tibok','telegram',
  // Sous-modules avancés internes
  'juridique','etats_financiers','employe_portal',
] as const

function normalizeModules(input: any): Record<string, boolean> {
  const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const out: Record<string, boolean> = {}
  for (const k of NORMALIZED_KEYS) out[k] = src[k] === true
  return out
}

// PUT — édite un plan
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const admin = getAdminClient()

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.nom !== undefined) payload.nom = String(body.nom).trim()
  if (body.description !== undefined) payload.description = body.description || null
  if (body.type_cible !== undefined) {
    if (!['dirigeant', 'comptable'].includes(body.type_cible)) {
      return NextResponse.json({ error: 'type_cible invalide' }, { status: 400 })
    }
    payload.type_cible = body.type_cible
  }
  if (body.prix_mensuel_mur !== undefined) payload.prix_mensuel_mur = Number(body.prix_mensuel_mur) || 0
  if (body.prix_annuel_mur !== undefined) payload.prix_annuel_mur = body.prix_annuel_mur != null ? Number(body.prix_annuel_mur) : null
  if (body.modules_inclus !== undefined) payload.modules_inclus = normalizeModules(body.modules_inclus)
  if (body.populaire !== undefined) payload.populaire = !!body.populaire
  if (body.ordre !== undefined) payload.ordre = Number(body.ordre)
  if (body.actif !== undefined) payload.actif = !!body.actif

  const { data, error } = await admin.from('plans').update(payload).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}

// DELETE — supprime un plan (refusé si rattaché à des demandes)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const admin = getAdminClient()

  // Vérifie qu'aucune demande n'utilise ce plan
  const [{ count: usedByDemandes }, { count: usedByAttribues }] = await Promise.all([
    admin.from('demandes_inscription').select('id', { count: 'exact', head: true }).eq('plan_id', id),
    admin.from('demandes_inscription').select('id', { count: 'exact', head: true }).eq('plan_attribue_id', id),
  ])
  if ((usedByDemandes || 0) + (usedByAttribues || 0) > 0) {
    return NextResponse.json(
      { error: 'Ce plan est référencé par des demandes d\'inscription. Désactivez-le plutôt que de le supprimer.' },
      { status: 409 },
    )
  }

  const { error } = await admin.from('plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
