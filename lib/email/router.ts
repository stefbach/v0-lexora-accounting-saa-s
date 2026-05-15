/**
 * Routeur d'envoi email multi-provider.
 *
 * Architecture :
 *  - Plusieurs comptes email par société (table email_accounts)
 *  - 3 providers : SMTP, Resend (par domaine), Gmail OAuth (TODO)
 *  - Sélection automatique : account_id explicite > default user > default société
 *    > fallback Resend global (env RESEND_API_KEY) si configuré, sinon erreur
 *
 * Audit : last_used_at + use_count updated par envoi succès.
 */
import { getAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/crypto/symmetric'

export type EmailMessage = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
  reply_to?: string
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}

export type EmailAccount = {
  id: string
  societe_id: string
  user_id: string | null
  label: string
  from_email: string
  from_name: string | null
  reply_to: string | null
  provider: 'smtp' | 'resend' | 'gmail_oauth'
  smtp_host: string | null
  smtp_port: number | null
  smtp_secure: boolean
  smtp_user: string | null
  smtp_password_enc: string | null
  resend_api_key_enc: string | null
  resend_domain: string | null
  is_default_for_user: boolean
  is_default_for_societe: boolean
  active: boolean
}

export type SendResult = {
  ok: boolean
  message_id?: string
  account_id?: string
  provider?: string
  error?: string
}

/**
 * Sélectionne le compte email à utiliser.
 * Priorité : explicit account_id > user default > société default > fallback Resend env
 */
export async function selectEmailAccount(args: {
  societe_id: string
  user_id?: string | null
  account_id?: string | null
}): Promise<EmailAccount | null> {
  const admin = getAdminClient()

  if (args.account_id) {
    const { data } = await admin.from('email_accounts').select('*')
      .eq('id', args.account_id).eq('active', true).maybeSingle()
    // Scope check : doit appartenir à la société (et à l'user si compte perso)
    if (!data) return null
    if (data.societe_id !== args.societe_id) return null
    if (data.user_id && data.user_id !== args.user_id) return null
    return data as EmailAccount
  }

  // 1. User default
  if (args.user_id) {
    const { data } = await admin.from('email_accounts').select('*')
      .eq('societe_id', args.societe_id)
      .eq('user_id', args.user_id)
      .eq('is_default_for_user', true)
      .eq('active', true)
      .maybeSingle()
    if (data) return data as EmailAccount
  }

  // 2. Société default
  const { data: socDefault } = await admin.from('email_accounts').select('*')
    .eq('societe_id', args.societe_id)
    .is('user_id', null)
    .eq('is_default_for_societe', true)
    .eq('active', true)
    .maybeSingle()
  if (socDefault) return socDefault as EmailAccount

  // 3. N'importe quel compte société actif
  const { data: anyActive } = await admin.from('email_accounts').select('*')
    .eq('societe_id', args.societe_id)
    .is('user_id', null)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (anyActive) return anyActive as EmailAccount

  return null
}

/** Envoie un email via le compte spécifié. */
export async function sendEmail(account: EmailAccount, msg: EmailMessage): Promise<SendResult> {
  try {
    let result: SendResult
    if (account.provider === 'smtp') {
      result = await sendViaSmtp(account, msg)
    } else if (account.provider === 'resend') {
      result = await sendViaResend(account, msg)
    } else if (account.provider === 'gmail_oauth') {
      return { ok: false, error: 'Gmail OAuth pas encore implémenté (Phase ultérieure)' }
    } else {
      return { ok: false, error: `Provider ${account.provider} inconnu` }
    }

    // Tracking succès best-effort
    if (result.ok) {
      const admin = getAdminClient()
      await admin.from('email_accounts').update({
        last_used_at: new Date().toISOString(),
        use_count: (await admin.from('email_accounts').select('use_count').eq('id', account.id).maybeSingle()).data?.use_count + 1 || 1,
      }).eq('id', account.id).then(() => {}, () => {})
    }
    return { ...result, account_id: account.id, provider: account.provider }
  } catch (e: any) {
    return { ok: false, error: e.message, account_id: account.id, provider: account.provider }
  }
}

/** Fallback : Resend global via env RESEND_API_KEY si pas de compte configuré. */
export async function sendEmailFallbackResend(msg: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'Aucun compte email configuré et RESEND_API_KEY absent' }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(key)
    const { data, error } = await resend.emails.send({
      from: 'Lexora <onboarding@resend.dev>',
      to: msg.to,
      cc: msg.cc,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.reply_to,
    } as any)
    if (error) return { ok: false, error: error.message, provider: 'resend' }
    return { ok: true, message_id: data?.id, provider: 'resend' }
  } catch (e: any) {
    return { ok: false, error: e.message, provider: 'resend' }
  }
}

// ============================================================================
// Provider implementations
// ============================================================================

async function sendViaSmtp(account: EmailAccount, msg: EmailMessage): Promise<SendResult> {
  if (!account.smtp_host || !account.smtp_port || !account.smtp_user || !account.smtp_password_enc) {
    return { ok: false, error: 'Configuration SMTP incomplète' }
  }
  const password = decryptSecret(account.smtp_password_enc)
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure,
    auth: { user: account.smtp_user, pass: password },
  })
  const from = account.from_name ? `"${account.from_name}" <${account.from_email}>` : account.from_email
  const info = await transport.sendMail({
    from,
    to: msg.to.join(','),
    cc: msg.cc?.join(','),
    bcc: msg.bcc?.join(','),
    replyTo: msg.reply_to || account.reply_to || undefined,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    attachments: msg.attachments,
  })
  return { ok: true, message_id: info.messageId }
}

async function sendViaResend(account: EmailAccount, msg: EmailMessage): Promise<SendResult> {
  if (!account.resend_api_key_enc) return { ok: false, error: 'Resend API key non configurée' }
  const apiKey = decryptSecret(account.resend_api_key_enc)
  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)
  const from = account.from_name ? `${account.from_name} <${account.from_email}>` : account.from_email
  const { data, error } = await resend.emails.send({
    from,
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    replyTo: msg.reply_to || account.reply_to || undefined,
  } as any)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message_id: data?.id }
}

/** Teste un compte en envoyant un email à l'adresse from_email lui-même. */
export async function testEmailAccount(account: EmailAccount): Promise<SendResult> {
  return sendEmail(account, {
    to: [account.from_email],
    subject: `[Lexora] Test du compte email "${account.label}"`,
    html: `<p>Si tu reçois ce message, le compte <b>${account.label}</b> (${account.provider}) est correctement configuré.</p>` +
          `<p>From: ${account.from_email}</p>` +
          `<p><small>Envoyé par Lexora à ${new Date().toLocaleString('fr-FR')}.</small></p>`,
    text: `Test du compte email "${account.label}" (${account.provider}) — configuration OK.`,
  })
}
