import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { trySendViaNylas } from '@/lib/nylas/send'

export const dynamic = 'force-dynamic'

interface Body {
  societe_id?: string | null
  account_id?: string | null
  to: string[]
  cc?: string[]
  subject: string
  html: string
  reply_to?: string
}

/** POST /api/nylas/send — envoie un email depuis la boîte Nylas connectée. */
export async function POST(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const b = await req.json().catch(() => null) as Body | null
  if (!b?.to?.length || !b.subject?.trim() || !b.html?.trim()) {
    return NextResponse.json({ error: 'Destinataire, objet et message requis' }, { status: 400 })
  }

  const admin = getAdminClient()
  const r = await trySendViaNylas(admin, {
    user_id: user.id,
    societe_id: b.societe_id ?? null,
    account_id: b.account_id ?? null,
    msg: { to: b.to, cc: b.cc, subject: b.subject, html: b.html, reply_to: b.reply_to },
  })
  if (!r) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })
  if (!r.ok) return NextResponse.json({ error: r.error || 'Échec envoi' }, { status: 502 })
  return NextResponse.json({ ok: true, message_id: r.message_id, from: r.account_email })
}
