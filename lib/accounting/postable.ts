/**
 * Règle « compte mouvementable » (postable) du PCM maître — pure et testée.
 *
 * Un compte de REGROUPEMENT (parent qui a des sous-comptes actifs) n'accepte pas
 * d'écriture directe : on poste sur ses sous-comptes détail. MAIS un compte
 * COLLECTIF déjà mouvementé (401 Fournisseurs, 411 Clients, 512 Banque…) reste
 * postable même s'il a des sous-comptes — on ne rend jamais non-postable un
 * compte qui porte déjà des écritures (pas de blocage rétroactif).
 *
 * Miroir applicatif du backfill SQL (migration 497) : à utiliser à la création /
 * modification d'un compte pour fixer `postable` de façon cohérente.
 */

export interface PostableInput {
  /** Le compte a au moins un sous-compte actif (compte_parent = ce compte). */
  hasActiveChildren: boolean
  /** Au moins une écriture porte déjà ce numéro de compte. */
  hasEcritures: boolean
}

/**
 * `false` uniquement si le compte est un parent (a des sous-comptes) ET n'a
 * aucune écriture. Sinon `true` (comptes détail et comptes collectifs mouvementés).
 */
export function isPostableAccount({ hasActiveChildren, hasEcritures }: PostableInput): boolean {
  if (hasActiveChildren && !hasEcritures) return false
  return true
}
