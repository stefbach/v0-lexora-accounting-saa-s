// =============================================================================
// lib/crm/auth.ts — Gate d'accès au module CRM Prospection
// =============================================================================

import { createClient } from '@/lib/supabase/server'

export const CRM_ALLOWED_ROLES = ['admin', 'super_admin', 'commercial'] as const
export type CrmRole = typeof CRM_ALLOWED_ROLES[number]

export interface CrmAuthOk {
  ok: true
  user: { id: string; email: string | null }
  role: CrmRole
}

export interface CrmAuthErr {
  ok: false
  status: number
  reason: string
}

export type CrmAuthResult = CrmAuthOk | CrmAuthErr

/**
 * Vérifie qu'un utilisateur connecté a le droit d'accéder au CRM Lexora.
 * À utiliser en début de chaque handler /api/crm/* (hors /internal/* qui passe par HMAC).
 */
export async function requireCrmAccess(): Promise<CrmAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, reason: 'unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role
  if (!role || !CRM_ALLOWED_ROLES.includes(role as CrmRole)) {
    return { ok: false, status: 403, reason: 'role_not_allowed' }
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email ?? null },
    role: role as CrmRole,
  }
}
