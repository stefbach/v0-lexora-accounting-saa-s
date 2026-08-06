/**
 * Normalisation des identifiants UUID venant du client.
 *
 * Les composants <Select> (Radix) refusent une valeur vide : le codebase
 * utilise donc partout la sentinelle "none" pour l'option « aucun ». Si cette
 * sentinelle n'est pas retirée avant l'appel API, Postgres rejette l'insert
 * avec `invalid input syntax for type uuid: "none"` — l'utilisateur voit une
 * erreur SQL brute et perd sa saisie.
 *
 * Règle : toute colonne uuid nullable alimentée par un formulaire passe par
 * `cleanUuid()` côté route API ; les colonnes uuid obligatoires se valident
 * avec `isUuid()` pour renvoyer un 400 explicite.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sentinelles « valeur absente » émises par les <Select> et le localStorage legacy. */
const EMPTY_SENTINELS = new Set(['', 'none', 'null', 'undefined', 'aucun', 'n/a'])

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

/**
 * Renvoie l'uuid si la valeur en est un, `null` sinon (sentinelle, chaîne
 * vide, type inattendu ou format invalide). Destiné aux colonnes nullables :
 * un lien optionnel mal formé doit se traduire par « pas de lien », jamais par
 * un crash SQL.
 */
export function cleanUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (EMPTY_SENTINELS.has(trimmed.toLowerCase())) return null
  return UUID_RE.test(trimmed) ? trimmed : null
}

/**
 * Applique `cleanUuid` aux clés présentes dans `payload`. Les clés absentes ne
 * sont pas ajoutées : indispensable pour un PATCH partiel, où introduire une
 * clé à `null` écraserait une valeur existante en base.
 */
export function cleanUuidFields<T extends Record<string, unknown>>(
  payload: T,
  keys: readonly string[],
): T {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      ;(payload as Record<string, unknown>)[key] = cleanUuid(payload[key])
    }
  }
  return payload
}
