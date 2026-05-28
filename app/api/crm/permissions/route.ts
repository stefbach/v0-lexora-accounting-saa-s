// =============================================================================
// GET  /api/crm/permissions   — liste les utilisateurs CRM + leurs permissions
// PUT  /api/crm/permissions   — met à jour les permissions d'un utilisateur
// =============================================================================
// Réservé aux admin / super_admin (gestion des accès fins du module CRM).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'

const CRM_ROLES = ['admin', 'super_admin', 'commercial']

async function requireAdmin() {
  const auth = await requireCrmAccess()
  if (!auth.ok) return { ok: false as const, status: auth.status, reason: auth.reason }
  if (auth.role !== 'admin' && auth.role !== 'super_admin') {
    return { ok: false as const, status: 403, reason: 'admin_only' }
  }
  return { ok: true as const, user: auth.user }
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: guard.status })

  const admin = getAdminClient()
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .in('role', CRM_ROLES)
    .order('role', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: perms } = await admin
    .from('crm_permissions')
    .select('user_id, can_view, can_import, can_enrich, can_delete')
  const permMap = new Map((perms ?? []).map((p) => [p.user_id, p]))

  const users = (profiles ?? []).map((p) => {
    const isAdmin = p.role === 'admin' || p.role === 'super_admin'
    const row = permMap.get(p.id)
    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      // admin/super_admin : toutes permissions, non modifiables
      locked: isAdmin,
      can_view: isAdmin ? true : row?.can_view ?? true,
      can_import: isAdmin ? true : row?.can_import ?? true,
      can_enrich: isAdmin ? true : row?.can_enrich ?? false,
      can_delete: isAdmin ? true : row?.can_delete ?? false,
    }
  })

  return NextResponse.json({ data: users })
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: guard.status })

  const body = await req.json().catch(() => null)
  const userId = body?.user_id
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  }

  const admin = getAdminClient()
  // On ne gère les permissions fines que pour les 'commercial'.
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile || !CRM_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'utilisateur hors périmètre CRM' }, { status: 400 })
  }
  if (profile.role !== 'commercial') {
    return NextResponse.json(
      { error: 'permissions admin/super_admin non modifiables (toujours complètes)' },
      { status: 400 },
    )
  }

  const row = {
    user_id: userId,
    can_view: Boolean(body.can_view),
    can_import: Boolean(body.can_import),
    can_enrich: Boolean(body.can_enrich),
    can_delete: Boolean(body.can_delete),
    updated_by: guard.user.id,
  }
  const { error } = await admin.from('crm_permissions').upsert(row, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: row })
}
