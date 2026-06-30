/**
 * Client Aurinko (https://aurinko.io) — API unifiée email + calendrier +
 * contacts multi-provider (Gmail, Office365/Outlook, MS Exchange, Apple
 * iCloud, Zoho, IMAP).
 *
 * Sert de socle pour remplacer Resend (envoi) et unifier l'agenda. Tout est
 * env-gated : sans AURINKO_CLIENT_ID/SECRET, isAurinkoConfigured() = false et
 * rien ne se déclenche → zéro impact sur l'existant.
 *
 * Auth : OAuth hébergé Aurinko. On obtient un accessToken PAR COMPTE connecté
 * (stocké chiffré dans user_oauth_accounts, provider='aurinko'). Les appels
 * API utilisent ce token en Bearer.
 */

const AURINKO_BASE = 'https://api.aurinko.io/v1'

export type AurinkoServiceType =
  | 'Google' | 'Office365' | 'Outlook.com' | 'MS Exchange' | 'iCloud' | 'Zoho Mail' | 'IMAP'

export function isAurinkoConfigured(): boolean {
  return !!(process.env.AURINKO_CLIENT_ID && process.env.AURINKO_CLIENT_SECRET)
}

/** Construit l'URL d'autorisation hébergée Aurinko (redirection navigateur). */
export function buildAurinkoAuthorizeUrl(args: {
  serviceType: AurinkoServiceType
  scopes: string[]
  returnUrl: string
  state: string
}): string {
  const clientId = process.env.AURINKO_CLIENT_ID
  if (!clientId) throw new Error('AURINKO_CLIENT_ID manquant')
  const p = new URLSearchParams({
    clientId,
    serviceType: args.serviceType,
    scopes: args.scopes.join(' '),
    responseType: 'code',
    returnUrl: args.returnUrl,
    state: args.state,
  })
  return `${AURINKO_BASE}/auth/authorize?${p.toString()}`
}

/** Échange le code d'autorisation contre un accessToken de compte. */
export async function exchangeAurinkoCode(code: string): Promise<{ accountId: number; accessToken: string }> {
  const clientId = process.env.AURINKO_CLIENT_ID
  const clientSecret = process.env.AURINKO_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('AURINKO_CLIENT_ID / AURINKO_CLIENT_SECRET manquants')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(`${AURINKO_BASE}/auth/token/${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Aurinko token exchange ${res.status}: ${txt.slice(0, 300)}`)
  }
  const d = await res.json() as { accountId?: number; accessToken?: string }
  if (!d.accessToken) throw new Error('Aurinko: accessToken absent de la réponse')
  return { accountId: d.accountId ?? 0, accessToken: d.accessToken }
}

/** Infos du compte connecté (email, provider) à partir du token. */
export async function getAurinkoAccount(token: string): Promise<{ email: string; serviceType: string; name?: string }> {
  const res = await fetch(`${AURINKO_BASE}/account`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Aurinko /account ${res.status}`)
  const d = await res.json() as { email?: string; serviceType?: string; name?: string }
  return { email: d.email || '', serviceType: d.serviceType || '', name: d.name }
}

export type AurinkoEmailMessage = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
  reply_to?: string
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}

/** Envoie un email via le compte Aurinko (provider sous-jacent transparent). */
export async function sendAurinkoEmail(
  token: string,
  msg: AurinkoEmailMessage,
): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  const body: Record<string, unknown> = {
    subject: msg.subject,
    body: msg.html,
    bodyType: 'html',
    to: msg.to.map((address) => ({ address })),
  }
  if (msg.cc?.length) body.cc = msg.cc.map((address) => ({ address }))
  if (msg.bcc?.length) body.bcc = msg.bcc.map((address) => ({ address }))
  if (msg.reply_to) body.replyTo = [{ address: msg.reply_to }]
  if (msg.attachments?.length) {
    body.attachments = msg.attachments.map((a) => ({
      fileName: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      content: a.content, // base64
      inline: false,
    }))
  }
  const res = await fetch(`${AURINKO_BASE}/email/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { ok: false, error: `Aurinko send ${res.status}: ${txt.slice(0, 300)}` }
  }
  const d = await res.json().catch(() => ({})) as { id?: string }
  return { ok: true, message_id: d.id }
}

/** Liste les messages (boîte interne). q supporte from:/to:/subject:/is:read… */
export async function listAurinkoMessages(
  token: string,
  opts: { q?: string; pageToken?: string; pageSize?: number } = {},
): Promise<{ records: unknown[]; nextPageToken?: string }> {
  const p = new URLSearchParams()
  if (opts.q) p.set('q', opts.q)
  if (opts.pageToken) p.set('pageToken', opts.pageToken)
  if (opts.pageSize) p.set('pageSize', String(opts.pageSize))
  const res = await fetch(`${AURINKO_BASE}/email/messages?${p.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Aurinko list messages ${res.status}`)
  const d = await res.json() as { records?: unknown[]; nextPageToken?: string }
  return { records: d.records || [], nextPageToken: d.nextPageToken }
}
