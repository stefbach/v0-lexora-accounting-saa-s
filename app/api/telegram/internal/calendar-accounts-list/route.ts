import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/calendar-accounts-list
 *
 * Liste les comptes Google liés à l'utilisateur (perso). L'agent appelle ce
 * tool quand l'user a plusieurs comptes pour proposer un choix avant un
 * create_event / list_events / find_slot.
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'calendar.accounts_list', async (ctx) => {
    const admin = getAdminClient()
    const { data } = await admin
      .from('user_oauth_accounts')
      .select('id, account_email, label, is_default_for_calendar, active, scopes, last_synced_at')
      .eq('user_id', ctx.user_id)
      .eq('provider', 'google')
      .eq('active', true)
      .order('is_default_for_calendar', { ascending: false })
      .order('created_at', { ascending: true })

    return {
      result: {
        count: data?.length || 0,
        accounts: (data || []).map((a: any) => ({
          id: a.id,
          email: a.account_email,
          label: a.label || a.account_email,
          is_default: !!a.is_default_for_calendar,
          last_synced_at: a.last_synced_at,
        })),
        connect_url: '/api/auth/google/init',
      },
    }
  })
}
