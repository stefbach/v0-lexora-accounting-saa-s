import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { googleCalendarFetch, extractMeetUrl } from '@/lib/google/calendar-client'
import { nylasOwnerCalendar } from '@/lib/nylas/agent-bridge'
import { updateNylasEvent } from '@/lib/nylas/client'
import { verifyHmac } from '@/lib/security/hmac-auth'

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
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'calendar.update_event', async (ctx, body) => {
    const account_email = body?.account_email ? String(body.account_email) : undefined
    const calendar_id = String(body?.calendar_id || '').trim()
    const event_id = String(body?.event_id || '').trim()
    if (!calendar_id || !event_id) {
      return { result: null, status: 'error', error_msg: 'calendar_id et event_id requis' }
    }

    const patch = body?.patch || {}

    // Nylas en priorité (l'event a été créé via Nylas → ids Nylas).
    const nylasCal = await nylasOwnerCalendar(ctx.user_id).catch(() => null)
    if (nylasCal) {
      try {
        const sE = patch.start_iso ? Math.floor(new Date(patch.start_iso).getTime() / 1000) : undefined
        const eE = patch.end_iso ? Math.floor(new Date(patch.end_iso).getTime() / 1000) : undefined
        if ((sE && !eE) || (!sE && eE)) {
          return { result: null, status: 'error', error_msg: 'Pour modifier l\'horaire via Nylas, fournis start_iso ET end_iso.' }
        }
        const ev = await updateNylasEvent(nylasCal.grantId, event_id, calendar_id || nylasCal.calendarId, {
          title: patch.summary !== undefined ? String(patch.summary).slice(0, 200) : undefined,
          description: patch.description !== undefined ? String(patch.description).slice(0, 4000) : undefined,
          location: patch.location !== undefined ? String(patch.location).slice(0, 500) : undefined,
          startEpoch: sE, endEpoch: eE,
          participants: Array.isArray(patch.attendees) ? patch.attendees.map((a: any) => String(a?.email || '').trim()).filter(Boolean) : undefined,
        })
        return { result: { event_id: ev.id, calendar_id, html_link: null, meet_url: ev.conferenceUrl, start: ev.start, end: ev.end, summary: ev.title, source: 'nylas' } }
      } catch (e: any) {
        return { result: null, status: 'error', error_msg: `Nylas update: ${e?.message || e}` }
      }
    }
    const body_patch: any = {}
    if (patch.summary !== undefined) body_patch.summary = String(patch.summary).slice(0, 200)
    if (patch.description !== undefined) body_patch.description = String(patch.description).slice(0, 4000)
    if (patch.location !== undefined) body_patch.location = String(patch.location).slice(0, 500)

    let startDate: Date | null = null
    let endDate: Date | null = null
    if (patch.start_iso) {
      const d = new Date(patch.start_iso)
      if (Number.isNaN(d.getTime())) return { result: null, status: 'error', error_msg: 'start_iso invalide' }
      startDate = d
    }
    if (patch.end_iso) {
      const d = new Date(patch.end_iso)
      if (Number.isNaN(d.getTime())) return { result: null, status: 'error', error_msg: 'end_iso invalide' }
      endDate = d
    }

    // Si on ne patche qu'un seul côté (start ou end), on récupère l'existant
    // pour calculer l'autre. Sinon Google retourne 400 si end <= start.
    if ((startDate && !endDate) || (!startDate && endDate)) {
      try {
        const existing = await googleCalendarFetch(
          ctx.user_id,
          account_email,
          `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
          { method: 'GET' },
        )
        const existingStart = existing?.start?.dateTime ? new Date(existing.start.dateTime) : null
        const existingEnd = existing?.end?.dateTime ? new Date(existing.end.dateTime) : null
        if (existingStart && existingEnd) {
          const duration = existingEnd.getTime() - existingStart.getTime()
          if (startDate && !endDate) {
            endDate = new Date(startDate.getTime() + duration)
          } else if (endDate && !startDate) {
            startDate = new Date(endDate.getTime() - duration)
          }
        }
      } catch (e: any) {
        return { result: null, status: 'error', error_msg: `Lecture event existant échouée : ${e?.message || e}` }
      }
    }

    if (startDate && endDate) {
      if (endDate.getTime() <= startDate.getTime()) {
        return { result: null, status: 'error', error_msg: 'end_iso doit être après start_iso' }
      }
      body_patch.start = { dateTime: startDate.toISOString(), timeZone: 'Indian/Mauritius' }
      body_patch.end = { dateTime: endDate.toISOString(), timeZone: 'Indian/Mauritius' }
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

    let updated: any
    try {
      updated = await googleCalendarFetch(
        ctx.user_id,
        account_email,
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
        {
          method: 'PATCH',
          json: body_patch,
          query: { sendUpdates: send_updates ? 'all' : 'none' },
        },
      )
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error('[calendar-update-event] Google API error:', {
        user_id: ctx.user_id,
        account_email,
        calendar_id,
        event_id,
        payload: body_patch,
        google_error: msg,
      })
      return {
        result: null,
        status: 'error',
        error_msg: `${msg} | Patch envoyé : ${JSON.stringify(body_patch)} | calendar=${calendar_id}, event=${event_id}, account=${account_email || 'default'}`,
      }
    }

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
