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

// Lecture robuste des variables d'env : trim des espaces parasites (copier-
// coller dans Vercel) qui cassaient l'URL ('...com /v3') et le client_id ('+').
function env(name: string): string { return (process.env[name] || '').trim() }
function apiBase(): string {
  return (env('NYLAS_API_URI') || 'https://api.us.nylas.com').replace(/\/+$/, '')
}
function clientId(): string { return env('NYLAS_CLIENT_ID') }
function apiKey(): string { return env('NYLAS_API_KEY') }

export function isNylasConfigured(): boolean {
  return !!(apiKey() && clientId())
}

/** URL d'auth hébergée Nylas (redirection navigateur). */
export function buildNylasAuthUrl(args: { redirectUri: string; state: string; provider?: string; loginHint?: string }): string {
  const cid = clientId()
  if (!cid) throw new Error('NYLAS_CLIENT_ID manquant')
  const p = new URLSearchParams({
    client_id: cid,
    redirect_uri: args.redirectUri,
    response_type: 'code',
  })
  if (args.provider) p.set('provider', args.provider)
  if (args.state) p.set('state', args.state)
  if (args.loginHint) p.set('login_hint', args.loginHint)
  return `${apiBase()}/v3/connect/auth?${p.toString()}`
}

/** Échange le code contre un grant (compte connecté). */
export async function exchangeNylasCode(code: string, redirectUri: string): Promise<{ grantId: string; email: string }> {
  const cid = clientId()
  const key = apiKey()
  if (!cid || !key) throw new Error('NYLAS_CLIENT_ID / NYLAS_API_KEY manquants')
  const res = await fetch(`${apiBase()}/v3/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cid,
      client_secret: key,
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
  return { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' }
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

/** Participant Nylas (from/to/cc). */
type NylasParticipant = { name?: string; email?: string }

/** Message Nylas brut (champs utilisés). */
type NylasRawMessage = {
  id?: string
  thread_id?: string
  subject?: string
  snippet?: string
  body?: string
  from?: NylasParticipant[]
  to?: NylasParticipant[]
  cc?: NylasParticipant[]
  reply_to?: NylasParticipant[]
  date?: number // epoch seconds
  unread?: boolean
  starred?: boolean
  folders?: string[]
}

/** Message normalisé pour l'UI / l'agent IA. */
export type MailMessage = {
  id: string
  threadId: string | null
  subject: string
  snippet: string
  body: string
  from: NylasParticipant | null
  to: NylasParticipant[]
  cc: NylasParticipant[]
  replyTo: NylasParticipant[]
  date: string | null // ISO
  unread: boolean
  starred: boolean
  folders: string[]
}

function normalizeMessage(m: NylasRawMessage): MailMessage {
  return {
    id: m.id || '',
    threadId: m.thread_id || null,
    subject: m.subject || '(sans objet)',
    snippet: m.snippet || '',
    body: m.body || '',
    from: m.from?.[0] || null,
    to: m.to || [],
    cc: m.cc || [],
    replyTo: m.reply_to || [],
    date: typeof m.date === 'number' ? new Date(m.date * 1000).toISOString() : null,
    unread: !!m.unread,
    starred: !!m.starred,
    folders: m.folders || [],
  }
}

/** Liste des messages (boîte interne), normalisés. */
export async function listNylasMessages(grantId: string, opts: { limit?: number; pageToken?: string; q?: string } = {}): Promise<{ data: MailMessage[]; nextCursor?: string }> {
  const p = new URLSearchParams()
  p.set('limit', String(opts.limit || 25))
  if (opts.pageToken) p.set('page_token', opts.pageToken)
  if (opts.q) p.set('search_query_native', opts.q)
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/messages?${p.toString()}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Nylas list messages ${res.status}`)
  const d = await res.json() as { data?: NylasRawMessage[]; next_cursor?: string }
  return { data: (d.data || []).map(normalizeMessage), nextCursor: d.next_cursor }
}

/** Récupère un message complet (corps inclus). */
export async function getNylasMessage(grantId: string, messageId: string): Promise<MailMessage> {
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/messages/${encodeURIComponent(messageId)}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Nylas get message ${res.status}`)
  const d = await res.json() as { data?: NylasRawMessage }
  return normalizeMessage(d.data || {})
}
