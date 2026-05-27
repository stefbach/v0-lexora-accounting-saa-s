import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * GET /api/telegram/internal/bank?chat_id=<n>
 * Rôle requis : comptable+
 */
export async function GET(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'bank.balance', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Soldes bancaires réservés aux managers et plus' }
    }
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('comptes_bancaires')
      // FIX colonnes : 'libelle' n'existe pas → 'nom_compte' (mig 010).
      //                'derniere_maj' n'existe pas → 'date_dernier_releve'.
      .select('id, nom_compte, banque, iban, solde_actuel, devise, date_dernier_releve')
      .eq('societe_id', ctx.societe_id)
      .order('solde_actuel', { ascending: false })

    if (error) return { result: null, status: 'error', error_msg: error.message }

    const total_mur = (data || [])
      .filter((c: any) => c.devise === 'MUR' || !c.devise)
      .reduce((s: number, c: any) => s + Number(c.solde_actuel || 0), 0)

    return {
      result: {
        comptes: (data || []).map((c: any) => ({
          libelle: c.nom_compte, banque: c.banque, iban: c.iban,
          solde: Number(c.solde_actuel || 0), devise: c.devise || 'MUR',
          last_update: c.date_dernier_releve,
        })),
        total_mur: Math.round(total_mur),
      },
    }
  })
}
