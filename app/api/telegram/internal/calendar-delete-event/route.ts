import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { googleCalendarFetch } from '@/lib/google/calendar-client'
import { verifyHmac } from '@/lib/security/hmac-auth'

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
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'calendar.delete_event', async (ctx, body) => {
    const account_email = body?.account_email ? String(body.account_email) : undefined
    const calendar_id = String(body?.calendar_id || '').trim()
    const event_id = String(body?.event_id || '').trim()
    if (!calendar_id || !event_id) {
      return { result: null, status: 'error', error_msg: 'calendar_id et event_id requis' }
    }
    const send_cancellations = body?.send_cancellations === true

    try {
      await googleCalendarFetch(
        ctx.user_id,
        account_email,
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
        {
          method: 'DELETE',
          query: { sendUpdates: send_cancellations ? 'all' : 'none' },
        },
      )
    } catch (e: any) {
      const msg = e?.message || String(e)
      // 410 Gone / 404 Not Found = event déjà supprimé → on traite comme succès idempotent
      if (/\b(404|410)\b/.test(msg)) {
        return {
          result: { deleted: true, event_id, calendar_id, notified_attendees: false, already_deleted: true },
        }
      }
      console.error('[calendar-delete-event] Google API error:', {
        user_id: ctx.user_id,
        account_email,
        calendar_id,
        event_id,
        google_error: msg,
      })
      return {
        result: null,
        status: 'error',
        error_msg: `${msg} | calendar=${calendar_id}, event=${event_id}, account=${account_email || 'default'}`,
      }
    }

    return {
      result: { deleted: true, event_id, calendar_id, notified_attendees: send_cancellations },
    }
  })
}
