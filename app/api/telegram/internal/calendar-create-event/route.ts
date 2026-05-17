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
    // Lit summary/start_iso/end_iso depuis body OU query string (n8n
    // placeholderDefinitions injecte les valeurs en URL params).
    const qp = req.nextUrl.searchParams
    const summary = String(body?.summary || qp.get('summary') || '').trim().slice(0, 200)
    const start_iso = String(body?.start_iso || qp.get('start_iso') || '').trim()
    const end_iso = String(body?.end_iso || qp.get('end_iso') || '').trim()

    // Champs manquants → status:'error' (sinon le LLM croit que c'est créé et
    // hallucine "RDV créé" auprès de l'utilisateur). error_msg = instruction
    // directe au LLM. Anthropic wrappe en is_error:true, le LLM corrige.
    const missing: string[] = []
    if (!summary) missing.push('summary')
    if (!start_iso) missing.push('start_iso')
    if (!end_iso) missing.push('end_iso')
    if (missing.length > 0) {
      const fieldHints: Record<string, string> = {
        summary: 'titre court (ex "RDV MRA", "Call client X")',
        start_iso: 'date+heure début ISO 8601 avec offset Maurice +04:00 (ex "2026-05-19T13:00:00+04:00")',
        end_iso: 'date+heure fin ISO 8601 avec offset Maurice +04:00. Défaut: +60min après start_iso si user n\'a pas précisé',
      }
      return {
        result: null,
        status: 'error',
        error_msg:
          `AUCUN ÉVÉNEMENT N'A ÉTÉ CRÉÉ. Tu as appelé calendar_create_event sans fournir : ${missing.join(', ')}. ` +
          `RELIS le dernier message utilisateur dans la conversation et EXTRAIS les valeurs : ` +
          `${missing.map(m => `${m} = ${fieldHints[m]}`).join(' ; ')}. ` +
          `Puis RÉAPPELLE calendar_create_event AVEC ces paramètres dans le body. ` +
          `Exemple : user dit "RDV mardi 19 13h-14h MRA" → tu réappelles avec summary="RDV MRA", start_iso="2026-05-19T13:00:00+04:00", end_iso="2026-05-19T14:00:00+04:00". ` +
          `Si après relecture il manque vraiment une info, pose UNE question courte à l'utilisateur en français. ` +
          `NE DIS PAS à l'utilisateur que le RDV est créé tant que tu n'as pas reçu un result avec event_id.`,
      }
    }

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
