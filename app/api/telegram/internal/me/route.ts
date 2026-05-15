import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/me?chat_id=<n>
 *
 * Renvoie le contexte complet de l'utilisateur Telegram :
 * - id user Lexora, role, société active (nom)
 * - employé lié (si applicable) + nb subordonnés (manager)
 * - capabilities Telegram autorisées par son rôle
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'me.get', async (ctx) => {
    const admin = getAdminClient()
    const { data: soc } = await admin
      .from('societes')
      .select('nom, brn')
      .eq('id', ctx.societe_id)
      .maybeSingle()

    let employeName: string | null = null
    if (ctx.employe_id) {
      const { data: emp } = await admin
        .from('employes')
        .select('prenom, nom')
        .eq('id', ctx.employe_id)
        .maybeSingle()
      if (emp) employeName = `${emp.prenom} ${emp.nom}`.trim()
    }

    // Capabilities par rôle
    const caps = computeCapabilities(ctx.role)

    return {
      result: {
        chat_id: ctx.chat_id,
        user_id: ctx.user_id,
        societe: { id: ctx.societe_id, nom: soc?.nom, brn: soc?.brn },
        role: ctx.role,
        language: ctx.language_code,
        firstname: ctx.telegram_firstname,
        employe: ctx.employe_id ? { id: ctx.employe_id, name: employeName } : null,
        manager_team_size: ctx.manager_employes.length,
        capabilities: caps,
      },
    }
  })
}

function computeCapabilities(role: string) {
  const base = ['view_help', 'switch_societe', 'logout']
  switch (role) {
    case 'employe':
      return [...base, 'view_my_payslip', 'view_my_leave_balance', 'request_leave']
    case 'manager':
      return [...base, 'view_my_payslip', 'view_my_leave_balance', 'request_leave',
              'view_team_kpis', 'approve_team_leave', 'view_team_pending']
    case 'rh':
      return [...base, 'view_my_payslip', 'view_team_kpis', 'add_ot', 'add_bonus',
              'compute_payroll', 'export_mra', 'view_employees', 'manage_leave_settings']
    case 'comptable':
    case 'comptable_dedie':
      return [...base, 'view_kpis', 'view_bank', 'create_invoice', 'view_tax_calendar',
              'export_mra', 'reconcile_bank', 'view_audit_log']
    case 'direction':
    case 'client_admin':
      return [...base, 'view_kpis', 'view_bank', 'view_tax_calendar', 'create_invoice',
              'compute_payroll', 'approve_payroll', 'export_mra', 'approve_team_leave',
              'view_audit_log', 'manage_alerts_config']
    case 'admin':
    case 'super_admin':
      return ['ALL']
    default:
      return base
  }
}
