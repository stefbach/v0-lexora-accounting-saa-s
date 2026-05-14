import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramInlineButtons, type InlineButton } from '@/lib/telegram/auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/send-with-buttons
 *
 * Endpoint server-side : permet à n8n / cron / triggers d'envoyer un message
 * Telegram avec un inline keyboard (boutons cliquables) à un utilisateur.
 *
 * Auth: header X-Internal-Token doit matcher INTERNAL_API_TOKEN
 *
 * Body :
 * {
 *   user_id?: uuid,           // OU
 *   chat_id?: number,
 *   societe_id?: uuid,        // si user multi-société : cible le chat seulement
 *                             //  si current_societe_id matche
 *   text: string,             // HTML autorisé (<b>, <i>, <code>...)
 *   buttons: InlineButton[][] // 2D array : rangées de boutons
 * }
 *
 * Format des `callback_data` (max 64 bytes) : `intent:param1:param2`
 *   ex : leave.approve:abc-123 / payroll.approve:2025-05:confirm
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
  if (!body.text || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text requis' }, { status: 400 })
  }
  if (!Array.isArray(body.buttons) || body.buttons.length === 0) {
    return NextResponse.json({ error: 'buttons (2D array) requis' }, { status: 400 })
  }

  // Validation structurelle des boutons (texte + callback_data ≤ 64 bytes)
  const buttons: InlineButton[][] = []
  for (const row of body.buttons) {
    if (!Array.isArray(row)) {
      return NextResponse.json({ error: 'buttons doit être un tableau 2D' }, { status: 400 })
    }
    const rowOut: InlineButton[] = []
    for (const b of row) {
      if (!b || typeof b.text !== 'string' || typeof b.callback_data !== 'string') {
        return NextResponse.json(
          { error: 'chaque bouton doit avoir { text, callback_data }' },
          { status: 400 },
        )
      }
      if (Buffer.byteLength(b.callback_data, 'utf8') > 64) {
        return NextResponse.json(
          { error: `callback_data > 64 bytes : "${b.callback_data}"` },
          { status: 400 },
        )
      }
      rowOut.push({ text: b.text, callback_data: b.callback_data })
    }
    buttons.push(rowOut)
  }

  let chatId: number | null = body.chat_id ?? null
  if (!chatId && body.user_id) {
    const admin = getAdminClient()
    let q = admin
      .from('telegram_users')
      .select('chat_id, current_societe_id')
      .eq('user_id', body.user_id)
      .eq('verified', true)
    if (body.societe_id) q = q.eq('current_societe_id', body.societe_id)
    const { data } = await q.maybeSingle()
    if (!data) {
      return NextResponse.json({ error: 'Utilisateur non lié à Telegram' }, { status: 404 })
    }
    chatId = data.chat_id
  }

  try {
    const res = await sendTelegramInlineButtons(chatId!, body.text, buttons)
    return NextResponse.json({ ok: true, chat_id: chatId, telegram: res })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
