import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import type { TelegramRole } from '@/lib/telegram/internal-auth'

/**
 * GET /api/client/telegram-permissions?societe_id=X
 *
 * Renvoie la liste des utilisateurs de la société avec :
 * - leur rôle dans cette société
 * - leur statut de liaison Telegram (lié / non lié)
 * - leurs capabilities calculées
 * - nb d'actions effectuées (audit log)
 *
 * Accès : admin, direction, client_admin de la société uniquement.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  await assertSocieteAccess(supabase, user.id, societeId)

  // Vérifier que le caller est admin/direction de cette société
  const { data: caller } = await supabase
    .from('user_societes')
    .select('role')
    .eq('user_id', user.id)
    .eq('societe_id', societeId)
    .maybeSingle()
  const callerRole = caller?.role || ''
  if (!['admin', 'super_admin', 'direction', 'client_admin'].includes(callerRole)) {
    return NextResponse.json({ error: 'Accès refusé. Rôle direction ou admin requis.' }, { status: 403 })
  }

  const admin = getAdminClient()

  // Tous les users liés à cette société
  const { data: members, error } = await admin
    .from('user_societes')
    .select('user_id, role, profiles!inner(id, full_name, email)')
    .eq('societe_id', societeId)
    .order('role')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Telegram links pour ces users
  const userIds = (members || []).map((m: any) => m.user_id)
  const { data: tgUsers } = await admin
    .from('telegram_users')
    .select('user_id, chat_id, telegram_username, telegram_firstname, language_code, last_seen_at, verified, current_societe_id')
    .in('user_id', userIds)
    .eq('verified', true)

  // Audit stats par user (nb actions, dernière action)
  const { data: actions } = await admin
    .from('telegram_actions')
    .select('user_id, intent, status')
    .eq('societe_id', societeId)
  const statsByUser = new Map<string, { total: number; success: number; denied: number; error: number }>()
  for (const a of actions || []) {
    const s = statsByUser.get(a.user_id) || { total: 0, success: 0, denied: 0, error: 0 }
    s.total++
    if (a.status === 'success') s.success++
    else if (a.status === 'denied') s.denied++
    else if (a.status === 'error') s.error++
    statsByUser.set(a.user_id, s)
  }

  const tgByUser = new Map((tgUsers || []).map((t: any) => [t.user_id, t]))

  const enriched = (members || []).map((m: any) => {
    const tg = tgByUser.get(m.user_id)
    const stats = statsByUser.get(m.user_id) || { total: 0, success: 0, denied: 0, error: 0 }
    return {
      user_id: m.user_id,
      full_name: m.profiles?.full_name || m.profiles?.email || 'Sans nom',
      email: m.profiles?.email || '',
      role: m.role as TelegramRole,
      capabilities: computeCapabilities(m.role),
      telegram: tg ? {
        linked: true,
        chat_id: tg.chat_id,
        telegram_username: tg.telegram_username,
        firstname: tg.telegram_firstname,
        language: tg.language_code,
        last_seen: tg.last_seen_at,
        active_for_this_societe: tg.current_societe_id === societeId,
      } : { linked: false },
      audit_stats: stats,
    }
  })

  // ── Liste des employés RH de la société (peuvent ne pas avoir de compte Lexora)
  // On retourne TOUS les employés actifs + leur statut auth/Telegram pour que
  // l'admin puisse leur générer un code de liaison Telegram à la volée.
  const { data: employes } = await admin
    .from('employes')
    .select('id, code, nom, prenom, poste, email, telephone, auth_user_id, date_depart')
    .eq('societe_id', societeId)
    .is('date_depart', null)
    .order('nom', { ascending: true })

  const employeeUserIds = (employes || []).map((e: any) => e.auth_user_id).filter(Boolean)
  let tgByEmpUser = new Map<string, any>()
  if (employeeUserIds.length > 0) {
    const { data: empTg } = await admin
      .from('telegram_users')
      .select('user_id, chat_id, telegram_username, telegram_firstname, verified, verification_code, verification_expires_at')
      .in('user_id', employeeUserIds)
    tgByEmpUser = new Map((empTg || []).map((t: any) => [t.user_id, t]))
  }
  const enrichedEmployes = (employes || []).map((e: any) => {
    const tg = e.auth_user_id ? tgByEmpUser.get(e.auth_user_id) : null
    return {
      employe_id: e.id,
      code: e.code,
      nom_complet: `${e.prenom || ''} ${e.nom || ''}`.trim() || 'Sans nom',
      poste: e.poste || null,
      email: e.email || null,
      telephone: e.telephone || null,
      has_auth_user: !!e.auth_user_id,
      auth_user_id: e.auth_user_id || null,
      telegram_status: tg?.verified
        ? 'linked'
        : tg?.verification_code && tg?.verification_expires_at && new Date(tg.verification_expires_at) > new Date()
          ? 'pending_code'
          : 'none',
      telegram_username: tg?.telegram_username || null,
      pending_code: !tg?.verified ? (tg?.verification_code || null) : null,
      pending_code_expires_at: !tg?.verified ? (tg?.verification_expires_at || null) : null,
    }
  })

  return NextResponse.json({
    members: enriched,
    employees: enrichedEmployes,
    role_matrix: ROLE_MATRIX,
    bot_username: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'LexoraBot',
  })
}

/**
 * PATCH /api/client/telegram-permissions?societe_id=X
 * Body: { user_id, role }
 * Modifie le rôle d'un utilisateur dans la société.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  await assertSocieteAccess(supabase, user.id, societeId)

  const { data: caller } = await supabase
    .from('user_societes')
    .select('role')
    .eq('user_id', user.id)
    .eq('societe_id', societeId)
    .maybeSingle()
  const callerRole = caller?.role || ''
  if (!['admin', 'super_admin', 'direction', 'client_admin'].includes(callerRole)) {
    return NextResponse.json({ error: 'Accès refusé. Rôle direction ou admin requis.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.user_id || !body?.role) {
    return NextResponse.json({ error: 'user_id et role requis' }, { status: 400 })
  }
  const allowedRoles = ['employe', 'manager', 'rh', 'comptable', 'comptable_dedie', 'direction', 'client_admin', 'admin']
  if (!allowedRoles.includes(body.role)) {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
  }

  // Empêche un user de modifier son propre rôle (sauf admin/super_admin)
  if (body.user_id === user.id && !['admin', 'super_admin'].includes(callerRole)) {
    return NextResponse.json({ error: 'Tu ne peux pas modifier ton propre rôle' }, { status: 403 })
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('user_societes')
    .update({ role: body.role })
    .eq('user_id', body.user_id)
    .eq('societe_id', societeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit trace
  await admin.from('telegram_actions').insert({
    chat_id: 0,
    user_id: user.id,
    societe_id: societeId,
    intent: 'admin.role_change',
    payload: { target_user_id: body.user_id, new_role: body.role },
    result: null,
    status: 'success',
  })

  return NextResponse.json({ ok: true })
}

// === Référentiel rôles + capabilities ===
function computeCapabilities(role: string): string[] {
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

const ROLE_MATRIX = {
  employe: { label: 'Employé', level: 10, color: 'gray',
    description: 'Voir ses bulletins de paie, soldes de congés, soumettre demande de congé, conseils fiscaux/RH généraux' },
  manager: { label: 'Manager', level: 30, color: 'blue',
    description: '+ KPIs équipe, valider/refuser congés de son équipe, voir échéances MRA' },
  rh: { label: 'RH', level: 50, color: 'amber',
    description: '+ Ajouter heures sup et primes, calculer paie, exports MRA paye/CSG/NSF/IT3' },
  comptable: { label: 'Comptable', level: 50, color: 'cyan',
    description: '+ KPIs financiers, soldes bancaires, créer factures, exports MRA, rapprochement' },
  comptable_dedie: { label: 'Comptable dédié', level: 50, color: 'cyan',
    description: 'Comptable interne — mêmes droits que comptable, mais lié à la société' },
  direction: { label: 'Direction', level: 70, color: 'emerald',
    description: '+ Valider paie, factures clients, soumettre déclarations MRA, gérer alertes proactives' },
  client_admin: { label: 'Dirigeant client', level: 70, color: 'emerald',
    description: 'Accès complet à sa société — équivalent direction' },
  admin: { label: 'Administrateur', level: 90, color: 'red',
    description: 'Tous droits Lexora — actions destructives autorisées' },
  super_admin: { label: 'Super Admin', level: 100, color: 'purple',
    description: 'Tous droits sur toutes sociétés' },
}
