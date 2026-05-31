/**
 * POST /api/telegram/internal/web-handoff
 *   body : { chat_id, message, context? }
 *   → Crée un agent_handoff_tokens (24h, single-use) qui pré-charge un
 *     message dans l'Expert web Lexora. Retourne l'URL à présenter à
 *     l'utilisateur dans Telegram.
 *
 * Sécurité : HMAC + chat_id résolu en user_id+societe_id (withTelegramAuth).
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const hmac = await verifyHmac(req)
  if (!hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${hmac.reason}`, result: null },
      { status: 403 },
    )
  }
  return withTelegramAuth(req, 'web_handoff', async (ctx, body) => {
    const message = String(body?.message || '').trim()
    if (!message) return { status: 'error', error_msg: 'message requis', result: null }

    const admin = getAdminClient()
    const token = randomBytes(18).toString('base64url')
    const expires = new Date(Date.now() + 24 * 3600_000).toISOString()
    const { error } = await admin.from('agent_handoff_tokens').insert({
      token, societe_id: ctx.societe_id, user_id: ctx.user_id,
      source_canal: 'telegram', target_canal: 'web',
      message, context: body?.context || {},
      expires_at: expires, created_by: ctx.user_id,
    })
    if (error) {
      return { status: 'error', error_msg: `db: ${error.message} (vérifier mig 458)`, result: null }
    }
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.LEXORA_BASE_URL || ''
    const url = `${base}/client/agent-comptable?handoff=${token}`
    return { status: 'success', result: { token, url, expires_at: expires } }
  })
}
