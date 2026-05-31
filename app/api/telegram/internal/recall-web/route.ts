/**
 * POST /api/telegram/internal/recall-web
 *   body : { chat_id, limit?, hours_back? }
 *   → Lit les derniers tours de l'Expert WEB pour le user courant (et sa
 *     société active). Source : vw_agent_history_unified (mig 458),
 *     canal='web'. Permet à l'agent Telegram de "voir" ce que l'utilisateur
 *     a dit sur l'autre canal.
 *
 * Sécurité : HMAC + chat_id résolu en user_id+societe_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const hmac = await verifyHmac(req)
  if (!hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${hmac.reason}`, result: null },
      { status: 403 },
    )
  }
  return withTelegramAuth(req, 'recall_web', async (ctx, body) => {
    const limit = Math.min(30, Math.max(1, Number(body?.limit) || 15))
    const hoursBack = Math.min(720, Math.max(1, Number(body?.hours_back) || 72))
    const sinceIso = new Date(Date.now() - hoursBack * 3600_000).toISOString()

    const admin = getAdminClient()
    const { data, error } = await admin
      .from('vw_agent_history_unified')
      .select('canal, role, content, created_at')
      .eq('societe_id', ctx.societe_id)
      .eq('user_id', ctx.user_id)
      .eq('canal', 'web')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false }).limit(limit)
    if (error) {
      return { status: 'error', error_msg: `db: ${error.message} (vérifier mig 458)`, result: null }
    }
    return {
      status: 'success',
      result: {
        other_canal: 'web',
        nb_tours: (data || []).length,
        tours: [...(data || [])].reverse(), // ordre chronologique
      },
    }
  })
}
