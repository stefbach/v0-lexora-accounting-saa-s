// ============================================================
// lib/fiscal-years.ts — Gestion centralisée des années / exercices
// ============================================================
// Année fiscale mauricienne : 1er juillet → 30 juin.
// Exercice "2025-2026" = 2025-07-01 … 2026-06-30.
//
// Ce module remplace les tableaux d'années codés en dur disséminés dans
// l'UI (ex. `["2023","2024","2025","2026","2027"]`) qui bloquaient l'accès
// à l'historique ancien et au futur au-delà d'une année figée. Toutes les
// listes sont désormais générées dynamiquement autour de la date courante.

/** Exercice fiscal courant au format "YYYY-YYYY" (juillet → juin). */
export function getCurrentExercice(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 7) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

/** Année fiscale de début (entier) de l'exercice courant. */
export function getCurrentFiscalStartYear(now: Date = new Date()): number {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 7 ? year : year - 1
}

/**
 * Liste d'exercices fiscaux "YYYY-YYYY" autour de l'exercice courant.
 * @param back  nombre d'exercices passés à inclure (défaut 5)
 * @param forward nombre d'exercices futurs à inclure (défaut 1)
 * Ordre décroissant (le plus récent d'abord).
 */
export function getAvailableExercices(back = 5, forward = 1, now: Date = new Date()): string[] {
  const start = getCurrentFiscalStartYear(now)
  const list: string[] = []
  for (let i = forward; i >= -back; i--) {
    const s = start + i
    list.push(`${s}-${s + 1}`)
  }
  return list
}

/** Variante préfixée "FY2025-2026" utilisée par certains écrans paie/MRA. */
export function getAvailableExercicesFY(back = 4, forward = 1, now: Date = new Date()): string[] {
  return getAvailableExercices(back, forward, now).map((e) => `FY${e}`)
}

/**
 * Liste d'années civiles (nombres) autour de l'année courante.
 * @param back nombre d'années passées (défaut 3)
 * @param forward nombre d'années futures (défaut 1)
 * Ordre décroissant.
 */
export function getAvailableYears(back = 3, forward = 1, now: Date = new Date()): number[] {
  const current = now.getFullYear()
  const list: number[] = []
  for (let i = forward; i >= -back; i--) list.push(current + i)
  return list
}

/** Parse un exercice "YYYY-YYYY" (ou "FYYYYY-YYYY") en bornes de dates. */
export function parseExerciceDates(exercice: string): { debut: string; fin: string } | null {
  const match = exercice.replace(/^FY/i, '').match(/^(\d{4})-(\d{4})$/)
  if (!match) return null
  return { debut: `${match[1]}-07-01`, fin: `${match[2]}-06-30` }
}

/** Exercice précédent "YYYY-YYYY". */
export function getPreviousExercice(exercice: string, now: Date = new Date()): string {
  const match = exercice.replace(/^FY/i, '').match(/^(\d{4})-(\d{4})$/)
  if (!match) {
    const s = getCurrentFiscalStartYear(now)
    return `${s - 1}-${s}`
  }
  const startYear = parseInt(match[1])
  return `${startYear - 1}-${startYear}`
}
