import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { deleteNylasEvent, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/** DELETE /api/nylas/calendar/events/[id]?calendar_id= — supprime un événement. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const calendarId = req.nextUrl.searchParams.get('calendar_id')
  if (!calendarId) return NextResponse.json({ error: 'calendar_id requis' }, { status: 400 })

  const admin = getAdminClient()
  const acc = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'), req.nextUrl.searchParams.get('account_id'))
  if (!acc) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  try {
    await deleteNylasEvent(acc.grantId, id, calendarId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur suppression' }, { status: 502 })
  }
}
