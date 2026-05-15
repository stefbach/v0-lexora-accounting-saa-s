import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { googleCalendarFetch } from '@/lib/google/calendar-client'

/**
 * POST /api/telegram/internal/calendar-delete-event
 *
 * Body :
 *   account_email?
 *   calendar_id*
 *   event_id*
 *   send_cancellations? bool → sendUpdates=all si true (notifie attendees)
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'calendar.delete_event', async (ctx, body) => {
    const account_email = body?.account_email ? String(body.account_email) : undefined
    const calendar_id = String(body?.calendar_id || '').trim()
    const event_id = String(body?.event_id || '').trim()
    if (!calendar_id || !event_id) {
      return { result: null, status: 'error', error_msg: 'calendar_id et event_id requis' }
    }
    const send_cancellations = body?.send_cancellations === true

    await googleCalendarFetch(
      ctx.user_id,
      account_email,
      `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
      {
        method: 'DELETE',
        query: { sendUpdates: send_cancellations ? 'all' : 'none' },
      },
    )

    return {
      result: { deleted: true, event_id, calendar_id, notified_attendees: send_cancellations },
    }
  })
}
