/**
 * /api/comptable/cabinet/tags
 *
 * GET                          → liste tags du cabinet de l'utilisateur
 * POST                         → crée un tag { libelle, couleur?, icone? }
 * PATCH  ?id=…                 → modifie tag
 * DELETE ?id=…                 → supprime tag (et ses assignments cascade)
 *
 * Sous-ressource assignment :
 * PUT    ?tag_id=…&societe_id=… → toggle l'assignation
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'super_admin', 'comptable', 'comptable_dedie']

async function requireComptable() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = getAdminClient()
  const { data: profile } = await supabase
    .from('profiles').select('id, role, parent_comptable_id').eq('id', user.id).maybeSingle()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) return null
  return { user, profile, supabase, cabinetOwnerId: profile.parent_comptable_id || profile.id }
}

export async function GET() {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { supabase, cabinetOwnerId } = ctx
  const { data, error } = await supabase
    .from('cabinet_tags')
    .select('id, libelle, couleur, icone, created_at')
    .eq('comptable_id', cabinetOwnerId)
    .order('libelle')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tags: data || [] })
}

export async function POST(request: Request) {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { supabase, cabinetOwnerId } = ctx
  const { libelle, couleur, icone } = await request.json()
  if (!libelle?.trim()) return NextResponse.json({ error: 'libelle requis' }, { status: 400 })
  const { data, error } = await supabase
    .from('cabinet_tags')
    .insert({
      comptable_id: cabinetOwnerId,
      libelle: libelle.trim(),
      couleur: couleur || '#0B0F2E',
      icone: icone || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tag: data })
}

export async function PATCH(request: Request) {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { supabase } = ctx
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.libelle !== undefined) updates.libelle = String(body.libelle).trim()
  if (body.couleur !== undefined) updates.couleur = body.couleur
  if (body.icone !== undefined) updates.icone = body.icone
  const { data, error } = await supabase
    .from('cabinet_tags').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tag: data })
}

export async function DELETE(request: Request) {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { supabase } = ctx
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const { error } = await supabase.from('cabinet_tags').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PUT — toggle assignation tag ↔ société
export async function PUT(request: Request) {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { user, supabase } = ctx
  const { searchParams } = new URL(request.url)
  const tag_id = searchParams.get('tag_id')
  const societe_id = searchParams.get('societe_id')
  if (!tag_id || !societe_id) {
    return NextResponse.json({ error: 'tag_id et societe_id requis' }, { status: 400 })
  }

  // Toggle : delete si existe, insert sinon
  const { data: existing } = await supabase
    .from('cabinet_tag_assignments')
    .select('tag_id')
    .eq('tag_id', tag_id)
    .eq('societe_id', societe_id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('cabinet_tag_assignments')
      .delete()
      .eq('tag_id', tag_id)
      .eq('societe_id', societe_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ assigned: false })
  }

  const { error } = await supabase
    .from('cabinet_tag_assignments')
    .insert({ tag_id, societe_id, assigned_by: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assigned: true })
}
