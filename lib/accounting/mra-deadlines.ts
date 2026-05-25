/**
 * MRA deadlines (Income Tax Act 1995)
 *
 * Calcul des dates limites de dépôt des déclarations MRA selon la loi
 * mauricienne. Centralisé ici pour éviter les hardcodes par route
 * (cf. audit Wave 2-D, problème 3 : `${endYear}-12-30` était faux pour
 * tous les exercices non juin-juin — GBC ferment souvent au 31/12,
 * d'autres au 31/03, etc.).
 */

/**
 * Calcule la date limite de dépôt de la déclaration CIT (Corporate
 * Income Tax) selon l'ITA s.116(1) :
 *
 *   « A company shall furnish a return not later than 6 months from
 *     the end of the month in which its accounting period ends. »
 *
 * Exemples (cf. tests) :
 *   - Clôture 30/06/2025 → due le 31/12/2025
 *   - Clôture 31/12/2025 → due le 30/06/2026
 *   - Clôture 31/03/2025 → due le 30/09/2025
 *
 * @param dateFinExercice Date de fin d'exercice (Date ou ISO string).
 * @returns Date limite (dernier jour du 6ème mois après le mois de
 *          clôture).
 */
export function computeCitDeadline(dateFinExercice: Date | string): Date {
  const d = typeof dateFinExercice === 'string'
    ? new Date(dateFinExercice)
    : new Date(dateFinExercice.getTime())
  if (Number.isNaN(d.getTime())) {
    throw new Error(`computeCitDeadline: date invalide (${String(dateFinExercice)})`)
  }
  // Dernier jour du mois de clôture (jour 0 du mois suivant).
  const endOfClosingMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  // + 6 mois → dernier jour du 6ème mois après la clôture
  // (M+1+6 = M+7, jour 0 → dernier jour de M+6).
  return new Date(
    endOfClosingMonth.getFullYear(),
    endOfClosingMonth.getMonth() + 7,
    0
  )
}

/**
 * Variante string-only (YYYY-MM-DD) pratique pour les routes API qui
 * stockent `cit_returns.date_limite` en DATE.
 *
 * @param exercice          Ex : "2024-2025" — utilisé en fallback si
 *                          `dateFinExercice` n'est pas renseigné sur la
 *                          société (suppose clôture 30/06 de endYear).
 * @param dateFinExercice   Valeur de `societes.date_fin_exercice` (mig
 *                          006) — ex "2025-06-30". Peut être null.
 * @returns                 Date ISO "YYYY-MM-DD".
 */
export function computeCitDeadlineISO(
  exercice: string,
  dateFinExercice: string | null | undefined
): string {
  let closing: Date
  if (dateFinExercice) {
    closing = new Date(dateFinExercice)
  } else {
    // Fallback : exercice juillet-juin classique, clôture 30 juin de endYear.
    const parts = exercice.split('-')
    const endYear = parts[1] || parts[0]
    closing = new Date(`${endYear}-06-30`)
  }
  if (Number.isNaN(closing.getTime())) {
    // Dernier recours : on retombe sur 30/12 de endYear plutôt que de
    // crasher l'API (préserve l'ancien comportement en cas de données
    // corrompues).
    const endYear = exercice.split('-')[1] || exercice.split('-')[0]
    return `${endYear}-12-30`
  }
  return computeCitDeadline(closing).toISOString().slice(0, 10)
}
