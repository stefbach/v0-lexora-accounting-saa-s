import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/bank?chat_id=<n>
 * Rôle requis : comptable+
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'bank.balance', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Soldes bancaires réservés aux managers et plus' }
    }
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('comptes_bancaires')
      .select('id, libelle, banque, iban, solde_actuel, devise, derniere_maj')
      .eq('societe_id', ctx.societe_id)
      .order('solde_actuel', { ascending: false })

    if (error) return { result: null, status: 'error', error_msg: error.message }

    const total_mur = (data || [])
      .filter((c: any) => c.devise === 'MUR' || !c.devise)
      .reduce((s: number, c: any) => s + Number(c.solde_actuel || 0), 0)

    return {
      result: {
        comptes: (data || []).map((c: any) => ({
          libelle: c.libelle, banque: c.banque, iban: c.iban,
          solde: Number(c.solde_actuel || 0), devise: c.devise || 'MUR',
          last_update: c.derniere_maj,
        })),
        total_mur: Math.round(total_mur),
      },
    }
  })
}
