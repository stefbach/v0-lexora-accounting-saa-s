import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/societe
 *
 * Server-side : permet à n8n / aux outils internes de switcher la société
 * active d'un chat Telegram. Auth: X-Internal-Token.
 *
 * Body: { chat_id: number, societe_id: uuid }
 */
export async function POST(req: NextRequest) {
  const internalToken = req.headers.get('x-internal-token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  if (!body?.chat_id || !body?.societe_id) {
    return NextResponse.json({ error: 'chat_id et societe_id requis' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: tg } = await admin
    .from('telegram_users')
    .select('user_id')
    .eq('chat_id', body.chat_id)
    .eq('verified', true)
    .maybeSingle()
  if (!tg) return NextResponse.json({ error: 'Chat non vérifié' }, { status: 404 })

  // Vérifie que l'user a accès à cette société
  const { data: access } = await admin
    .from('user_societes')
    .select('societe_id')
    .eq('user_id', tg.user_id)
    .eq('societe_id', body.societe_id)
    .maybeSingle()
  if (!access) return NextResponse.json({ error: 'Accès société refusé' }, { status: 403 })

  const { error } = await admin
    .from('telegram_users')
    .update({ current_societe_id: body.societe_id })
    .eq('chat_id', body.chat_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
