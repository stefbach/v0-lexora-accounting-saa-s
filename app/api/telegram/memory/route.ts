import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/memory?chat_id=<n>&limit=20
 *
 * Renvoie les N derniers messages de la conversation Telegram (ordre récent → ancien).
 * Auth: X-Internal-Token = INTERNAL_API_TOKEN
 */
export async function GET(req: NextRequest) {
  const internalToken = req.headers.get('x-internal-token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const chatId = req.nextUrl.searchParams.get('chat_id')
  if (!chatId) return NextResponse.json({ error: 'chat_id requis' }, { status: 400 })
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 20), 50)

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('telegram_sessions')
    .select('role, content, tool_name, tool_input, tool_output, created_at')
    .eq('chat_id', Number(chatId))
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data || [] })
}
