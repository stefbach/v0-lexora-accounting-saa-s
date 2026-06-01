/**
 * Helper Gmail — envoi d'emails sortants via l'API Gmail (scope gmail.send).
 *
 * Réutilise getGoogleAccessToken() de calendar-client : le refresh token et le
 * rafraîchissement automatique sont gérés au même endroit (table
 * user_oauth_accounts). On ne duplique donc PAS les tokens dans email_accounts —
 * un compte email gmail_oauth pointe vers son compte user_oauth_accounts via
 * (user_id, from_email).
 *
 * Scope requis : https://www.googleapis.com/auth/gmail.send
 *   → autorise users.messages.send mais PAS la lecture de la boîte.
 */
import { getGoogleAccessToken } from './calendar-client'

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

export type GmailMessage = {
  from_email: string
  from_name?: string | null
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
  reply_to?: string
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}

/** Encode un header non-ASCII en RFC 2047 (=?UTF-8?B?…?=). */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex -- on teste explicitement la plage ASCII
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function fromHeader(from_email: string, from_name?: string | null): string {
  if (!from_name) return from_email
  return `${encodeHeaderValue(from_name)} <${from_email}>`
}

/** base64url sans padding (format attendu par l'API Gmail pour `raw`). */
function base64url(input: Buffer | string): string {
  const b = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Construit le message MIME complet (RFC 2822) prêt à être base64url-encodé.
 *
 * Structure :
 *   multipart/mixed                (si pièces jointes)
 *     multipart/alternative        (si html + text)
 *       text/plain
 *       text/html
 *     <attachments>
 */
function buildMime(msg: GmailMessage): string {
  const boundaryAlt = `alt_${Math.random().toString(36).slice(2)}`
  const boundaryMixed = `mix_${Math.random().toString(36).slice(2)}`
  const hasAttachments = !!(msg.attachments && msg.attachments.length)
  const hasText = !!msg.text

  const headers: string[] = []
  headers.push(`From: ${fromHeader(msg.from_email, msg.from_name)}`)
  headers.push(`To: ${msg.to.join(', ')}`)
  if (msg.cc && msg.cc.length) headers.push(`Cc: ${msg.cc.join(', ')}`)
  if (msg.bcc && msg.bcc.length) headers.push(`Bcc: ${msg.bcc.join(', ')}`)
  if (msg.reply_to) headers.push(`Reply-To: ${msg.reply_to}`)
  headers.push(`Subject: ${encodeHeaderValue(msg.subject)}`)
  headers.push('MIME-Version: 1.0')

  // Corps « alternative » (texte + html) ou html simple
  function altBody(): string {
    if (hasText) {
      return [
        `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
        '',
        `--${boundaryAlt}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        base64Wrapped(msg.text!),
        `--${boundaryAlt}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        base64Wrapped(msg.html),
        `--${boundaryAlt}--`,
      ].join('\r\n')
    }
    return [
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64Wrapped(msg.html),
    ].join('\r\n')
  }

  if (!hasAttachments) {
    return [...headers, altBody()].join('\r\n')
  }

  // multipart/mixed avec pièces jointes
  const parts: string[] = []
  parts.push(...headers)
  parts.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`)
  parts.push('')
  parts.push(`--${boundaryMixed}`)
  parts.push(altBody())
  for (const att of msg.attachments!) {
    parts.push(`--${boundaryMixed}`)
    parts.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`)
    parts.push('Content-Transfer-Encoding: base64')
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`)
    parts.push('')
    // att.content est déjà supposé base64 (cf. EmailMessage.attachments)
    parts.push(att.content.replace(/(.{76})/g, '$1\r\n'))
  }
  parts.push(`--${boundaryMixed}--`)
  return parts.join('\r\n')
}

/** Encode en base64 avec retour à la ligne tous les 76 caractères (RFC 2045). */
function base64Wrapped(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
}

/**
 * Envoie un email via Gmail au nom de l'utilisateur `user_id` depuis l'adresse
 * `from_email` (qui doit être le compte Google connecté, scope gmail.send).
 *
 * @returns { message_id } l'id du message Gmail créé.
 */
export async function sendGmail(
  user_id: string,
  msg: GmailMessage,
): Promise<{ message_id: string }> {
  const { access_token } = await getGoogleAccessToken(user_id, msg.from_email)
  const raw = base64url(buildMime(msg))

  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    let parsed: any = null
    try { parsed = JSON.parse(txt) } catch { /* noop */ }
    const detail = parsed?.error?.message || txt.slice(0, 300) || `HTTP ${res.status}`
    if (res.status === 403 && /insufficient|scope|permission/i.test(detail)) {
      throw new Error(
        `Gmail refuse l'envoi (scope manquant) : reconnecte le compte Google via /client/settings/google-accounts pour accorder l'autorisation d'envoi d'emails. Détail : ${detail}`,
      )
    }
    throw new Error(`Gmail API ${res.status} : ${detail}`)
  }

  const json = (await res.json()) as { id: string }
  return { message_id: json.id }
}
