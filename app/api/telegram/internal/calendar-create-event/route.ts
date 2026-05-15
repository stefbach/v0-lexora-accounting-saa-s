import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { googleCalendarFetch, extractMeetUrl } from '@/lib/google/calendar-client'
import { randomUUID } from 'crypto'

/**
 * POST /api/telegram/internal/calendar-create-event
 *
 * Body :
 *   account_email?     compte Google à utiliser (sinon default user)
 *   calendar_id?       id du calendrier (default 'primary')
 *   summary*           titre du RDV
 *   start_iso*         ISO 8601 (ex: 2026-05-16T14:00:00+04:00)
 *   end_iso*           ISO 8601
 *   attendees?         [{email, name?}]
 *   location?          lieu (physical)
 *   description?       description / agenda
 *   type               'physical' | 'meet'  (default 'physical')
 *   send_invites?      bool (default false → sendUpdates=none)
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'calendar.create_event', async (ctx, body) => {
    const summary = String(body?.summary || '').trim().slice(0, 200)
    const start_iso = String(body?.start_iso || '').trim()
    const end_iso = String(body?.end_iso || '').trim()
    if (!summary) return { result: null, status: 'error', error_msg: 'summary requis' }
    if (!start_iso || !end_iso) return { result: null, status: 'error', error_msg: 'start_iso et end_iso requis (ISO 8601)' }

    const startDate = new Date(start_iso)
    const endDate = new Date(end_iso)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { result: null, status: 'error', error_msg: 'Dates ISO invalides' }
    }
    if (endDate.getTime() <= startDate.getTime()) {
      return { result: null, status: 'error', error_msg: 'end_iso doit être après start_iso' }
    }

    const account_email = body?.account_email ? String(body.account_email) : undefined
    const calendar_id = body?.calendar_id ? String(body.calendar_id) : 'primary'
    const type = body?.type === 'meet' ? 'meet' : 'physical'
    const location = body?.location ? String(body.location).slice(0, 500) : undefined
    const description = body?.description ? String(body.description).slice(0, 4000) : undefined
    const send_invites = body?.send_invites === true

    const attendees = (Array.isArray(body?.attendees) ? body.attendees : [])
      .map((a: any) => ({ email: String(a?.email || '').trim(), displayName: a?.name ? String(a.name) : undefined }))
      .filter((a: any) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))
      .slice(0, 25)

    const event: any = {
      summary,
      description,
      location,
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
      attendees,
    }
    if (type === 'meet') {
      event.conferenceData = {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    const created = await googleCalendarFetch(
      ctx.user_id,
      account_email,
      `/calendars/${encodeURIComponent(calendar_id)}/events`,
      {
        method: 'POST',
        json: event,
        query: {
          conferenceDataVersion: type === 'meet' ? 1 : 0,
          sendUpdates: send_invites ? 'all' : 'none',
        },
      },
    )

    return {
      result: {
        event_id: created.id,
        calendar_id,
        html_link: created.htmlLink || null,
        meet_url: extractMeetUrl(created),
        start: created.start?.dateTime || created.start?.date,
        end: created.end?.dateTime || created.end?.date,
        attendees: (created.attendees || []).map((a: any) => ({ email: a.email, response: a.responseStatus })),
        type,
        send_invites,
      },
    }
  })
}
