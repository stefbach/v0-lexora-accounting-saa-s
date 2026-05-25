import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { googleCalendarFetch, extractMeetUrl } from '@/lib/google/calendar-client'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * POST /api/telegram/internal/calendar-list-events
 *
 * Body : { account_email?: string, days_ahead?: number, calendars?: string[] }
 *
 * Liste les événements à venir sur N jours (top 20 globalement, fusionnés
 * across calendars demandés).
 */
export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'calendar.list_events', async (ctx, body) => {
    const account_email = body?.account_email ? String(body.account_email) : undefined
    const days_ahead = Math.max(1, Math.min(60, Number(body?.days_ahead) || 7))
    const calendars: string[] = Array.isArray(body?.calendars) && body.calendars.length > 0
      ? body.calendars.map((c: any) => String(c)).slice(0, 5)
      : ['primary']

    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + days_ahead * 86400_000).toISOString()

    const allEvents: any[] = []
    for (const cal of calendars) {
      try {
        const r = await googleCalendarFetch(ctx.user_id, account_email, `/calendars/${encodeURIComponent(cal)}/events`, {
          method: 'GET',
          query: {
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 20,
          },
        })
        for (const e of r?.items || []) {
          allEvents.push({ ...e, _calendar_id: cal })
        }
      } catch (err: any) {
        // Continue : un calendrier indisponible ne casse pas toute la liste
        allEvents.push({ _error: err?.message || String(err), _calendar_id: cal })
      }
    }

    const events = allEvents
      .filter(e => !e._error)
      .sort((a, b) => {
        const sa = a.start?.dateTime || a.start?.date || ''
        const sb = b.start?.dateTime || b.start?.date || ''
        return sa.localeCompare(sb)
      })
      .slice(0, 20)
      .map((e: any) => ({
        id: e.id,
        calendar_id: e._calendar_id,
        title: e.summary || '(sans titre)',
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location || null,
        attendees: (e.attendees || []).map((a: any) => ({
          email: a.email, name: a.displayName || null, response: a.responseStatus || null,
        })),
        meet_link: extractMeetUrl(e),
        html_link: e.htmlLink || null,
        organizer: e.organizer?.email || null,
      }))

    return {
      result: {
        count: events.length,
        events,
        days_ahead,
        calendars,
        errors: allEvents.filter(e => e._error).map(e => ({ calendar_id: e._calendar_id, error: e._error })),
      },
    }
  })
}
