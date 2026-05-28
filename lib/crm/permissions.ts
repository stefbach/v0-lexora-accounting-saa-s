// =============================================================================
// lib/crm/permissions.ts — Permissions fines par action pour le CRM
// =============================================================================
// S'appuie sur requireCrmAccess (rôle admin/super_admin/commercial), puis
// applique un contrôle FIN par action lu dans la table crm_permissions
// (migration 442). admin/super_admin ont toujours toutes les permissions.
//
// Tolérant : si la table n'existe pas encore (migration non appliquée), on
// retombe sur les défauts par rôle plutôt que de planter l'app.
// =============================================================================

import { createClient } from '@/lib/supabase/server'
import { requireCrmAccess, type CrmRole } from './auth'

export type CrmAction = 'view' | 'import' | 'enrich' | 'delete'

export interface CrmPermissions {
  can_view: boolean
  can_import: boolean
  can_enrich: boolean
  can_delete: boolean
}

const FULL: CrmPermissions = { can_view: true, can_import: true, can_enrich: true, can_delete: true }
const NONE: CrmPermissions = { can_view: false, can_import: false, can_enrich: false, can_delete: false }

// Défaut pour un 'commercial' sans config explicite : consultation + import,
// mais pas d'enrichissement (coûteux) ni de suppression (destructif).
const COMMERCIAL_DEFAULT: CrmPermissions = {
  can_view: true,
  can_import: true,
  can_enrich: false,
  can_delete: false,
}

export interface CrmPermissionOk {
  ok: true
  user: { id: string; email: string | null }
  role: CrmRole
  perms: CrmPermissions
}
export interface CrmPermissionErr {
  ok: false
  status: number
  reason: string
}
export type CrmPermissionResult = CrmPermissionOk | CrmPermissionErr

/**
 * Résout les permissions effectives de l'utilisateur courant.
 */
export async function getCrmPermissions(): Promise<CrmPermissionResult> {
  const auth = await requireCrmAccess()
  if (!auth.ok) return { ok: false, status: auth.status, reason: auth.reason }

  if (auth.role === 'admin' || auth.role === 'super_admin') {
    return { ok: true, user: auth.user, role: auth.role, perms: FULL }
  }

  // 'commercial' : lire la config fine
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_permissions')
    .select('can_view, can_import, can_enrich, can_delete')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error || !data) {
    return { ok: true, user: auth.user, role: auth.role, perms: COMMERCIAL_DEFAULT }
  }
  return { ok: true, user: auth.user, role: auth.role, perms: data as CrmPermissions }
}

/**
 * Garde d'action : à utiliser en début de handler.
 * Renvoie ok:false (403) si l'utilisateur n'a pas le droit pour l'action.
 */
export async function requireCrmPermission(action: CrmAction): Promise<CrmPermissionResult> {
  const res = await getCrmPermissions()
  if (!res.ok) return res
  const key = `can_${action}` as keyof CrmPermissions
  if (!res.perms[key]) {
    return { ok: false, status: 403, reason: `permission_denied:${action}` }
  }
  return res
}

export { NONE as CRM_PERMS_NONE }
