import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/telegram/health-check
 *
 * Diagnostic E2E du pipeline bot Telegram Lexora.
 * Accessible uniquement aux admin/super_admin.
 *
 * Vérifie en parallèle :
 *   1. TELEGRAM_BOT_TOKEN valide (getMe)
 *   2. Webhook Telegram configuré + last_error_message
 *   3. Tables DB accessibles (telegram_users, telegram_actions, telegram_alerts_config)
 *   4. n8n agent webhook joignable (HEAD)
 *   5. INTERNAL_API_TOKEN + TELEGRAM_WEBHOOK_SECRET définis
 *   6. ANTHROPIC_API_KEY définie (pour n8n agent)
 *   7. Stats : nb users vérifiés, nb actions 24h, nb erreurs 24h
 *
 * Retour : { ok: boolean, checks: [...], stats: {...} }
 */
type CheckResult = { name: string; ok: boolean; detail?: string }

async function getMe(): Promise<CheckResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { name: 'telegram_bot_token', ok: false, detail: 'TELEGRAM_BOT_TOKEN absent' }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' })
    const j = await r.json()
    if (!j.ok) return { name: 'telegram_bot_token', ok: false, detail: j.description || 'invalid' }
    return { name: 'telegram_bot_token', ok: true, detail: `@${j.result.username}` }
  } catch (e: any) {
    return { name: 'telegram_bot_token', ok: false, detail: e.message }
  }
}

async function getWebhookInfo(): Promise<CheckResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { name: 'telegram_webhook', ok: false, detail: 'no token' }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { cache: 'no-store' })
    const j = await r.json()
    if (!j.ok) return { name: 'telegram_webhook', ok: false, detail: j.description }
    const info = j.result
    if (!info.url) return { name: 'telegram_webhook', ok: false, detail: 'webhook url non configuré' }
    if (info.last_error_message) {
      return { name: 'telegram_webhook', ok: false, detail: `last_error: ${info.last_error_message}` }
    }
    return {
      name: 'telegram_webhook',
      ok: true,
      detail: `${info.url} (pending=${info.pending_update_count})`,
    }
  } catch (e: any) {
    return { name: 'telegram_webhook', ok: false, detail: e.message }
  }
}

async function checkN8nWebhook(): Promise<CheckResult> {
  const url = process.env.N8N_TELEGRAM_AGENT_WEBHOOK
  if (!url) return { name: 'n8n_agent_webhook', ok: false, detail: 'N8N_TELEGRAM_AGENT_WEBHOOK absent' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    // n8n peut renvoyer 404 sur HEAD selon config ; tant que la résolution réussit, on considère OK
    return { name: 'n8n_agent_webhook', ok: r.status < 500, detail: `HTTP ${r.status}` }
  } catch (e: any) {
    return { name: 'n8n_agent_webhook', ok: false, detail: `unreachable: ${e.message}` }
  }
}

function checkEnv(): CheckResult[] {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'INTERNAL_API_TOKEN',
    'ANTHROPIC_API_KEY',
    'N8N_TELEGRAM_AGENT_WEBHOOK',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
  ]
  return required.map(name => ({
    name: `env.${name}`,
    ok: !!process.env[name],
    detail: process.env[name] ? `set (len=${(process.env[name] as string).length})` : 'missing',
  }))
}

async function checkDb(): Promise<CheckResult[]> {
  const admin = getAdminClient()
  const tables = ['telegram_users', 'telegram_actions', 'telegram_alerts_config']
  const out: CheckResult[] = []
  for (const t of tables) {
    try {
      const { error } = await admin.from(t).select('*', { count: 'exact', head: true })
      out.push({ name: `db.${t}`, ok: !error, detail: error?.message })
    } catch (e: any) {
      out.push({ name: `db.${t}`, ok: false, detail: e.message })
    }
  }
  return out
}

async function gatherStats() {
  const admin = getAdminClient()
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const [users, actions, errors] = await Promise.all([
    admin.from('telegram_users').select('*', { count: 'exact', head: true }).eq('verified', true),
    admin.from('telegram_actions').select('*', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('telegram_actions').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('status', 'error'),
  ])
  return {
    verified_users: users.count || 0,
    actions_24h: actions.count || 0,
    errors_24h: errors.count || 0,
  }
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!['admin', 'super_admin'].includes(profile?.role || '')) {
    return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 })
  }

  const [tg, webhook, n8n, db] = await Promise.all([
    getMe(),
    getWebhookInfo(),
    checkN8nWebhook(),
    checkDb(),
  ])
  const envChecks = checkEnv()
  const stats = await gatherStats()

  const checks = [tg, webhook, n8n, ...envChecks, ...db]
  const ok = checks.every(c => c.ok)
  return NextResponse.json({ ok, checks, stats })
}
