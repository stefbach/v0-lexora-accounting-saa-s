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

  // 3. Via dossiers (client_id = userId)
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

  // 6. Via comptable_societes (for comptable/comptable_dedie roles)
  if (['comptable', 'comptable_dedie'].includes(profile.role)) {
    const { data: comptableSocietes } = await supabase
      .from('comptable_societes')
      .select('societe_id')
      .eq('comptable_id', userId)
    for (const cs of comptableSocietes || []) if (cs.societe_id) ids.add(cs.societe_id)
  }

  // 7. Fallback for client_admin/client_user: check clients table → get all sociétés for that client
  if (ids.size === 0 && ['client_admin', 'client_user', 'rh', 'rh_manager'].includes(profile.role)) {
    // Try to find client via profiles → clients relationship
    const { data: clientLinks } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
    for (const cl of clientLinks || []) {
      const { data: clSocietes } = await supabase
        .from('societes')
        .select('id')
        .eq('client_id', cl.id)
      for (const s of clSocietes || []) ids.add(s.id)
    }
  }

  // 8. Pas de fallback "tout-accès" — un user sans aucun lien explicite
  //    (profile.societe_id, user_societes, dossiers, comptable_societes,
  //    societes.client_id/created_by/comptable_id) ne doit RIEN voir.
  //    L'ancien fallback retournait toutes les sociétés pour les rôles
  //    client_admin/rh/comptable si vide → faille P0 (privilege escalation
  //    silencieuse à la création d'un compte avant assignation).
  //    Si nécessaire, l'admin doit explicitement assigner via user_societes
  //    ou via la fiche du dossier/société.

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
  // F5-bis — bypass self-service : si l'user courant EST l'employé
  // (lien via auth_user_id ou email), autoriser systématiquement.
  // Avant ce fix, un employé avec rôle 'salarie' recevait 403 sur
  // /api/rh/paie?employe_id=<self> car userHasAccessToSociete() ne
  // reconnaissait pas son propre rôle comme ayant accès à sa société.
  const { data: emp } = await supabase
    .from('employes')
    .select('societe_id, auth_user_id, email')
    .eq('id', employeId)
    .maybeSingle()
  if (!emp?.societe_id) return false
  if (emp.auth_user_id && emp.auth_user_id === userId) return true
  if (emp.email) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    if (authUser?.user?.email && authUser.user.email.toLowerCase() === String(emp.email).toLowerCase()) {
      return true
    }
  }
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
