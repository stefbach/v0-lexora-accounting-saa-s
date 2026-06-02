/**
 * Calcule les créneaux disponibles pour une date donnée en croisant :
 *   - les paramètres de booking (jours/heures ouvrés, durée, pause)
 *   - les events Google Calendar du owner sur la journée (busy times)
 *   - les bookings déjà enregistrés (status 'confirmed')
 *   - min_notice_hours / max_advance_days
 */

export type BookingSettings = {
  duration_minutes: number
  slot_interval_minutes: number
  buffer_before_minutes: number
  buffer_after_minutes: number
  min_notice_hours: number
  max_advance_days: number
  working_days: string[]
  working_hours_start: string
  working_hours_end: string
  lunch_break_start: string | null
  lunch_break_end: string | null
  timezone: string
}

export type Slot = { start_iso: string; end_iso: string; label: string }

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function parseHHMM(s: string): { h: number; m: number } {
  const [hh, mm] = s.split(':').map(Number)
  return { h: hh || 0, m: mm || 0 }
}

/** Construit un Date dans la timezone Maurice (ou autre via Intl). On utilise
 *  un calcul UTC simple : Maurice = UTC+4, pas de DST. Pour d'autres TZ on
 *  pourrait passer par Intl.DateTimeFormat — ici on garde simple. */
function dateAtMauritius(y: number, m: number, d: number, h: number, min: number): Date {
  // Maurice = UTC+4 → UTC = local - 4h
  return new Date(Date.UTC(y, m - 1, d, h - 4, min, 0))
}

/**
 * Génère les créneaux candidats pour une date (YYYY-MM-DD en heure Maurice).
 * Retourne tous les slots de la journée selon le paramétrage, sans encore
 * filtrer les occupés (busy times Google + bookings).
 */
export function generateCandidateSlots(
  dateStr: string,
  settings: BookingSettings,
): Slot[] {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return []

  // Quel jour de la semaine en heure Maurice ?
  const probe = dateAtMauritius(y, m, d, 12, 0)
  const weekday = DAY_KEYS[probe.getUTCDay()] // après conversion via UTC c'est encore le bon jour
  // Note : pour Maurice (pas de DST), UTC+4 ne décale pas le jour. OK pour MVP.
  if (!settings.working_days.includes(weekday)) return []

  const start = parseHHMM(settings.working_hours_start)
  const end = parseHHMM(settings.working_hours_end)
  const lunchStart = settings.lunch_break_start ? parseHHMM(settings.lunch_break_start) : null
  const lunchEnd = settings.lunch_break_end ? parseHHMM(settings.lunch_break_end) : null

  const duration = settings.duration_minutes
  const step = settings.slot_interval_minutes
  const slots: Slot[] = []

  let curH = start.h, curM = start.m
  while (true) {
    const startMin = curH * 60 + curM
    const endMin = startMin + duration
    const dayEndMin = end.h * 60 + end.m
    if (endMin > dayEndMin) break

    // Pause déjeuner : exclure si chevauche
    if (lunchStart && lunchEnd) {
      const lsMin = lunchStart.h * 60 + lunchStart.m
      const leMin = lunchEnd.h * 60 + lunchEnd.m
      if (startMin < leMin && endMin > lsMin) {
        // chevauche la pause → on saute à la fin de la pause
        curH = lunchEnd.h
        curM = lunchEnd.m
        continue
      }
    }

    const startDate = dateAtMauritius(y, m, d, curH, curM)
    const endDate = new Date(startDate.getTime() + duration * 60_000)

    const labelStart = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`
    const endH = Math.floor(endMin / 60), endM = endMin % 60
    const labelEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

    slots.push({
      start_iso: startDate.toISOString(),
      end_iso: endDate.toISOString(),
      label: `${labelStart} – ${labelEnd}`,
    })

    // step suivant
    const nextMin = startMin + step
    curH = Math.floor(nextMin / 60)
    curM = nextMin % 60
  }

  return slots
}

/**
 * Filtre les slots qui chevauchent un intervalle occupé (busy time Google
 * ou booking interne). On ajoute aussi les buffers avant/après la durée.
 */
export function filterBusySlots(
  candidates: Slot[],
  busy: Array<{ start_iso: string; end_iso: string }>,
  bufferBeforeMin: number,
  bufferAfterMin: number,
): Slot[] {
  if (busy.length === 0) return candidates
  return candidates.filter(slot => {
    const sStart = new Date(slot.start_iso).getTime() - bufferBeforeMin * 60_000
    const sEnd = new Date(slot.end_iso).getTime() + bufferAfterMin * 60_000
    return !busy.some(b => {
      const bStart = new Date(b.start_iso).getTime()
      const bEnd = new Date(b.end_iso).getTime()
      return sStart < bEnd && sEnd > bStart
    })
  })
}

/** Applique min_notice_hours et max_advance_days */
export function filterByNotice(
  candidates: Slot[],
  minNoticeHours: number,
  maxAdvanceDays: number,
): Slot[] {
  const now = Date.now()
  const minTime = now + minNoticeHours * 3600_000
  const maxTime = now + maxAdvanceDays * 86_400_000
  return candidates.filter(s => {
    const t = new Date(s.start_iso).getTime()
    return t >= minTime && t <= maxTime
  })
}
