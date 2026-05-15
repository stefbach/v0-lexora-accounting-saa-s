import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { googleCalendarFetch, extractMeetUrl } from '@/lib/google/calendar-client'

/**
 * POST /api/telegram/internal/calendar-update-event
 *
 * Body :
 *   account_email?
 *   calendar_id*
 *   event_id*
 *   patch : { summary?, start_iso?, end_iso?, attendees?, location?, description? }
 *   send_updates? bool → sendUpdates=all si true
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'calendar.update_event', async (ctx, body) => {
    const account_email = body?.account_email ? String(body.account_email) : undefined
    const calendar_id = String(body?.calendar_id || '').trim()
    const event_id = String(body?.event_id || '').trim()
    if (!calendar_id || !event_id) {
      return { result: null, status: 'error', error_msg: 'calendar_id et event_id requis' }
    }

    const patch = body?.patch || {}
    const body_patch: any = {}
    if (patch.summary !== undefined) body_patch.summary = String(patch.summary).slice(0, 200)
    if (patch.description !== undefined) body_patch.description = String(patch.description).slice(0, 4000)
    if (patch.location !== undefined) body_patch.location = String(patch.location).slice(0, 500)
    if (patch.start_iso) {
      const d = new Date(patch.start_iso)
      if (Number.isNaN(d.getTime())) return { result: null, status: 'error', error_msg: 'start_iso invalide' }
      body_patch.start = { dateTime: d.toISOString() }
    }
    if (patch.end_iso) {
      const d = new Date(patch.end_iso)
      if (Number.isNaN(d.getTime())) return { result: null, status: 'error', error_msg: 'end_iso invalide' }
      body_patch.end = { dateTime: d.toISOString() }
    }
    if (Array.isArray(patch.attendees)) {
      body_patch.attendees = patch.attendees
        .map((a: any) => ({ email: String(a?.email || '').trim(), displayName: a?.name ? String(a.name) : undefined }))
        .filter((a: any) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))
        .slice(0, 25)
    }

    if (Object.keys(body_patch).length === 0) {
      return { result: null, status: 'error', error_msg: 'patch vide' }
    }

    const send_updates = body?.send_updates === true

    const updated = await googleCalendarFetch(
      ctx.user_id,
      account_email,
      `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
      {
        method: 'PATCH',
        json: body_patch,
        query: { sendUpdates: send_updates ? 'all' : 'none' },
      },
    )

    return {
      result: {
        event_id: updated.id,
        calendar_id,
        html_link: updated.htmlLink || null,
        meet_url: extractMeetUrl(updated),
        start: updated.start?.dateTime || updated.start?.date,
        end: updated.end?.dateTime || updated.end?.date,
        summary: updated.summary,
      },
    }
  })
}
