import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramMessage, sendTelegramDocument } from '@/lib/telegram/auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/send
 *
 * Endpoint server-side : permet à n8n / cron / triggers d'envoyer un message
 * Telegram à un utilisateur identifié par user_id (ou directement chat_id).
 *
 * Auth: header X-Internal-Token doit matcher INTERNAL_API_TOKEN
 *
 * Body :
 * {
 *   user_id?: uuid,           // OU
 *   chat_id?: number,
 *   societe_id?: uuid,        // pour filtrer (un user multi-société : on cible
 *                             //  le chat_id seulement si current_societe_id matche)
 *   text: string,
 *   document_url?: string,
 *   reply_markup?: any         // boutons inline
 * }
 */
export async function POST(req: NextRequest) {
  const internalToken = req.headers.get('x-internal-token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || (!body.user_id && !body.chat_id)) {
    return NextResponse.json({ error: 'user_id ou chat_id requis' }, { status: 400 })
  }

  let chatId: number | null = body.chat_id ?? null
  if (!chatId && body.user_id) {
    const admin = getAdminClient()
    let q = admin.from('telegram_users')
      .select('chat_id, current_societe_id')
      .eq('user_id', body.user_id)
      .eq('verified', true)
    if (body.societe_id) q = q.eq('current_societe_id', body.societe_id)
    const { data } = await q.maybeSingle()
    if (!data) return NextResponse.json({ error: 'Utilisateur non lié à Telegram' }, { status: 404 })
    chatId = data.chat_id
  }

  try {
    if (body.document_url) {
      await sendTelegramDocument(chatId!, body.document_url, body.text)
    } else {
      await sendTelegramMessage(chatId!, body.text, body.reply_markup ? { reply_markup: body.reply_markup } : {})
    }
    return NextResponse.json({ ok: true, chat_id: chatId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
