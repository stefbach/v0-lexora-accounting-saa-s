/**
 * Sprint 5 BUG A — Utilitaires période YYYY-MM.
 *
 * Centralise le calcul du dernier jour du mois pour éviter les erreurs
 * PostgreSQL "date/time field value out of range: 2026-04-31" causées par
 * des requêtes .lte('periode', `${periode}-31`) sur des mois à 28/29/30
 * jours (avril, juin, septembre, novembre + février).
 *
 * La technique `new Date(year, monthIndex1Based, 0)` donne le dernier jour
 * du mois `monthIndex1Based - 1`, autrement dit : en passant le numéro de
 * mois 1-indexé, on récupère directement la dernière date du mois souhaité.
 *
 * Exemples :
 *   lastDayOfMonth("2026-04") → "2026-04-30"
 *   lastDayOfMonth("2026-02") → "2026-02-28"
 *   lastDayOfMonth("2028-02") → "2028-02-29" (bissextile)
 *   lastDayOfMonth("2026-12") → "2026-12-31"
 */
export function lastDayOfMonth(periodeStr: string): string {
  // Accepte "YYYY-MM" ou "YYYY-MM-DD" (ignore le jour)
  const trimmed = periodeStr.slice(0, 7)
  const [y, m] = trimmed.split('-').map(n => parseInt(n, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    // Fallback défensif : si le format est invalide on retourne "-28" pour
    // ne jamais provoquer "out of range". La plupart des mois ont >= 28.
    return `${trimmed}-28`
  }
  const last = new Date(y, m, 0).getDate() // month 1-indexé, jour 0 = dernier du mois-1
  return `${trimmed}-${String(last).padStart(2, '0')}`
}

/**
 * Premier jour de la période au format ISO — équivalent à `${periode}-01`
 * mais typé et tolérant aux inputs déjà au format YYYY-MM-DD.
 */
export function firstDayOfMonth(periodeStr: string): string {
  return `${periodeStr.slice(0, 7)}-01`
}

/**
 * Retourne [first, last] au format ISO YYYY-MM-DD.
 */
export function monthRange(periodeStr: string): [string, string] {
  return [firstDayOfMonth(periodeStr), lastDayOfMonth(periodeStr)]
}
