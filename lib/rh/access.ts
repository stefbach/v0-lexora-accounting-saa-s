/**
 * Multi-tenant access control — vérifie qu'un user a accès à une société
 * À utiliser dans CHAQUE API qui manipule des données scopées par société
 */
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Retourne les IDs des sociétés accessibles par un utilisateur
 * - admin/super_admin : toutes les sociétés
 * - client_admin/client_user : sociétés via dossiers + user_societes + created_by
 * - rh/manager/comptable : sociétés via profiles.societe_id + user_societes
 */
export async function getUserSocieteIds(userId: string): Promise<string[]> {
  const supabase = getAdminClient()

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, societe_id, client_id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return []

  // Admin/super_admin: all sociétés
  if (['admin', 'super_admin'].includes(profile.role)) {
    const { data: all } = await supabase.from('societes').select('id')
    return (all || []).map(s => s.id)
  }

  const ids = new Set<string>()

  // 1. Direct societe_id on profile
  if (profile.societe_id) ids.add(profile.societe_id)

  // 2. Via client_id (all sociétés of the same client)
  if (profile.client_id) {
    const { data: clientSocietes } = await supabase
      .from('societes')
      .select('id')
      .eq('client_id', profile.client_id)
    for (const s of clientSocietes || []) ids.add(s.id)
  }

  // 3. Via dossiers
  const { data: dossiers } = await supabase
    .from('dossiers')
    .select('societe_id')
    .eq('client_id', userId)
  for (const d of dossiers || []) if (d.societe_id) ids.add(d.societe_id)

  // 4. Via user_societes
  const { data: userSocietes } = await supabase
    .from('user_societes')
    .select('societe_id')
    .eq('user_id', userId)
  for (const us of userSocietes || []) if (us.societe_id) ids.add(us.societe_id)

  // 5. Via created_by (sociétés créées par ce user)
  const { data: ownedSocietes } = await supabase
    .from('societes')
    .select('id')
    .eq('created_by', userId)
  for (const s of ownedSocietes || []) ids.add(s.id)

  return [...ids]
}

/**
 * Vérifie qu'un user a accès à une société spécifique
 */
export async function userHasAccessToSociete(userId: string, societeId: string): Promise<boolean> {
  const ids = await getUserSocieteIds(userId)
  return ids.includes(societeId)
}

/**
 * Vérifie qu'un employé appartient à une société accessible par le user
 */
export async function userHasAccessToEmploye(userId: string, employeId: string): Promise<boolean> {
  const supabase = getAdminClient()
  const { data: emp } = await supabase
    .from('employes')
    .select('societe_id')
    .eq('id', employeId)
    .maybeSingle()
  if (!emp?.societe_id) return false
  return userHasAccessToSociete(userId, emp.societe_id)
}

/**
 * Retourne les IDs des employés accessibles par un user (pour une société donnée ou toutes)
 */
export async function getAccessibleEmployeIds(userId: string, societeId?: string): Promise<string[]> {
  const supabase = getAdminClient()
  const societeIds = societeId ? [societeId] : await getUserSocieteIds(userId)
  if (societeIds.length === 0) return []

  const { data: emps } = await supabase
    .from('employes')
    .select('id')
    .in('societe_id', societeIds)
  return (emps || []).map(e => e.id)
}
