/**
 * SEC-001 — Hiérarchie des rôles Lexora.
 *
 * Un acteur ne peut gérer (reset mot de passe, changement de rôle,
 * update auth.admin.updateUserById, …) qu'un compte de niveau
 * STRICTEMENT inférieur au sien. Rôle inconnu = refus sûr.
 *
 * Ce mapping est la source de vérité unique — même hiérarchie que le
 * hotfix SEC-001 historique de app/api/admin/users/[id]/password.
 */
export const ROLE_LEVEL: Record<string, number> = {
  employe: 10, salarie: 10,
  manager: 30, team_leader: 30,
  client_user: 30, client_assistant: 30,
  rh: 50, rh_manager: 50,
  comptable: 50, comptable_dedie: 50, juridique: 50,
  direction: 70, client_admin: 70,
  admin: 90,
  super_admin: 100,
}

/**
 * true seulement si le rôle acteur est CONNU et de niveau strictement
 * supérieur au rôle cible. Tout rôle inconnu (acteur ou cible, y compris
 * null/undefined/'' issu d'un profile manquant) ⇒ false (refus sûr).
 */
export function canManageRole(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  const actorLevel = actorRole ? ROLE_LEVEL[actorRole] : undefined
  if (actorLevel === undefined) return false
  const targetLevel = targetRole ? ROLE_LEVEL[targetRole] : undefined
  if (targetLevel === undefined) return false
  return actorLevel > targetLevel
}
