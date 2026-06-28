/**
 * /api/comptable/cabinet/notes
 *
 * GET    ?societe_id=…   → notes internes de ce client (visibles cabinet only)
 * POST                   → crée une note { societe_id, contenu, type?, pinned? }
 * PATCH  ?id=…           → modifie une note
 * DELETE ?id=…           → supprime une note
 *
 * RLS gère la visibilité ; la route délègue à Supabase l'enforcement.
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
  return { user, profile, supabase }
}

export async function GET(request: Request) {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { supabase } = ctx
  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const { data, error } = await supabase
    .from('cabinet_notes')
    .select('id, societe_id, comptable_id, contenu, type, pinned, created_by, created_at, updated_at')
    .eq('societe_id', societe_id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: data || [] })
}

export async function POST(request: Request) {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { user, profile, supabase } = ctx
  const body = await request.json()
  const { societe_id, contenu, type, pinned } = body
  if (!societe_id || !contenu?.trim()) {
    return NextResponse.json({ error: 'societe_id et contenu requis' }, { status: 400 })
  }
  const comptableId = profile.parent_comptable_id || profile.id
  const { data, error } = await supabase
    .from('cabinet_notes')
    .insert({
      societe_id,
      comptable_id: comptableId,
      contenu: contenu.trim(),
      type: type || 'note',
      pinned: !!pinned,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
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
  if (body.contenu !== undefined) updates.contenu = String(body.contenu || '').trim()
  if (body.type !== undefined) updates.type = body.type
  if (body.pinned !== undefined) updates.pinned = !!body.pinned
  const { data, error } = await supabase
    .from('cabinet_notes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}

export async function DELETE(request: Request) {
  const ctx = await requireComptable()
  if (!ctx) return apiError('unauthorized', 401)
  const { supabase } = ctx
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const { error } = await supabase.from('cabinet_notes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
