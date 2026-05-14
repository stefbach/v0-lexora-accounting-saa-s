import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/log
 *
 * Logge un message conversationnel dans telegram_sessions.
 * Appelé par n8n à la place d'une connexion Postgres directe (qui ne marche
 * pas depuis l'IPv4-only des VPS Hostinger).
 *
 * Auth: header X-Internal-Token = INTERNAL_API_TOKEN
 *
 * Body : {
 *   chat_id: number,
 *   societe_id?: uuid,
 *   role: 'user' | 'assistant' | 'tool' | 'system',
 *   content?: string,
 *   tool_name?: string,
 *   tool_input?: any,
 *   tool_output?: any,
 * }
 */
export async function POST(req: NextRequest) {
  const internalToken = req.headers.get('x-internal-token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  if (!body?.chat_id || !body?.role) {
    return NextResponse.json({ error: 'chat_id et role requis' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('telegram_sessions')
    .insert({
      chat_id: body.chat_id,
      societe_id: body.societe_id || null,
      role: body.role,
      content: body.content ?? null,
      tool_name: body.tool_name ?? null,
      tool_input: body.tool_input ?? null,
      tool_output: body.tool_output ?? null,
    })
    .select('id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at })
}
