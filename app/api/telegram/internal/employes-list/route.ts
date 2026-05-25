import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * GET /api/telegram/internal/employes-list
 *
 * Liste les employés actifs de la société. Rôle min : manager (équipe) ou RH+ (tous).
 */
export async function GET(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'employes.list', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Liste employés réservée aux managers et plus' }
    }
    const admin = getAdminClient()
    let q = admin.from('employes')
      .select('id, code, prenom, nom, poste, email, date_arrivee, manager_id, salaire_base, devise')
      .eq('societe_id', ctx.societe_id)
      .is('date_depart', null)
      .order('nom', { ascending: true })

    // Manager simple : limité à son équipe
    if (ctx.role === 'manager' && ctx.manager_employes.length > 0) {
      q = q.in('id', ctx.manager_employes)
    }

    const { data, error } = await q
    if (error) return { result: null, status: 'error', error_msg: error.message }

    return {
      result: {
        count: data?.length || 0,
        employes: data || [],
      },
    }
  })
}
