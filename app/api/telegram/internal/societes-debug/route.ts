import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/societes-debug?chat_id=<n>
 *
 * Diagnostic : montre exactement combien de lignes chaque voie multi-tenant
 * retourne pour cet utilisateur. À utiliser quand societes-list renvoie 0
 * alors que l'utilisateur a clairement des sociétés liées.
 */
export async function GET(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'societes.debug', async (ctx) => {
    const admin = getAdminClient()
    const userId = ctx.user_id
    const safe = async (label: string, q: any) => {
      try {
        const r = await q
        if (r?.error) return { label, count: 0, error: r.error.message }
        return { label, count: (r?.data || []).length, sample: (r?.data || []).slice(0, 3) }
      } catch (e: any) {
        return { label, count: 0, error: e?.message || String(e) }
      }
    }
    const voies = await Promise.all([
      safe('user_societes', admin.from('user_societes').select('societe_id, role').eq('user_id', userId)),
      safe('dossiers.client_id', admin.from('dossiers').select('societe_id').eq('client_id', userId)),
      safe('societes.created_by', admin.from('societes').select('id, nom').eq('created_by', userId)),
      safe('dossiers.comptable_id', admin.from('dossiers').select('societe_id').eq('comptable_id', userId)),
      safe('comptable_societes', admin.from('comptable_societes').select('societe_id').eq('comptable_id', userId)),
      safe('societes.comptable_id', admin.from('societes').select('id, nom').eq('comptable_id', userId)),
      safe('cabinet_collaborateurs_acces', admin.from('cabinet_collaborateurs_acces').select('societe_id').eq('collaborateur_id', userId)),
      safe('profiles.comptable_id (clients gérés)', admin.from('profiles').select('id, role').eq('comptable_id', userId)),
    ])
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, comptable_id, full_name, email')
      .eq('id', userId)
      .maybeSingle()
    return {
      result: {
        user_id: userId,
        chat_id: ctx.chat_id,
        current_societe_id: ctx.societe_id,
        profile,
        voies,
      },
    }
  })
}
