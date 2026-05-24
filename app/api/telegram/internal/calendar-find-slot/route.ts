import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { googleCalendarFetch } from '@/lib/google/calendar-client'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * POST /api/telegram/internal/calendar-find-slot
 *
 * Body :
 *   account_emails? string[]  → si plusieurs comptes Google chez l'user, on
 *                                  utilise tous leurs primary calendars + attendees
 *   duration_min*    nombre   (default 30)
 *   days_ahead       nombre   (default 7, max 30)
 *   working_hours?   { start: 'HH:MM', end: 'HH:MM' }   default 09:00-18:00
 *   attendees?       string[] emails à inclure dans la freebusy query
 *   timezone?        string   default 'Indian/Mauritius'
 *
 * Retourne top 5 créneaux libres communs.
 */

type Slot = { start: string; end: string }
type Busy = { start: number; end: number }

function parseHM(s: string, fallbackH: number, fallbackM: number): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return [fallbackH, fallbackM]
  return [Math.min(23, Math.max(0, Number(m[1]))), Math.min(59, Math.max(0, Number(m[2])))]
}

function mergeBusy(busy: Busy[]): Busy[] {
  if (!busy.length) return []
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  const out: Busy[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end)
    } else {
      out.push(sorted[i])
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'calendar.find_slot', async (ctx, body) => {
    const duration_min = Math.max(15, Math.min(480, Number(body?.duration_min) || 30))
    const days_ahead = Math.max(1, Math.min(30, Number(body?.days_ahead) || 7))
    const tz = body?.timezone ? String(body.timezone) : 'Indian/Mauritius'
    const [wsH, wsM] = parseHM(String(body?.working_hours?.start || '09:00'), 9, 0)
    const [weH, weM] = parseHM(String(body?.working_hours?.end || '18:00'), 18, 0)

    const account_emails: string[] = Array.isArray(body?.account_emails) && body.account_emails.length > 0
      ? body.account_emails.map((s: any) => String(s)).slice(0, 3)
      : [undefined as any] // fallback : default account

    const attendeeEmails: string[] = (Array.isArray(body?.attendees) ? body.attendees : [])
      .map((e: any) => String(e || '').trim())
      .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      .slice(0, 10)

    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + days_ahead * 86400_000).toISOString()

    // Pour chaque compte (== une instance Google distincte), une freebusy query.
    // On agrège tous les busy intervals.
    const busyAll: Busy[] = []

    for (const acc of account_emails) {
      try {
        // items = primary du compte + tous les attendees
        const items = [{ id: 'primary' }, ...attendeeEmails.map(e => ({ id: e }))]
        const fb = await googleCalendarFetch(ctx.user_id, acc, '/freeBusy', {
          method: 'POST',
          json: { timeMin, timeMax, timeZone: tz, items },
        })
        const cals = fb?.calendars || {}
        for (const cid of Object.keys(cals)) {
          for (const b of cals[cid]?.busy || []) {
            busyAll.push({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() })
          }
        }
      } catch (err: any) {
        // un compte qui échoue ne casse pas tout
        continue
      }
    }

    const busyMerged = mergeBusy(busyAll)

    // Génère les fenêtres working-hours de chaque jour, soustrait busy, garde les créneaux ≥ duration
    const slots: Slot[] = []
    const slotMs = duration_min * 60_000
    const now = Date.now()
    const minLead = 30 * 60_000 // au moins 30min de préavis

    for (let d = 0; d < days_ahead && slots.length < 50; d++) {
      const day = new Date(now + d * 86400_000)
      // Note : on travaille en horloge serveur ; pour Maurice (UTC+4) cohérent en pratique.
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), wsH, wsM, 0, 0).getTime()
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), weH, weM, 0, 0).getTime()
      // Exclure weekends
      const dow = new Date(dayStart).getDay()
      if (dow === 0 || dow === 6) continue

      let cursor = Math.max(dayStart, now + minLead)

      // Liste des busy qui chevauchent cette journée
      const dayBusy = busyMerged.filter(b => b.end > cursor && b.start < dayEnd)
      for (const b of dayBusy) {
        if (b.start > cursor && b.start - cursor >= slotMs) {
          slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + slotMs).toISOString() })
        }
        cursor = Math.max(cursor, b.end)
        if (slots.length >= 50) break
      }
      // Trailing slot après le dernier busy
      if (dayEnd - cursor >= slotMs) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + slotMs).toISOString() })
      }
    }

    return {
      result: {
        duration_min,
        days_ahead,
        timezone: tz,
        working_hours: { start: `${String(wsH).padStart(2, '0')}:${String(wsM).padStart(2, '0')}`, end: `${String(weH).padStart(2, '0')}:${String(weM).padStart(2, '0')}` },
        slots: slots.slice(0, 5),
        attendees_checked: attendeeEmails,
        accounts_checked: account_emails.filter(a => !!a),
      },
    }
  })
}
