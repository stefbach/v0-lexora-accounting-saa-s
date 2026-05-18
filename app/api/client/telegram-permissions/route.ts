import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import type { TelegramRole } from '@/lib/telegram/internal-auth'

/**
 * GET /api/client/telegram-permissions?societe_id=X
 *
 * Renvoie les membres + employés RH de la société avec :
 *  - leur rôle et leurs capabilities effectives (override par user si défini)
 *  - leur statut Telegram (lié / pending / non lié)
 *  - le flag is_member (employé déjà rattaché à user_societes)
 *  - audit stats 30j
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

  const { data: caller } = await supabase
    .from('user_societes')
    .select('role')
    .eq('user_id', user.id)
    .eq('societe_id', societeId)
    .maybeSingle()
  const callerRole = caller?.role || ''
  if (!['admin', 'super_admin', 'direction', 'client_admin', 'client_assistant', 'rh'].includes(callerRole)) {
    return NextResponse.json({ error: 'Accès refusé. Rôle direction, RH ou admin requis.' }, { status: 403 })
  }

  const admin = getAdminClient()

  // Membres (user_societes) avec override de capabilities.
  // Si la colonne telegram_capabilities n'a pas encore été migrée (migration 266
  // pas appliquée), on retombe gracieusement sur le SELECT sans cette colonne :
  // les overrides ne fonctionneront pas mais l'UI reste utilisable.
  let members: any[] | null = null
  let capsColumnAvailable = true
  let membersErr: any = null
  {
    const res = await admin
      .from('user_societes')
      .select('user_id, role, telegram_capabilities, profiles!inner(id, full_name, email)')
      .eq('societe_id', societeId)
      .order('role')
    if (res.error && /telegram_capabilities/i.test(res.error.message || '')) {
      capsColumnAvailable = false
      const fallback = await admin
        .from('user_societes')
        .select('user_id, role, profiles!inner(id, full_name, email)')
        .eq('societe_id', societeId)
        .order('role')
      members = fallback.data as any[]
      membersErr = fallback.error
    } else {
      members = res.data as any[]
      membersErr = res.error
    }
  }
  if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 })

  const userIds = (members || []).map((m: any) => m.user_id)
  const { data: tgUsers } = await admin
    .from('telegram_users')
    .select('user_id, chat_id, telegram_username, telegram_firstname, language_code, last_seen_at, verified, current_societe_id')
    .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('verified', true)

  // Audit stats par user (30j)
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: actions } = await admin
    .from('telegram_actions')
    .select('user_id, intent, status')
    .eq('societe_id', societeId)
    .gte('created_at', since)
  const statsByUser = new Map<string, { total: number; success: number; denied: number; error: number }>()
  for (const a of actions || []) {
    if (!a.user_id) continue
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
    const override = Array.isArray(m.telegram_capabilities) ? m.telegram_capabilities as string[] : null
    return {
      user_id: m.user_id,
      full_name: m.profiles?.full_name || m.profiles?.email || 'Sans nom',
      email: m.profiles?.email || '',
      role: m.role as TelegramRole,
      default_capabilities: computeCapabilities(m.role),
      capabilities_override: override,
      effective_capabilities: override ?? computeCapabilities(m.role),
      is_custom: override !== null,
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

  // Set des user_ids membres pour dédup avec employés
  const memberUserIds = new Set(userIds)

  // Employés RH actifs (tous, on flag ensuite ceux qui sont déjà membres)
  const { data: employes } = await admin
    .from('employes')
    .select('id, code, nom, prenom, poste, email, telephone, auth_user_id, date_depart')
    .eq('societe_id', societeId)
    .is('date_depart', null)
    .order('nom', { ascending: true })

  const employeeUserIds = (employes || []).map((e: any) => e.auth_user_id).filter(Boolean)
  let tgByEmpUser = new Map<string, any>()
  let usMapByEmpUser = new Map<string, any>()
  if (employeeUserIds.length > 0) {
    const { data: empTg } = await admin
      .from('telegram_users')
      .select('user_id, chat_id, telegram_username, telegram_firstname, verified, verification_code, verification_expires_at')
      .in('user_id', employeeUserIds)
    tgByEmpUser = new Map((empTg || []).map((t: any) => [t.user_id, t]))
    // Fallback identique : on évite la colonne si elle n'est pas migrée
    const empUsRes = capsColumnAvailable
      ? await admin
          .from('user_societes')
          .select('user_id, role, telegram_capabilities')
          .eq('societe_id', societeId)
          .in('user_id', employeeUserIds)
      : await admin
          .from('user_societes')
          .select('user_id, role')
          .eq('societe_id', societeId)
          .in('user_id', employeeUserIds)
    usMapByEmpUser = new Map((empUsRes.data || []).map((r: any) => [r.user_id, r]))
  }

  const enrichedEmployes = (employes || []).map((e: any) => {
    const tg = e.auth_user_id ? tgByEmpUser.get(e.auth_user_id) : null
    const us = e.auth_user_id ? usMapByEmpUser.get(e.auth_user_id) : null
    const role = us?.role || null
    const override = Array.isArray(us?.telegram_capabilities) ? us.telegram_capabilities as string[] : null
    return {
      employe_id: e.id,
      code: e.code,
      nom_complet: `${e.prenom || ''} ${e.nom || ''}`.trim() || 'Sans nom',
      poste: e.poste || null,
      email: e.email || null,
      telephone: e.telephone || null,
      has_auth_user: !!e.auth_user_id,
      auth_user_id: e.auth_user_id || null,
      is_member: !!e.auth_user_id && memberUserIds.has(e.auth_user_id),
      role,
      default_capabilities: role ? computeCapabilities(role) : [],
      capabilities_override: override,
      effective_capabilities: override ?? (role ? computeCapabilities(role) : []),
      is_custom: override !== null,
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
    all_capabilities: ALL_CAPABILITIES,
    bot_username: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'LexoraBot',
    // Informe l'UI si les overrides de caps sont opérationnels (migration 266)
    capabilities_override_supported: capsColumnAvailable,
  })
}

/**
 * PATCH /api/client/telegram-permissions?societe_id=X
 *
 * Body : { user_id, role?, capabilities? }
 *  - role        : nouveau rôle (string)
 *  - capabilities: null = reset au défaut du rôle ; array = override custom
 *
 * Au moins un des deux champs requis.
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
  if (!['admin', 'super_admin', 'direction', 'client_admin', 'client_assistant', 'rh'].includes(callerRole)) {
    return NextResponse.json({ error: 'Accès refusé. Rôle direction, RH ou admin requis.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.user_id) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  const allowedRoles = ['employe', 'manager', 'rh', 'comptable', 'comptable_dedie', 'direction', 'client_admin', 'admin']
  if (body.role !== undefined) {
    if (!allowedRoles.includes(body.role)) {
      return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
    }
    if (body.user_id === user.id && !['admin', 'super_admin'].includes(callerRole)) {
      return NextResponse.json({ error: 'Tu ne peux pas modifier ton propre rôle' }, { status: 403 })
    }
    updates.role = body.role
  }
  if (body.capabilities !== undefined) {
    if (body.capabilities === null) {
      updates.telegram_capabilities = null
    } else if (Array.isArray(body.capabilities)) {
      const cleaned = body.capabilities
        .map((c: any) => String(c))
        .filter((c: string) => ALL_CAPABILITIES.includes(c) || c === 'ALL')
      updates.telegram_capabilities = cleaned
    } else {
      return NextResponse.json({ error: 'capabilities doit être un array ou null' }, { status: 400 })
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour (role ou capabilities requis)' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('user_societes')
    .update(updates)
    .eq('user_id', body.user_id)
    .eq('societe_id', societeId)
  if (error) {
    if (/telegram_capabilities/i.test(error.message || '')) {
      return NextResponse.json({
        error: 'La colonne user_societes.telegram_capabilities n\'existe pas encore. Exécute la migration supabase/migrations/266_user_telegram_capabilities.sql sur la DB pour activer les permissions personnalisées.',
      }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await admin.from('telegram_actions').insert({
    chat_id: 0,
    user_id: user.id,
    societe_id: societeId,
    intent: body.capabilities !== undefined ? 'admin.capabilities_change' : 'admin.role_change',
    payload: { target_user_id: body.user_id, updates },
    result: null,
    status: 'success',
  }).then(() => {}, () => {})

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

// Catalogue complet des capabilities exposables à l'UI (utilisé pour le modal de
// personnalisation). 'ALL' n'est PAS dans cette liste — c'est un drapeau spécial
// réservé aux rôles admin/super_admin.
const ALL_CAPABILITIES = [
  'view_help', 'switch_societe', 'logout',
  'view_my_payslip', 'view_my_leave_balance', 'request_leave',
  'view_team_kpis', 'approve_team_leave', 'view_team_pending',
  'view_kpis', 'view_bank', 'view_tax_calendar',
  'create_invoice', 'reconcile_bank',
  'add_ot', 'add_bonus', 'compute_payroll', 'approve_payroll',
  'export_mra', 'view_employees', 'manage_leave_settings',
  'view_audit_log', 'manage_alerts_config',
]

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
