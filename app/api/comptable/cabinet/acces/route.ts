/**
 * /api/comptable/cabinet/acces
 *
 * Gestion des accès des collaborateurs aux clients du cabinet.
 *
 * GET    ?collaborateur_id=…   → liste accès d'un collaborateur (toutes ses sociétés + scope)
 * GET    ?societe_id=…         → liste collaborateurs ayant accès à un client + leur scope
 * PUT                          → upsert un accès { collaborateur_id, societe_id, scope }
 *                                  scope ∈ {compta, rh, both}
 * DELETE ?collaborateur_id=…&societe_id=…  → retire l'accès
 *
 * RLS empêche un collaborateur de modifier ces lignes (lecture seulement).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SCOPES = ['compta', 'rh', 'both'] as const

async function requireDirigeant() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = getAdminClient()
  const { data: profile } = await supabase
    .from('profiles').select('id, role, parent_comptable_id').eq('id', user.id).maybeSingle()
  if (!profile) return null
  const isDirigeant = !profile.parent_comptable_id &&
    ['comptable', 'comptable_dedie', 'admin', 'super_admin'].includes(profile.role)
  if (!isDirigeant) return null
  return { user, profile, supabase }
}

export async function GET(request: Request) {
  const ctx = await requireDirigeant()
  if (!ctx) return apiError('lead_accountant_only', 403)
  const { supabase } = ctx
  const { searchParams } = new URL(request.url)
  const collaborateur_id = searchParams.get('collaborateur_id')
  const societe_id = searchParams.get('societe_id')

  let query = supabase
    .from('cabinet_collaborateurs_acces')
    .select('id, collaborateur_id, societe_id, scope, created_at')
  if (collaborateur_id) query = query.eq('collaborateur_id', collaborateur_id)
  if (societe_id) query = query.eq('societe_id', societe_id)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ acces: data || [] })
}

export async function PUT(request: Request) {
  const ctx = await requireDirigeant()
  if (!ctx) return apiError('lead_accountant_only', 403)
  const { user, supabase } = ctx
  const { collaborateur_id, societe_id, scope } = await request.json()
  if (!collaborateur_id || !societe_id) {
    return NextResponse.json({ error: 'collaborateur_id et societe_id requis' }, { status: 400 })
  }
  const scopeOk = SCOPES.includes(scope)
  if (!scopeOk) {
    return NextResponse.json({ error: `scope invalide (attendu: ${SCOPES.join(', ')})` }, { status: 400 })
  }

  // Vérifie que le collaborateur est bien rattaché à ce dirigeant
  const { data: collab } = await supabase
    .from('profiles')
    .select('parent_comptable_id')
    .eq('id', collaborateur_id)
    .maybeSingle()
  if (!collab || collab.parent_comptable_id !== user.id) {
    return NextResponse.json({
      error: 'Ce collaborateur n\'est pas rattaché à votre cabinet.',
    }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('cabinet_collaborateurs_acces')
    .upsert({
      collaborateur_id,
      societe_id,
      scope,
      created_by: user.id,
    }, { onConflict: 'collaborateur_id,societe_id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ acces: data })
}

export async function DELETE(request: Request) {
  const ctx = await requireDirigeant()
  if (!ctx) return apiError('lead_accountant_only', 403)
  const { supabase } = ctx
  const { searchParams } = new URL(request.url)
  const collaborateur_id = searchParams.get('collaborateur_id')
  const societe_id = searchParams.get('societe_id')
  if (!collaborateur_id || !societe_id) {
    return NextResponse.json({ error: 'collaborateur_id et societe_id requis' }, { status: 400 })
  }
  const { error } = await supabase
    .from('cabinet_collaborateurs_acces')
    .delete()
    .eq('collaborateur_id', collaborateur_id)
    .eq('societe_id', societe_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
