import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/leave-balance?chat_id=<n>
 * Tout user (employé inclus) — renvoie soldes de congés
 * Annual Leave, Sick Leave, Vacation Leave, Maternity, Paternity, Family Medical Leave
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'leave.balance.get', async (ctx) => {
    if (!ctx.employe_id) {
      return { result: null, status: 'denied', error_msg: 'Aucun employé lié à votre compte' }
    }
    const admin = getAdminClient()
    // Soldes calculés via la vue v_soldes_conges_detail (al_acquis - al_pris).
    // Cette vue est la source de vérité ; les colonnes employes.al_solde
    // historiques n'existent pas/plus.
    const { data: soldes } = await admin
      .from('v_soldes_conges_detail')
      .select('prenom, nom, date_arrivee, al_solde, sl_solde, vl_solde')
      .eq('employe_id', ctx.employe_id)
      .order('annee', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!soldes) {
      // Fallback : récupère au moins l'identité depuis employes
      const { data: emp } = await admin
        .from('employes')
        .select('prenom, nom, date_arrivee')
        .eq('id', ctx.employe_id)
        .maybeSingle()
      if (!emp) return { result: null, status: 'error', error_msg: 'Employé introuvable' }
      return {
        result: {
          employe: `${emp.prenom} ${emp.nom}`.trim(),
          date_arrivee: emp.date_arrivee,
          soldes_jours: { annual_leave: 0, sick_leave: 0, vacation_leave: 0 },
          note: 'Aucun cycle de congés ouvert pour cet employé',
        },
      }
    }

    return {
      result: {
        employe: `${soldes.prenom} ${soldes.nom}`.trim(),
        date_arrivee: soldes.date_arrivee,
        soldes_jours: {
          annual_leave: Number(soldes.al_solde || 0),
          sick_leave: Number(soldes.sl_solde || 0),
          vacation_leave: Number(soldes.vl_solde || 0),
        },
      },
    }
  })
}
