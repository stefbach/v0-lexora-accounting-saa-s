import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { selectEmailAccount, sendEmail, sendEmailFallbackResend } from '@/lib/email/router'

/**
 * POST /api/telegram/internal/email-send
 *
 * Tool agent — envoi d'un email via les comptes email_accounts configurés.
 * Rôle minimum : comptable.
 *
 * Body :
 *   - to            : string | string[] (max 5)
 *   - cc            : string[] (optionnel, max 3)
 *   - subject       : string
 *   - html          : string
 *   - text          : string (optionnel)
 *   - reply_to      : string (optionnel)
 *   - account_id    : string (optionnel — sélection compte explicite)
 *
 * Sélection compte : account_id > default user > default société > fallback Resend env.
 * Whitelist destinataires : factures_contacts ou profiles Lexora (anti-spam).
 */
const MAX_RECIPIENTS = 5
const MAX_CC = 3
const MAX_HTML = 50_000

function normalizeEmails(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.map(x => String(x))
  return []
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function isWhitelisted(email: string, societe_id: string): Promise<boolean> {
  const admin = getAdminClient()
  const { data: c } = await admin.from('factures_contacts').select('id')
    .eq('societe_id', societe_id).eq('email', email.toLowerCase()).maybeSingle()
  if (c) return true
  const { data: p } = await admin.from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle()
  return !!p
}

export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'email.send', async (ctx, body) => {
    if (!hasRole(ctx, 'comptable')) {
      return { result: null, status: 'denied', error_msg: 'Envoi d\'email réservé aux comptables et plus' }
    }
    const to = normalizeEmails(body?.to).filter(e => EMAIL_RE.test(e)).slice(0, MAX_RECIPIENTS)
    const cc = normalizeEmails(body?.cc).filter(e => EMAIL_RE.test(e)).slice(0, MAX_CC)
    const subject = String(body?.subject || '').trim().slice(0, 200)
    const html = String(body?.html || '').slice(0, MAX_HTML)
    const text = body?.text ? String(body.text).slice(0, MAX_HTML) : undefined
    const reply_to = body?.reply_to ? String(body.reply_to) : undefined
    const account_id = body?.account_id ? String(body.account_id) : undefined

    if (to.length === 0) return { result: null, status: 'error', error_msg: 'au moins un destinataire valide requis' }
    if (!subject) return { result: null, status: 'error', error_msg: 'subject requis' }
    if (!html) return { result: null, status: 'error', error_msg: 'html requis' }

    // Anti-XSS
    if (/<script\b/i.test(html) || /\bon\w+=/i.test(html)) {
      return { result: null, status: 'error', error_msg: 'HTML interdit (script ou handler inline)' }
    }

    // Whitelist destinataires
    const checks = await Promise.all([...to, ...cc].map(e => isWhitelisted(e, ctx.societe_id)))
    const unauthorized = [...to, ...cc].filter((_, i) => !checks[i])
    if (unauthorized.length > 0) {
      return {
        result: null, status: 'denied',
        error_msg: `Destinataires non autorisés : ${unauthorized.join(', ')}. Ajoute-les comme contact dans Lexora d'abord.`,
      }
    }

    // Sélection compte + envoi
    const account = await selectEmailAccount({ societe_id: ctx.societe_id, user_id: ctx.user_id, account_id })
    const msg = { to, cc, subject, html, text, reply_to }
    const result = account
      ? await sendEmail(account, msg)
      : await sendEmailFallbackResend(msg)

    if (!result.ok) {
      return { result: null, status: 'error', error_msg: result.error || 'Envoi échoué' }
    }

    // Audit cross-canal
    const admin = getAdminClient()
    await admin.from('notifications').insert({
      destinataire_id: ctx.user_id, destinataire_type: 'client',
      societe_id: ctx.societe_id, type: 'telegram_agent_email',
      titre: subject, message: text?.slice(0, 500) || html.replace(/<[^>]+>/g, '').slice(0, 500),
      niveau: 'info', envoye_email: true, cron_name: null,
    }).then(() => {}, () => {})

    return {
      result: {
        message_id: result.message_id,
        account_id: result.account_id || null,
        provider: result.provider,
        from: account ? account.from_email : 'onboarding@resend.dev (fallback)',
        to, cc, subject,
      },
    }
  })
}
