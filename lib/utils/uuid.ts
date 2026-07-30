/**
 * Garde-fous UUID partagés front/back.
 *
 * Contexte du bug corrigé : les <Select> Radix interdisent `value=""`, donc
 * l'UI utilise des sentinelles textuelles ("none", "manual", "all"…) pour
 * représenter « aucune sélection ». Quand une de ces sentinelles atteignait
 * une colonne `uuid` de Postgres, la requête échouait en 500 avec
 * `invalid input syntax for type uuid: "none"` — message brut affiché tel
 * quel à l'utilisateur sur /client/nouvelle-facture.
 *
 * `asUuid` normalise donc toute valeur non-uuid en `null` (= colonne vide),
 * ce qui est la sémantique attendue pour une sentinelle « aucun ».
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Vrai si la valeur est un UUID canonique (avec tirets, casse indifférente). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

/** Renvoie l'UUID normalisé, ou `null` pour toute autre valeur (sentinelle, vide, undefined). */
export function asUuid(value: unknown): string | null {
  return isUuid(value) ? (value as string).trim() : null
}
