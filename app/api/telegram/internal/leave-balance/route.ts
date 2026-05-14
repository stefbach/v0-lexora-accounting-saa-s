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
    const { data: emp } = await admin
      .from('employes')
      .select('prenom, nom, al_solde, sl_solde, vl_solde, fml_solde, ml_solde, pl_solde, date_arrivee')
      .eq('id', ctx.employe_id)
      .maybeSingle()

    if (!emp) return { result: null, status: 'error', error_msg: 'Employé introuvable' }

    return {
      result: {
        employe: `${emp.prenom} ${emp.nom}`.trim(),
        date_arrivee: emp.date_arrivee,
        soldes_jours: {
          annual_leave: Number(emp.al_solde || 0),
          sick_leave: Number(emp.sl_solde || 0),
          vacation_leave: Number(emp.vl_solde || 0),
          family_medical_leave: Number(emp.fml_solde || 0),
          maternity_leave: Number(emp.ml_solde || 0),
          paternity_leave: Number(emp.pl_solde || 0),
        },
      },
    }
  })
}
