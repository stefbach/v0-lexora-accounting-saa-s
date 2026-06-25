// ============================================================
// lib/rh/mauritius-holidays.ts — Jours fériés mauriciens (avec libellés)
// ============================================================
// Remplace les listes de fériés codées en dur pour une seule année (ex.
// `HOLIDAYS_2026`) qui n'affichaient plus rien dès l'année suivante.
//
// Les fériés FIXES (dates grégoriennes constantes) sont calculés pour
// n'importe quelle année. Les fériés VARIABLES (lunaires : Cavadee,
// Shivaratree, Nouvel An chinois, Eid, Ougadi, Ganesh, Divali) dépendent
// de calendriers astronomiques et ne peuvent pas être calculés ici — ils
// sont fournis par année dans une table à tenir à jour. On n'invente jamais
// une date variable approximative (un app comptable/RH exige l'exactitude).

export interface Holiday {
  date: string // YYYY-MM-DD
  name: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Fériés à date grégorienne fixe — valables chaque année. */
function fixedHolidays(year: number): Holiday[] {
  const d = (m: number, day: number) => `${year}-${pad(m)}-${pad(day)}`
  return [
    { date: d(1, 1), name: 'New Year' },
    { date: d(1, 2), name: 'New Year (2nd day)' },
    { date: d(2, 1), name: 'Abolition of Slavery' },
    { date: d(3, 12), name: 'Independence & Republic Day' },
    { date: d(5, 1), name: 'Labour Day' },
    { date: d(8, 15), name: 'Assumption' },
    { date: d(11, 2), name: 'Arrival of Indentured Labourers' },
    { date: d(12, 25), name: 'Christmas' },
  ]
}

/** Fériés variables (lunaires) connus, par année. À compléter chaque année. */
const VARIABLE_HOLIDAYS: Record<number, Holiday[]> = {
  2024: [
    { date: '2024-01-25', name: 'Thaipoosam Cavadee' },
    { date: '2024-02-10', name: 'Chinese Spring Festival' },
    { date: '2024-03-08', name: 'Maha Shivaratree' },
    { date: '2024-03-29', name: 'Ougadi' },
    { date: '2024-04-10', name: 'Eid-Ul-Fitr' },
    { date: '2024-09-07', name: 'Ganesh Chaturthi' },
    { date: '2024-10-31', name: 'Divali' },
  ],
  2025: [
    { date: '2025-01-14', name: 'Thaipoosam Cavadee' },
    { date: '2025-01-29', name: 'Chinese Spring Festival' },
    { date: '2025-02-26', name: 'Maha Shivaratree' },
    { date: '2025-03-30', name: 'Ougadi' },
    { date: '2025-03-31', name: 'Eid-Ul-Fitr' },
    { date: '2025-08-27', name: 'Ganesh Chaturthi' },
    { date: '2025-10-20', name: 'Divali' },
  ],
  2026: [
    { date: '2026-01-02', name: 'Thaipoosam Cavadee' },
    { date: '2026-02-15', name: 'Maha Shivaratree' },
    { date: '2026-02-17', name: 'Chinese Spring Festival' },
    { date: '2026-03-20', name: 'Eid-Ul-Fitr' },
    { date: '2026-04-03', name: 'Ougadi' },
    { date: '2026-08-26', name: 'Ganesh Chaturthi' },
    { date: '2026-11-08', name: 'Divali' },
  ],
}

/** Liste triée des fériés (fixes + variables connus) pour une année donnée. */
export function getMauritiusHolidaysWithNames(year: number): Holiday[] {
  return [...fixedHolidays(year), ...(VARIABLE_HOLIDAYS[year] || [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
}

/**
 * Prochains fériés à partir d'aujourd'hui, en couvrant l'année courante ET
 * la suivante (pour rester pertinent en fin d'année).
 */
export function getUpcomingHolidays(todayISO: string, limit = 3): Holiday[] {
  const year = parseInt(todayISO.slice(0, 4), 10)
  const pool = [...getMauritiusHolidaysWithNames(year), ...getMauritiusHolidaysWithNames(year + 1)]
  return pool.filter((h) => h.date >= todayISO).slice(0, limit)
}
