import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * Auth pour les endpoints /api/telegram/internal/*.
 *
 * Sécurité multi-couches :
 * 1. Header X-Internal-Token === process.env.INTERNAL_API_TOKEN
 * 2. chat_id passé en query ou body → résolu en user_id + role + societe_id
 *    via la table telegram_users + user_societes
 * 3. Le role retourné est utilisé par chaque endpoint pour vérifier la permission
 *
 * Returns { ctx } if OK, throws Response otherwise.
 */
export type TelegramContext = {
  chat_id: number
  user_id: string
  societe_id: string
  role: TelegramRole
  capabilities: string[]   // capabilities effectives (override > defaults rôle)
  language_code: 'fr' | 'en'
  telegram_firstname: string | null
  employe_id: string | null   // si l'user est un employé de la société
  manager_employes: string[]  // si manager : liste des employe_id sous sa responsabilité
}

export type TelegramRole =
  | 'employe'
  | 'manager'
  | 'rh'
  | 'comptable'
  | 'comptable_dedie'
  | 'direction'
  | 'client_admin'
  | 'admin'
  | 'super_admin'

/** Hierarchie de permissions */
export const ROLE_LEVEL: Record<TelegramRole, number> = {
  employe: 10,
  manager: 30,
  rh: 50,
  comptable: 50,
  comptable_dedie: 50,
  direction: 70,
  client_admin: 70,
  admin: 90,
  super_admin: 100,
}

export function hasRole(ctx: TelegramContext, min: TelegramRole): boolean {
  return ROLE_LEVEL[ctx.role] >= ROLE_LEVEL[min]
}

export async function resolveTelegramContext(req: NextRequest): Promise<TelegramContext> {
  const internalToken = req.headers.get('x-internal-token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    throw NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // chat_id peut être dans query string ou body
  let chatIdRaw = req.nextUrl.searchParams.get('chat_id')
  if (!chatIdRaw && req.method !== 'GET') {
    try {
      const body = await req.clone().json()
      chatIdRaw = body?.chat_id ?? null
    } catch {}
  }
  if (!chatIdRaw) {
    throw NextResponse.json({ error: 'chat_id requis' }, { status: 400 })
  }
  const chatId = Number(chatIdRaw)
  if (Number.isNaN(chatId)) {
    throw NextResponse.json({ error: 'chat_id invalide' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: tgUser, error: e1 } = await admin
    .from('telegram_users')
    .select('chat_id, user_id, current_societe_id, telegram_firstname, language_code, verified')
    .eq('chat_id', chatId)
    .eq('verified', true)
    .maybeSingle()
  if (e1) throw NextResponse.json({ error: e1.message }, { status: 500 })
  if (!tgUser) throw NextResponse.json({ error: 'Chat non vérifié' }, { status: 401 })
  if (!tgUser.current_societe_id) {
    throw NextResponse.json({ error: 'Aucune société active' }, { status: 400 })
  }

  // Récupère le rôle + override de capabilities dans la société active.
  // Si la colonne telegram_capabilities n'a pas été migrée (mig 266), on
  // retombe gracieusement sur le SELECT minimal et on utilise les defaults.
  let us: any = null
  {
    const res = await admin
      .from('user_societes')
      .select('role, telegram_capabilities')
      .eq('user_id', tgUser.user_id)
      .eq('societe_id', tgUser.current_societe_id)
      .maybeSingle()
    if (res.error && /telegram_capabilities/i.test(res.error.message || '')) {
      const fallback = await admin
        .from('user_societes')
        .select('role')
        .eq('user_id', tgUser.user_id)
        .eq('societe_id', tgUser.current_societe_id)
        .maybeSingle()
      us = fallback.data
    } else {
      us = res.data
    }
  }
  const role = (us?.role || 'employe') as TelegramRole
  const override = Array.isArray(us?.telegram_capabilities) ? (us!.telegram_capabilities as string[]) : null
  const capabilities = override ?? defaultCapabilitiesForRole(role)

  // Si employé, on récupère son employe_id
  let employe_id: string | null = null
  if (role === 'employe' || role === 'manager') {
    const { data: emp } = await admin
      .from('employes')
      .select('id')
      .eq('societe_id', tgUser.current_societe_id)
      .eq('user_id', tgUser.user_id)
      .maybeSingle()
    employe_id = emp?.id || null
  }

  // Si manager, on récupère la liste de ses subordonnés
  let manager_employes: string[] = []
  if (role === 'manager' && employe_id) {
    const { data: subs } = await admin
      .from('employes')
      .select('id')
      .eq('societe_id', tgUser.current_societe_id)
      .eq('manager_id', employe_id)
    manager_employes = (subs || []).map((s: any) => s.id)
  }

  return {
    chat_id: chatId,
    user_id: tgUser.user_id,
    societe_id: tgUser.current_societe_id,
    role,
    capabilities,
    language_code: (tgUser.language_code as 'fr' | 'en') || 'fr',
    telegram_firstname: tgUser.telegram_firstname,
    employe_id,
    manager_employes,
  }
}

/** Vérifie qu'une capability est présente dans les caps effectives du ctx.
 *  'ALL' chez admin/super_admin matche tout. */
export function hasCapability(ctx: TelegramContext, cap: string): boolean {
  if (ctx.capabilities.includes('ALL')) return true
  return ctx.capabilities.includes(cap)
}

function defaultCapabilitiesForRole(role: TelegramRole): string[] {
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

/**
 * Wrapper de handler : injecte le context Telegram + role, et log l'action
 * automatiquement (telegram_actions). Renvoie un middleware-style runner.
 */
export async function withTelegramAuth(
  req: NextRequest,
  intent: string,
  handler: (ctx: TelegramContext, body: any) => Promise<{ result: any; status?: 'success' | 'denied' | 'error'; error_msg?: string }>,
): Promise<NextResponse> {
  let ctx: TelegramContext
  try {
    ctx = await resolveTelegramContext(req)
  } catch (resp: any) {
    // Les erreurs d'auth (chat_id manquant, société active absente, etc.)
    // retournent désormais HTTP 200 avec { status: 'error', error_msg } pour
    // que le bot/LLM puisse relayer un message utile à l'utilisateur (axios
    // discarde le body sur 4xx → "Request failed with status code 400" sans
    // diagnostic). On préserve la compat avec les callers qui checkent
    // `error` dans le body.
    let body: any = { status: 'error', error_msg: 'Erreur authentification Telegram', result: null }
    if (resp instanceof Response) {
      try {
        const j = await (resp.clone() as Response).json()
        const msg = j?.error || j?.error_msg || 'Erreur authentification Telegram'
        body = {
          status: 'error',
          error_msg: msg,
          requires_setup: true,
          result: null,
          // hint utilisateur final selon le message
          user_message: msg.includes('société') || msg.includes('Société')
            ? "Ton compte Telegram n'a pas de société active. Va sur lexora.finance/client/societes pour en choisir une, puis redemande-moi."
            : msg.includes('vérifié') || msg.includes('Chat')
            ? "Ton chat Telegram n'est pas vérifié. Va sur lexora.finance/client/telegram-config pour le lier à ton compte."
            : msg,
        }
      } catch { /* keep default */ }
    }
    return NextResponse.json(body)
  }

  let body: any = null
  if (req.method !== 'GET') {
    try { body = await req.clone().json() } catch {}
  }

  const t0 = Date.now()
  const admin = getAdminClient()
  let status: 'success' | 'denied' | 'error' = 'success'
  let result: any = null
  let error_msg: string | undefined

  try {
    const out = await handler(ctx, body)
    result = out.result
    status = out.status || 'success'
    error_msg = out.error_msg
  } catch (e: any) {
    status = 'error'
    error_msg = e?.message || String(e)
    result = null
  }

  const duration_ms = Date.now() - t0

  // Audit log (best-effort, non-blocking)
  admin.from('telegram_actions').insert({
    chat_id: ctx.chat_id,
    user_id: ctx.user_id,
    societe_id: ctx.societe_id,
    intent,
    payload: body,
    result,
    status,
    error_msg,
    duration_ms,
  }).then(() => {}, () => {})

  // Erreurs handler : on retourne HTTP 200 (au lieu de 500) avec un
  // payload structuré pour que le LLM voie l'error_msg même quand axios
  // traite les 4xx/5xx comme des exceptions ("Request failed with status
  // code 500" sans body). Le LLM doit checker `status` pour distinguer.
  if (status === 'error') {
    return NextResponse.json({ status: 'error', error_msg, result: null })
  }
  if (status === 'denied') {
    return NextResponse.json({ status: 'denied', error_msg: error_msg || 'Permission refusée', result: null })
  }
  // Succès : on garde le shape historique (result inline) pour ne pas
  // casser les ~94 callers existants. Ajoute juste un champ `status` à la
  // racine si result est un objet (compat backward).
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return NextResponse.json({ status: 'success', ...result })
  }
  return NextResponse.json(result)
}
