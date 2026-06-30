import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { getNylasMessage, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/** GET /api/nylas/messages/[id]?societe_id= — message complet (corps inclus). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'))
  if (!account) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  try {
    const message = await getNylasMessage(account.grantId, id)
    return NextResponse.json({ message })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur lecture message' }, { status: 502 })
  }
}
