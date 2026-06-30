import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount, listNylasAccounts } from '@/lib/nylas/account'
import { listNylasCalendars, listNylasEvents, createNylasEvent, isNylasConfigured, type CalEvent } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nylas/calendar/events?start=&end=&account_id=
 * Sans account_id → agrège les événements de TOUTES les boîtes connectées
 * (chaque événement est étiqueté avec sa boîte d'origine). Avec account_id →
 * une seule boîte.
 */
export async function GET(req: NextRequest) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const admin = getAdminClient()
  const sp = req.nextUrl.searchParams
  const filterAccountId = sp.get('account_id')

  const all = await listNylasAccounts(admin, user.id)
  const accounts = filterAccountId ? all.filter((a) => a.id === filterAccountId) : all
  if (accounts.length === 0) return NextResponse.json({ error: 'Aucune boîte connectée' }, { status: 404 })

  const now = Math.floor(Date.now() / 1000)
  const start = Number(sp.get('start')) || now - 7 * 86400
  const end = Number(sp.get('end')) || now + 30 * 86400

  type TaggedEvent = CalEvent & { accountId: string; accountEmail: string; calendarId: string }
  const events: TaggedEvent[] = []
  const errors: string[] = []
  await Promise.all(accounts.map(async (acc) => {
    try {
      const cals = await listNylasCalendars(acc.grantId)
      const calId = (cals.find((c) => c.isPrimary) || cals[0])?.id
      if (!calId) return
      const evs = await listNylasEvents(acc.grantId, calId, start, end)
      for (const e of evs) events.push({ ...e, accountId: acc.id, accountEmail: acc.account_email, calendarId: calId })
    } catch (e) {
      errors.push(`${acc.account_email}: ${e instanceof Error ? e.message : 'erreur'}`)
    }
  }))

  return NextResponse.json({
    accounts: all.map((a) => ({ id: a.id, email: a.account_email })),
    events, errors,
  })
}

/** POST /api/nylas/calendar/events — crée un événement (avec visio optionnelle). */
export async function POST(req: NextRequest) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const b = await req.json().catch(() => null) as {
    societe_id?: string | null; account_id?: string | null
    calendar_id?: string; title?: string; description?: string; location?: string
    start?: number; end?: number; participants?: string[]; conferencing?: 'meet' | 'zoom' | null
  } | null
  if (!b?.title?.trim() || !b.start || !b.end) return NextResponse.json({ error: 'Titre, début et fin requis' }, { status: 400 })

  const admin = getAdminClient()
  const acc = await resolveNylasAccount(admin, user.id, b.societe_id, b.account_id)
  if (!acc) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  try {
    let calendarId = b.calendar_id || ''
    if (!calendarId) {
      const calendars = await listNylasCalendars(acc.grantId)
      calendarId = (calendars.find((c) => c.isPrimary && !c.readOnly) || calendars.find((c) => !c.readOnly) || calendars[0])?.id || ''
    }
    if (!calendarId) return NextResponse.json({ error: 'Aucun calendrier modifiable' }, { status: 400 })

    const event = await createNylasEvent(acc.grantId, {
      calendarId, title: b.title, description: b.description, location: b.location,
      startEpoch: b.start, endEpoch: b.end, participants: b.participants, conferencing: b.conferencing ?? null,
    })
    return NextResponse.json({ ok: true, event })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur création événement' }, { status: 502 })
  }
}
