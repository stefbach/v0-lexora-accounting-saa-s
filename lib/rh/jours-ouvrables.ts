/**
 * F13 — Helper canonique pour compter les jours ouvrables d'une plage.
 *
 * Source de vérité :
 *   - Côté TS pur : `calculateWorkingDays()` dans lib/rh/calculateWorkingDays.ts
 *     (utilisé depuis longtemps par les routes API + le batch paie).
 *   - Côté SQL : `count_jours_ouvrables()` (migration 165).
 *
 * Ce fichier fournit 2 wrappers pour éviter la duplication de logique dans
 * les consommateurs :
 *
 *   1. `countJoursOuvrablesSync()` — pure JS, utilisable CÔTÉ CLIENT
 *      (modals de création de demande) comme CÔTÉ SERVEUR. Utilise le
 *      fallback hardcoded des jours fériés Maurice si `joursFeries` n'est
 *      pas fourni. C'est ce que doit appeler le modal pour aligner
 *      l'aperçu sur le calcul final du backend.
 *
 *   2. `countJoursOuvrablesDb()` — async, SERVEUR uniquement. Charge les
 *      jours_feries de la société depuis la DB (avec filtre
 *      travail_autorise=false) et les passe à calculateWorkingDays.
 *      C'est ce qu'utilise la création de demande côté API
 *      (computeNbJoursForEmploye).
 *
 * IMPORTANT : un férié défini par la société (societe_id != NULL) prime
 * sur le fallback hardcoded. Côté client, il y a une très légère
 * divergence possible pour une société qui a un férié custom non présent
 * dans le fallback MU ; dans 99% des cas modal et backend convergent.
 */
import {
  calculateWorkingDays,
  getMauritiusPublicHolidays,
  type WorkingDays,
  DEFAULT_WORKING_DAYS,
} from './calculateWorkingDays'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface JoursOuvrablesParams {
  date_debut: string | Date
  date_fin: string | Date
  demi_journee?: boolean
  working_days?: WorkingDays
  /**
   * Jours fériés pré-chargés. Si absent côté client, fallback hardcoded
   * Maurice (getMauritiusPublicHolidays) sera utilisé automatiquement.
   */
  jours_feries?: Iterable<string | Date>
}

/**
 * Wrapper sync (pure JS) — utilisable côté client (modal) comme côté
 * serveur. Retourne 0 si date_fin < date_debut. Applique la règle
 * demi-journée (-0.5) en fin de calcul.
 */
export function countJoursOuvrablesSync(params: JoursOuvrablesParams): number {
  const base = calculateWorkingDays(params.date_debut, params.date_fin, {
    workingDays: params.working_days ?? DEFAULT_WORKING_DAYS,
    joursFeries: params.jours_feries,
  })
  if (params.demi_journee) return Math.max(0, base - 0.5)
  return base
}

/**
 * Wrapper async serveur — fetch les jours_feries de la société pour
 * l'année (ou les années) couverte(s) et appelle calculateWorkingDays.
 * Filtre les fériés `travail_autorise=true` (jours fériés travaillés).
 */
export async function countJoursOuvrablesDb(
  supabase: SupabaseLike,
  params: JoursOuvrablesParams & { societe_id?: string | null },
): Promise<number> {
  const debut = String(params.date_debut).slice(0, 10)
  const fin = String(params.date_fin).slice(0, 10)
  if (!debut || !fin || fin < debut) return 0

  const startYear = parseInt(debut.slice(0, 4), 10)
  const endYear = parseInt(fin.slice(0, 4), 10)

  const holidays = new Set<string>()
  try {
    let query = supabase
      .from('jours_feries')
      .select('date, societe_id, travail_autorise')
      .gte('date', `${startYear}-01-01`)
      .lte('date', `${endYear}-12-31`)
    const { data } = await query
    interface JourFerieRow { date: string; societe_id: string | null; travail_autorise: boolean | null }
    for (const r of (data || []) as JourFerieRow[]) {
      if (r.travail_autorise === true) continue
      // Férié soit national (societe_id NULL) soit spécifique à la société
      if (!r.societe_id || r.societe_id === params.societe_id) {
        holidays.add(String(r.date).slice(0, 10))
      }
    }
  } catch {
    // Fallback : set hardcodé MU si DB indisponible
    for (let y = startYear; y <= endYear; y++) {
      for (const h of getMauritiusPublicHolidays(y)) holidays.add(h)
    }
  }

  return countJoursOuvrablesSync({
    ...params,
    jours_feries: holidays,
  })
}

/**
 * Helper utilitaire pour UI modals : pré-charge les fériés MU d'une
 * année via fetch (endpoint /api/rh/jours-feries) et retourne un Set
 * exploitable par countJoursOuvrablesSync.
 *
 * Client uniquement (utilise fetch). Typé `string[]` en entrée pour
 * rester compatible avec une liste déjà chargée par l'appelant.
 */
export function buildJoursFeriesSet(dates: string[] | Date[]): Set<string> {
  const s = new Set<string>()
  for (const d of dates as Array<string | Date>) {
    if (d instanceof Date) s.add(d.toISOString().slice(0, 10))
    else if (typeof d === 'string') s.add(d.slice(0, 10))
  }
  return s
}
