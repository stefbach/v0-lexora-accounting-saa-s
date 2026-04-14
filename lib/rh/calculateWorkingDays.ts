/**
 * Shared working-days calculator for the RH Congés & Paie modules.
 *
 * Replaces the two duplicated `countWorkingDays` helpers that used to live
 * inside app/api/rh/conges/route.ts and app/api/rh/depart/route.ts.
 *
 * Key improvements over the previous in-file versions:
 *   - Respects each employee's `working_days` pattern (JSONB on employes)
 *     instead of assuming Mon–Fri for everyone.
 *   - Accepts an arbitrary list of public holidays so callers can pass
 *     rows fetched from the `jours_feries` DB table (previously the list
 *     was hardcoded inside conges/route.ts and ignored entirely in
 *     depart/route.ts).
 *   - Pure / stateless: no DB access, no side effects. Callers own the
 *     fetch of working_days + jours_feries, which keeps this utility
 *     trivially unit-testable.
 *
 * Day-of-week mapping (JS Date.getDay):
 *   0 = sun, 1 = mon, 2 = tue, 3 = wed, 4 = thu, 5 = fri, 6 = sat
 */

export type WorkingDays = {
  mon: boolean
  tue: boolean
  wed: boolean
  thu: boolean
  fri: boolean
  sat: boolean
  sun: boolean
}

/** Mon–Fri — the default when an employee has no `working_days` JSONB set. */
export const DEFAULT_WORKING_DAYS: WorkingDays = {
  mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
}

/**
 * Normalise a value read from `employes.working_days` (which may be null,
 * a partial object, or the full shape) into a complete WorkingDays record.
 * Anything missing falls back to the Mon–Fri default on that specific day,
 * so legacy employees keep their previous behaviour.
 */
export function getWorkingDaysForEmploye(emp: { working_days?: any } | null | undefined): WorkingDays {
  const wd = emp?.working_days
  if (!wd || typeof wd !== 'object') return { ...DEFAULT_WORKING_DAYS }
  return {
    mon: typeof wd.mon === 'boolean' ? wd.mon : DEFAULT_WORKING_DAYS.mon,
    tue: typeof wd.tue === 'boolean' ? wd.tue : DEFAULT_WORKING_DAYS.tue,
    wed: typeof wd.wed === 'boolean' ? wd.wed : DEFAULT_WORKING_DAYS.wed,
    thu: typeof wd.thu === 'boolean' ? wd.thu : DEFAULT_WORKING_DAYS.thu,
    fri: typeof wd.fri === 'boolean' ? wd.fri : DEFAULT_WORKING_DAYS.fri,
    sat: typeof wd.sat === 'boolean' ? wd.sat : DEFAULT_WORKING_DAYS.sat,
    sun: typeof wd.sun === 'boolean' ? wd.sun : DEFAULT_WORKING_DAYS.sun,
  }
}

const DAY_KEYS: Array<keyof WorkingDays> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toDate(v: string | Date): Date {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0)
  // Accept 'YYYY-MM-DD' and 'YYYY-MM-DDT…' — normalise to noon local to avoid TZ drift.
  const iso = v.slice(0, 10)
  const [y, m, d] = iso.split('-').map(n => parseInt(n, 10))
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0)
}

function normaliseHolidays(joursFeries: Iterable<Date | string> | undefined | null): Set<string> {
  const s = new Set<string>()
  if (!joursFeries) return s
  for (const h of joursFeries) {
    if (h instanceof Date) s.add(toIsoDate(h))
    else if (typeof h === 'string') s.add(h.slice(0, 10))
  }
  return s
}

/**
 * Mauritius public holidays — fallback used only when the caller cannot
 * (or does not want to) fetch `jours_feries` from the DB.
 *
 * Fixed holidays from the Workers' Rights Act 2019 + Mauritius Public
 * Holidays Act. Variable holidays (Eid, Divali, Chinese Spring Festival,
 * Maha Shivaratree, …) shift yearly — we ship the commonly-used dates for
 * 2024–2026. For production accuracy, prefer the `jours_feries` table
 * which is maintained from the Government Gazette.
 */
export function getMauritiusPublicHolidays(year: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`

  const fixed = [
    fmt(1, 1),   // New Year's Day
    fmt(1, 2),   // New Year's Day (2)
    fmt(2, 1),   // Abolition of Slavery
    fmt(3, 12),  // Independence & Republic Day
    fmt(5, 1),   // Labour Day
    fmt(11, 1),  // All Saints' Day
    fmt(11, 2),  // Arrival of Indentured Labourers
    fmt(12, 25), // Christmas Day
  ]

  const variableByYear: Record<number, string[]> = {
    2024: [fmt(1, 25), fmt(2, 10), fmt(3, 8), fmt(3, 29), fmt(4, 10), fmt(8, 15), fmt(9, 16), fmt(11, 1)],
    2025: [fmt(1, 14), fmt(1, 29), fmt(2, 26), fmt(3, 30), fmt(3, 14), fmt(8, 15), fmt(9, 5), fmt(10, 20)],
    2026: [fmt(1, 2), fmt(2, 17), fmt(2, 15), fmt(3, 20), fmt(4, 3), fmt(8, 15), fmt(8, 26), fmt(11, 8)],
  }

  return new Set([...fixed, ...(variableByYear[year] || [])])
}

export interface CalculateWorkingDaysOptions {
  /** Employee's weekly working-days pattern. Defaults to Mon–Fri. */
  workingDays?: WorkingDays
  /**
   * Public holidays to exclude. Prefer passing rows from the `jours_feries`
   * table. If `undefined`, falls back to the hardcoded Mauritius set for
   * every year the date range touches.
   */
  joursFeries?: Iterable<Date | string>
}

/**
 * Count the number of working days between `dateDebut` and `dateFin` INCLUSIVE,
 * taking into account the employee's weekly pattern and public holidays.
 *
 * Returns a non-negative integer. Returns 0 if `dateFin < dateDebut`.
 *
 * Examples (Mon–Fri employee, 2026):
 *   calculateWorkingDays('2026-04-13', '2026-04-17') → 5
 *   calculateWorkingDays('2026-03-10', '2026-03-13') → 3 (12 Mar is a holiday)
 *   calculateWorkingDays('2026-04-13', '2026-04-19') → 5 (Sat+Sun skipped)
 *
 * Half-day leave is not computed here — callers override nb_jours to 0.5
 * when `demi_journee === true` and `date_debut === date_fin`.
 */
export function calculateWorkingDays(
  dateDebut: string | Date,
  dateFin: string | Date,
  options: CalculateWorkingDaysOptions = {}
): number {
  const start = toDate(dateDebut)
  const end = toDate(dateFin)
  if (end < start) return 0

  const workingDays = options.workingDays ?? DEFAULT_WORKING_DAYS

  // Build the holiday set. If the caller did not provide one, fall back
  // to the hardcoded MU calendar for every year the range spans.
  let holidays: Set<string>
  if (options.joursFeries !== undefined) {
    holidays = normaliseHolidays(options.joursFeries)
  } else {
    holidays = new Set<string>()
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      for (const h of getMauritiusPublicHolidays(y)) holidays.add(h)
    }
  }

  let count = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    const dayKey = DAY_KEYS[cursor.getDay()]
    const iso = toIsoDate(cursor)
    if (workingDays[dayKey] && !holidays.has(iso)) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
