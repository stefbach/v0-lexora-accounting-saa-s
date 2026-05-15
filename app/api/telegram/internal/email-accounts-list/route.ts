import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/email-accounts-list
 *
 * L'agent appelle ce tool quand l'utilisateur dit "envoie depuis quel email"
 * ou pour proposer un choix avant un envoi. Liste les comptes visibles à
 * l'utilisateur (société + ses comptes perso).
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'email.accounts_list', async (ctx) => {
    const admin = getAdminClient()
    const { data } = await admin
      .from('email_accounts')
      .select('id, label, from_email, from_name, provider, is_default_for_user, is_default_for_societe, active, user_id')
      .eq('societe_id', ctx.societe_id)
      .or(`user_id.is.null,user_id.eq.${ctx.user_id}`)
      .eq('active', true)
      .order('is_default_for_societe', { ascending: false })

    return {
      result: {
        count: data?.length || 0,
        accounts: (data || []).map((a: any) => ({
          id: a.id,
          label: a.label,
          from: a.from_name ? `${a.from_name} <${a.from_email}>` : a.from_email,
          provider: a.provider,
          scope: a.user_id ? 'personnel' : 'société',
          is_default: a.is_default_for_user || a.is_default_for_societe,
        })),
      },
    }
  })
}
