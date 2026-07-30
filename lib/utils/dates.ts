/**
 * Helpers de dates « calendaires » (YYYY-MM-DD) pour les formulaires.
 *
 * Contexte du bug corrigé : `new Date(d).toISOString()` lève un
 * `RangeError: Invalid time value` dès que `d` est vide ou malformé. Sur
 * /client/nouvelle-facture, vider le champ « Date de facture » suffisait à
 * faire planter tout le formulaire au premier changement de <Select>
 * (échéance, client, modèle) — l'erreur remontait jusqu'au boundary React et
 * la page devenait inutilisable.
 *
 * Toutes les fonctions ici sont donc totales : elles renvoient `""` plutôt
 * que de lever. L'arithmétique se fait en UTC pour rester déterministe quel
 * que soit le fuseau du navigateur (Maurice = UTC+4).
 */

/** Date du jour dans le calendrier LOCAL de l'utilisateur, format YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Normalise vers YYYY-MM-DD. Accepte un `Date`, une date déjà normalisée, ou
 * un timestamp Postgres (`2026-07-30T00:00:00+04:00`) — la partie date est
 * alors prise telle quelle, sans conversion de fuseau, pour ne pas décaler
 * d'un jour une date métier. Renvoie `""` si la valeur est vide ou invalide.
 */
export function toISODate(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

/**
 * Ajoute `days` jours à une date calendaire. Une date vide/invalide retombe
 * sur aujourd'hui au lieu de lever — un champ vidé ne doit jamais casser la
 * page.
 */
export function addDaysISO(value: unknown, days: number): string {
  const base = toISODate(value) || todayISO()
  const n = Number(days)
  // `base` est toujours parsable ici : soit une date canonique validée par
  // toISODate, soit todayISO(). Un jour hors bornes (31 février) est reporté
  // par JS sur le mois suivant, comportement standard et sans risque.
  const dt = new Date(`${base}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + (Number.isFinite(n) ? Math.trunc(n) : 0))
  return dt.toISOString().slice(0, 10)
}
