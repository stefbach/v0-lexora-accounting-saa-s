/**
 * Client Nylas v3 (https://nylas.com) — API unifiée email + calendrier +
 * contacts multi-provider (Gmail, Microsoft/Outlook, IMAP, …) avec auth
 * hébergée (apps Google/Microsoft de Nylas déjà vérifiées → pas de procédure
 * de vérification côté Lexora).
 *
 * Modèle v3 :
 *  - Auth hébergée → on récupère un `grant_id` PAR compte connecté.
 *  - Tous les appels API utilisent la clé serveur NYLAS_API_KEY en Bearer,
 *    ciblant /v3/grants/{grant_id}/...
 *
 * Env-gated : sans NYLAS_API_KEY / NYLAS_CLIENT_ID, isNylasConfigured()=false
 * et rien ne se déclenche.
 */

function apiBase(): string {
  return (process.env.NYLAS_API_URI || 'https://api.us.nylas.com').replace(/\/+$/, '')
}

export function isNylasConfigured(): boolean {
  return !!(process.env.NYLAS_API_KEY && process.env.NYLAS_CLIENT_ID)
}

/** URL d'auth hébergée Nylas (redirection navigateur). */
export function buildNylasAuthUrl(args: { redirectUri: string; state: string; provider?: string; loginHint?: string }): string {
  const clientId = process.env.NYLAS_CLIENT_ID
  if (!clientId) throw new Error('NYLAS_CLIENT_ID manquant')
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    access_type: 'offline', // refresh token → jeton durable
  })
  if (args.provider) p.set('provider', args.provider)
  if (args.state) p.set('state', args.state)
  if (args.loginHint) p.set('login_hint', args.loginHint)
  return `${apiBase()}/v3/connect/auth?${p.toString()}`
}

/** Échange le code contre un grant (compte connecté). */
export async function exchangeNylasCode(code: string, redirectUri: string): Promise<{ grantId: string; email: string }> {
  const clientId = process.env.NYLAS_CLIENT_ID
  const apiKey = process.env.NYLAS_API_KEY
  if (!clientId || !apiKey) throw new Error('NYLAS_CLIENT_ID / NYLAS_API_KEY manquants')
  const res = await fetch(`${apiBase()}/v3/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: apiKey,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Nylas token exchange ${res.status}: ${txt.slice(0, 300)}`)
  }
  const d = await res.json() as { grant_id?: string; email?: string }
  if (!d.grant_id) throw new Error('Nylas: grant_id absent de la réponse')
  return { grantId: d.grant_id, email: d.email || '' }
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.NYLAS_API_KEY}`, 'Content-Type': 'application/json' }
}

export type NylasEmailMessage = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  reply_to?: string
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}

/** Envoie un email depuis un grant. */
export async function sendNylasEmail(grantId: string, msg: NylasEmailMessage): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  const body: Record<string, unknown> = {
    subject: msg.subject,
    body: msg.html,
    to: msg.to.map((email) => ({ email })),
  }
  if (msg.cc?.length) body.cc = msg.cc.map((email) => ({ email }))
  if (msg.bcc?.length) body.bcc = msg.bcc.map((email) => ({ email }))
  if (msg.reply_to) body.reply_to = [{ email: msg.reply_to }]
  if (msg.attachments?.length) {
    body.attachments = msg.attachments.map((a) => ({
      filename: a.filename,
      content_type: a.contentType || 'application/octet-stream',
      content: a.content, // base64
    }))
  }
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/messages/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { ok: false, error: `Nylas send ${res.status}: ${txt.slice(0, 300)}` }
  }
  const d = await res.json().catch(() => ({})) as { data?: { id?: string } }
  return { ok: true, message_id: d.data?.id }
}

/** Liste des messages (boîte interne). */
export async function listNylasMessages(grantId: string, opts: { limit?: number; pageToken?: string; q?: string } = {}): Promise<{ data: unknown[]; nextCursor?: string }> {
  const p = new URLSearchParams()
  if (opts.limit) p.set('limit', String(opts.limit))
  if (opts.pageToken) p.set('page_token', opts.pageToken)
  if (opts.q) p.set('search_query_native', opts.q)
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/messages?${p.toString()}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Nylas list messages ${res.status}`)
  const d = await res.json() as { data?: unknown[]; next_cursor?: string }
  return { data: d.data || [], nextCursor: d.next_cursor }
}
