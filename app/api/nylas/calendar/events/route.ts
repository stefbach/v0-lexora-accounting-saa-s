import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { listNylasCalendars, listNylasEvents, createNylasEvent, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

async function account(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  const admin = getAdminClient()
  const acc = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'), req.nextUrl.searchParams.get('account_id'))
  if (!acc) return { error: NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 }) }
  return { acc }
}

/** GET /api/nylas/calendar/events?start=&end=&calendar_id= — événements sur une période. */
export async function GET(req: NextRequest) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const r = await account(req)
  if (r.error) return r.error
  const sp = req.nextUrl.searchParams

  try {
    const calendars = await listNylasCalendars(r.acc.grantId)
    let calendarId = sp.get('calendar_id') || ''
    if (!calendarId) calendarId = (calendars.find((c) => c.isPrimary) || calendars[0])?.id || ''
    if (!calendarId) return NextResponse.json({ calendars, events: [], calendarId: '' })

    const now = Math.floor(Date.now() / 1000)
    const start = Number(sp.get('start')) || now - 7 * 86400
    const end = Number(sp.get('end')) || now + 30 * 86400
    const events = await listNylasEvents(r.acc.grantId, calendarId, start, end)
    return NextResponse.json({ calendars, calendarId, events })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur agenda' }, { status: 502 })
  }
}

/** POST /api/nylas/calendar/events — crée un événement (avec visio optionnelle). */
export async function POST(req: NextRequest) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const r = await account(req)
  if (r.error) return r.error

  const b = await req.json().catch(() => null) as {
    calendar_id?: string; title?: string; description?: string; location?: string
    start?: number; end?: number; participants?: string[]; conferencing?: 'meet' | 'zoom' | null
  } | null
  if (!b?.title?.trim() || !b.start || !b.end) return NextResponse.json({ error: 'Titre, début et fin requis' }, { status: 400 })

  try {
    let calendarId = b.calendar_id || ''
    if (!calendarId) {
      const calendars = await listNylasCalendars(r.acc.grantId)
      calendarId = (calendars.find((c) => c.isPrimary && !c.readOnly) || calendars.find((c) => !c.readOnly) || calendars[0])?.id || ''
    }
    if (!calendarId) return NextResponse.json({ error: 'Aucun calendrier modifiable' }, { status: 400 })

    const event = await createNylasEvent(r.acc.grantId, {
      calendarId, title: b.title, description: b.description, location: b.location,
      startEpoch: b.start, endEpoch: b.end, participants: b.participants, conferencing: b.conferencing ?? null,
    })
    return NextResponse.json({ ok: true, event })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur création événement' }, { status: 502 })
  }
}
