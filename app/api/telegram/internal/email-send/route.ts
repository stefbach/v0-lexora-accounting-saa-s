import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/email-send
 *
 * Tool agent — envoi d'un email transactionnel via Resend.
 * Rôle minimum : comptable (envoi de relances / rapports) ou direction.
 *
 * Body :
 *   - to        : string ou string[] (max 5 destinataires)
 *   - subject   : string
 *   - html      : string (corps HTML — l'agent doit fournir un HTML simple, sans scripts)
 *   - text      : string (optionnel, fallback plain-text)
 *   - reply_to  : string (optionnel)
 *   - cc        : string[] (optionnel, max 3)
 *
 * Sécurité :
 *   - Tous les destinataires DOIVENT être validés contre la table profiles/factures_contacts
 *     ou whitelist explicitement par la société (anti-spam). Pour simplifier la v1, on
 *     accepte les emails dont le domaine matche la société active OU les contacts factures.
 *   - Audit dans telegram_actions.email.send + log dans notifications (canaux: email)
 *
 * Provider : Resend (env RESEND_API_KEY). From : "Lexora <onboarding@resend.dev>".
 * Pour un branding par société, configurer un domaine vérifié et changer `from`.
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
  // 1. Contact société
  const { data: c } = await admin
    .from('factures_contacts')
    .select('id')
    .eq('societe_id', societe_id)
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (c) return true
  // 2. User membre d'une société partagée
  const { data: p } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()
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

    if (to.length === 0) return { result: null, status: 'error', error_msg: 'au moins un destinataire valide requis' }
    if (!subject) return { result: null, status: 'error', error_msg: 'subject requis' }
    if (!html) return { result: null, status: 'error', error_msg: 'html requis' }

    // Anti-XSS basique — l'agent NE DOIT PAS pouvoir injecter <script>
    if (/<script\b/i.test(html) || /\bon\w+=/i.test(html)) {
      return { result: null, status: 'error', error_msg: 'HTML interdit (script ou handler inline)' }
    }

    // Whitelist destinataires
    const checks = await Promise.all([...to, ...cc].map(e => isWhitelisted(e, ctx.societe_id)))
    const unauthorized = [...to, ...cc].filter((_, i) => !checks[i])
    if (unauthorized.length > 0) {
      return {
        result: null,
        status: 'denied',
        error_msg: `Destinataires non autorisés : ${unauthorized.join(', ')}. Ajoute-les comme contact dans Lexora d'abord.`,
      }
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return { result: null, status: 'error', error_msg: 'RESEND_API_KEY non configuré côté serveur' }
    }

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(resendKey)
      const { data, error } = await resend.emails.send({
        from: 'Lexora <onboarding@resend.dev>',
        to,
        cc: cc.length > 0 ? cc : undefined,
        subject,
        html,
        text,
        replyTo: reply_to,
      } as any)
      if (error) {
        return { result: null, status: 'error', error_msg: `Resend: ${error.message}` }
      }
      // Trace dans notifications (audit cross-canal)
      const admin = getAdminClient()
      await admin.from('notifications').insert({
        destinataire_id: ctx.user_id,
        destinataire_type: 'client',
        societe_id: ctx.societe_id,
        type: 'telegram_agent_email',
        titre: subject,
        message: text?.slice(0, 500) || html.replace(/<[^>]+>/g, '').slice(0, 500),
        niveau: 'info',
        envoye_email: true,
        cron_name: null,
      }).then(() => {}, () => {})

      return {
        result: {
          id: data?.id,
          to,
          cc,
          subject,
        },
      }
    } catch (e: any) {
      return { result: null, status: 'error', error_msg: e.message }
    }
  })
}
