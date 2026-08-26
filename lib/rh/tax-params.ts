/**
 * Résolution VERSIONNÉE des paramètres fiscaux/sociaux (parametres_paie_mra).
 *
 * Source de vérité unique des taux MRA (CSG/NSF/PRGF/Training Levy/PAYE/CIT),
 * versionnée par exercice (dates d'effet — migration 498) avec repli sur l'année.
 * Pur et testé ; à brancher progressivement à la place des lookups « annee desc ».
 */

export interface DatedParamsRow {
  annee: number | null
  actif?: boolean | null
  date_debut?: string | null // YYYY-MM-DD
  date_fin?: string | null   // YYYY-MM-DD (null = encore en vigueur)
  [k: string]: unknown
}

export interface ParamsRef {
  /** Date d'application (YYYY-MM-DD) — prioritaire. */
  date?: string
  /** Année civile applicable (fallback). */
  annee?: number
}

/**
 * Ligne applicable pour une date (ou une année) :
 *   1) plage d'effet [date_debut, date_fin] contenant `date` (la plus récente) ;
 *   2) sinon l'année ≤ année demandée la plus récente ;
 *   3) sinon la ligne active la plus récente, sinon la plus récente tout court.
 * `null` si la liste est vide.
 */
export function resolveParamsRow<T extends DatedParamsRow>(rows: T[], ref: ParamsRef): T | null {
  if (!rows || rows.length === 0) return null
  const date = ref.date || null
  const annee = ref.annee ?? (date ? Number(date.slice(0, 4)) : undefined)

  if (date) {
    const inRange = rows
      .filter((r) => r.date_debut && r.date_debut <= date && (!r.date_fin || r.date_fin >= date))
      .sort((a, b) => (b.date_debut || '').localeCompare(a.date_debut || ''))
    if (inRange.length) return inRange[0]
  }

  if (annee != null && Number.isFinite(annee)) {
    const leq = rows
      .filter((r) => r.annee != null && (r.annee as number) <= annee)
      .sort((a, b) => (b.annee as number) - (a.annee as number))
    if (leq.length) return leq[0]
  }

  const active = rows.filter((r) => r.actif).sort((a, b) => (b.annee || 0) - (a.annee || 0))
  if (active.length) return active[0]
  return [...rows].sort((a, b) => (b.annee || 0) - (a.annee || 0))[0]
}
