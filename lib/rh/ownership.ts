/**
 * Helpers d'autorisation pour les endpoints RH (pointage, planning,
 * congés, etc.).
 *
 * Trois niveaux d'accès :
 *
 *  1. **RH/Admin** (RH_ROLES) — accès complet à tous les employés de
 *     toutes les sociétés auxquelles l'utilisateur a accès.
 *
 *  2. **Manager / Team Leader** (MANAGER_ROLES) — accès aux employés
 *     de leur groupe (`profiles.groupe_gere_id` correspond à
 *     `employes.groupe_id`). Peuvent ajouter/modifier pointages et
 *     plannings de leur équipe, mais pas hors groupe.
 *
 *  3. **Employé** — accès uniquement à ses propres données
 *     (auto-pointage, consultation de son planning).
 *
 * Le team_leader est volontairement traité comme un manager (même
 * scope, mêmes droits) — séparation purement RH/hiérarchique.
 */

const RH_ROLES = ['admin', 'super_admin', 'rh', 'rh_manager', 'direction', 'client_admin']
const MANAGER_ROLES = ['manager', 'team_leader']

export interface Ownership {
  /** Rôle RH/Admin avec accès complet (pas de scope groupe) */
  isRH: boolean
  /** Manager ou Team Leader scopé à un groupe */
  isManagerScoped: boolean
  /** ID employé de l'utilisateur connecté (si lui-même salarié) */
  employe_id: string | null
  /** ID du groupe géré (pour manager/team_leader scoped) */
  groupe_gere_id: string | null
  /** Rôle brut du profil */
  role: string
}

export async function resolveOwnership(
  supabase: any,
  userId: string,
): Promise<Ownership> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('employe_id, role, groupe_gere_id')
    .eq('id', userId)
    .maybeSingle()

  const role = (profile as any)?.role || ''
  const isRH = RH_ROLES.includes(role)
  const groupe_gere_id = (profile as any)?.groupe_gere_id || null
  const isManagerScoped = MANAGER_ROLES.includes(role) && !!groupe_gere_id

  let employe_id = (profile as any)?.employe_id || null
  if (!employe_id) {
    const { data: emp } = await supabase
      .from('employes')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle()
    employe_id = (emp as any)?.id || null
  }

  return { isRH, isManagerScoped, employe_id, groupe_gere_id, role }
}

/**
 * Vérifie qu'un utilisateur peut modifier (créer/éditer/supprimer)
 * les données d'un employé donné. À utiliser dans tous les POST/PATCH
 * /DELETE pointage / planning / congés.
 *
 *  - RH/Admin → toujours autorisé
 *  - Manager/Team Leader → autorisé si l'employé est dans son groupe
 *  - Employé → autorisé uniquement pour lui-même
 */
export async function canManageEmploye(
  supabase: any,
  ownership: Ownership,
  employe_id: string,
): Promise<boolean> {
  if (ownership.isRH) return true
  // Manager / Team Leader scopé : doit appartenir au même groupe.
  if (ownership.isManagerScoped && ownership.groupe_gere_id) {
    const { data: emp } = await supabase
      .from('employes')
      .select('groupe_id')
      .eq('id', employe_id)
      .maybeSingle()
    return (emp as any)?.groupe_id === ownership.groupe_gere_id
  }
  // Sinon : accès uniquement à soi-même.
  return ownership.employe_id !== null && ownership.employe_id === employe_id
}

/** Liste des rôles RH (rétro-compat pour les imports historiques). */
export { RH_ROLES, MANAGER_ROLES }
