import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { listNylasMessages, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nylas/messages?societe_id=&q=&limit=&page_token=
 * Liste les messages de la boîte Nylas connectée (boîte de réception interne).
 */
export async function GET(req: NextRequest) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, sp.get('societe_id'))
  if (!account) return NextResponse.json({ account: null, messages: [] })

  try {
    const { data, nextCursor } = await listNylasMessages(account.grantId, {
      limit: Math.min(Number(sp.get('limit')) || 25, 50),
      pageToken: sp.get('page_token') || undefined,
      q: sp.get('q') || undefined,
    })
    return NextResponse.json({ account: { email: account.account_email }, messages: data, nextCursor })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur lecture Nylas' }, { status: 502 })
  }
}
