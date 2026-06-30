import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { getNylasMessage, updateNylasMessage, deleteNylasMessage, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/** GET /api/nylas/messages/[id]?societe_id= — message complet + marque comme lu. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'), req.nextUrl.searchParams.get('account_id'))
  if (!account) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  try {
    const message = await getNylasMessage(account.grantId, id)
    // Marque comme lu à l'ouverture (best-effort).
    if (message.unread) updateNylasMessage(account.grantId, id, { unread: false }).catch(() => {})
    return NextResponse.json({ message })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur lecture message' }, { status: 502 })
  }
}

/** PATCH /api/nylas/messages/[id] — modifie l'état (lu/non-lu, étoile). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'), req.nextUrl.searchParams.get('account_id'))
  if (!account) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  const b = await req.json().catch(() => ({})) as { unread?: boolean; starred?: boolean }
  try {
    await updateNylasMessage(account.grantId, id, b)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur mise à jour' }, { status: 502 })
  }
}

/** DELETE /api/nylas/messages/[id] — supprime le message. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'), req.nextUrl.searchParams.get('account_id'))
  if (!account) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  try {
    await deleteNylasMessage(account.grantId, id)
    // Nettoie l'analyse en cache associée.
    await admin.from('nylas_message_analysis').delete().eq('user_id', user.id).eq('message_id', id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur suppression' }, { status: 502 })
  }
}
