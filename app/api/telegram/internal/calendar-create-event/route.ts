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

    // Champs manquants → on guide le LLM au lieu de relayer une erreur technique
    // (status:'success' évite que le bot affiche "Erreur:" à l'utilisateur).
    const missing: string[] = []
    if (!summary) missing.push('summary')
    if (!start_iso) missing.push('start_iso')
    if (!end_iso) missing.push('end_iso')
    if (missing.length > 0) {
      const fieldHints: Record<string, string> = {
        summary: 'titre du RDV (ex "RDV MRA", "Call client X", "Réunion équipe")',
        start_iso: 'date+heure de début au format ISO 8601 AVEC offset Maurice +04:00 (ex "2026-05-19T13:00:00+04:00")',
        end_iso: 'date+heure de fin au format ISO 8601 AVEC offset Maurice +04:00 (ex "2026-05-19T14:00:00+04:00"). Si la durée n\'est pas précisée par l\'utilisateur, prends +60min après start_iso',
      }
      return {
        result: {
          action_required: 'collect_missing_fields',
          missing_fields: missing,
          instructions_for_assistant:
            `Tu dois RELIRE le message original de l'utilisateur dans la conversation et EXTRAIRE les champs manquants : ${missing.join(', ')}. ` +
            `Pour chacun : ${missing.map(m => `${m} = ${fieldHints[m]}`).join(' | ')}. ` +
            `Si tu as déjà toutes les infos dans le message utilisateur, RÉAPPELLE calendar_create_event immédiatement avec les bons paramètres extraits (ex: utilisateur dit "RDV mardi 19 13h-14h MRA" → summary="RDV MRA", start_iso="<mardi 19 prochain>T13:00:00+04:00", end_iso="<mardi 19 prochain>T14:00:00+04:00"). ` +
            `Si une info manque vraiment, demande-la à l'utilisateur en français, en UNE seule question courte.`,
        },
      }
    }
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
      start: { dateTime: startDate.toISOString(), timeZone: 'Indian/Mauritius' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Indian/Mauritius' },
    }
    // N'inclure attendees QUE si non vide (Google rejette parfois [])
    if (attendees.length > 0) event.attendees = attendees
    if (type === 'meet') {
      event.conferenceData = {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    let created: any
    try {
      created = await googleCalendarFetch(
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
    } catch (e: any) {
      // Log explicite côté Vercel + retour structuré au LLM
      const msg = e?.message || String(e)
      console.error('[calendar-create-event] Google API error:', {
        user_id: ctx.user_id,
        account_email,
        calendar_id,
        payload: event,
        google_error: msg,
      })
      return {
        result: null,
        status: 'error',
        error_msg: `${msg} | Payload envoyé : summary="${summary}", start="${startDate.toISOString()}", end="${endDate.toISOString()}", type=${type}, attendees=${attendees.length}, location="${location || ''}", account=${account_email || 'default'}`,
      }
    }

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
