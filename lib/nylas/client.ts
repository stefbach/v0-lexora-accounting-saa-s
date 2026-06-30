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

type NylasRawAttachment = { id?: string; filename?: string; content_type?: string; size?: number; is_inline?: boolean; content_id?: string }

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
  attachments?: NylasRawAttachment[]
}

export type MailAttachment = { id: string; filename: string; contentType: string; size: number; isInline: boolean }

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
  attachments: MailAttachment[]
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
    attachments: (m.attachments || [])
      .filter((a) => a.id && !a.is_inline)
      .map((a) => ({ id: a.id || '', filename: a.filename || 'piece-jointe', contentType: a.content_type || 'application/octet-stream', size: a.size || 0, isInline: !!a.is_inline })),
  }
}

/** Liste des messages (boîte interne), normalisés. */
export async function listNylasMessages(grantId: string, opts: { limit?: number; pageToken?: string; q?: string; folderId?: string; unread?: boolean; receivedAfter?: number } = {}): Promise<{ data: MailMessage[]; nextCursor?: string }> {
  const p = new URLSearchParams()
  p.set('limit', String(opts.limit || 25))
  if (opts.pageToken) p.set('page_token', opts.pageToken)
  if (opts.q) p.set('search_query_native', opts.q)
  if (opts.folderId) p.set('in', opts.folderId)
  if (opts.unread !== undefined) p.set('unread', String(opts.unread))
  if (opts.receivedAfter) p.set('received_after', String(opts.receivedAfter))
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

/** Modifie un message (lu/non-lu, étoile, dossiers). */
export async function updateNylasMessage(
  grantId: string,
  messageId: string,
  patch: { unread?: boolean; starred?: boolean; folders?: string[] },
): Promise<void> {
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Nylas update message ${res.status}: ${txt.slice(0, 200)}`)
  }
}

/** Supprime un message (corbeille / suppression selon le provider). */
export async function deleteNylasMessage(grantId: string, messageId: string): Promise<void> {
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Nylas delete message ${res.status}: ${txt.slice(0, 200)}`)
  }
}

/** Télécharge une pièce jointe (renvoie le binaire + le content-type). */
export async function downloadNylasAttachment(grantId: string, attachmentId: string, messageId: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const url = `${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/attachments/${encodeURIComponent(attachmentId)}/download?message_id=${encodeURIComponent(messageId)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } })
  if (!res.ok) throw new Error(`Nylas download attachment ${res.status}`)
  return { buffer: await res.arrayBuffer(), contentType: res.headers.get('content-type') || 'application/octet-stream' }
}

export type MailFolder = { id: string; name: string; attributes?: string[]; totalCount?: number; unreadCount?: number }

/** Liste les dossiers/labels de la boîte. */
export async function listNylasFolders(grantId: string): Promise<MailFolder[]> {
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/folders`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Nylas list folders ${res.status}`)
  const d = await res.json() as { data?: Array<{ id?: string; name?: string; attributes?: string[]; total_count?: number; unread_count?: number }> }
  return (d.data || []).map((f) => ({
    id: f.id || '', name: f.name || '', attributes: f.attributes || [], totalCount: f.total_count, unreadCount: f.unread_count,
  }))
}

// ---------------------------------------------------------------------------
// Calendrier (Nylas Calendar v3)
// ---------------------------------------------------------------------------

export type NylasCalendar = { id: string; name: string; isPrimary: boolean; readOnly: boolean }

export async function listNylasCalendars(grantId: string): Promise<NylasCalendar[]> {
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/calendars?limit=50`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Nylas list calendars ${res.status}`)
  const d = await res.json() as { data?: Array<{ id?: string; name?: string; is_primary?: boolean; read_only?: boolean }> }
  return (d.data || []).map((c) => ({ id: c.id || '', name: c.name || '', isPrimary: !!c.is_primary, readOnly: !!c.read_only }))
}

export type CalEvent = {
  id: string
  title: string
  description: string
  location: string
  start: string | null // ISO
  end: string | null   // ISO
  allDay: boolean
  participants: Array<{ name?: string; email?: string; status?: string }>
  conferenceUrl: string | null
  status: string
}

type RawEvent = {
  id?: string; title?: string; description?: string; location?: string; status?: string
  when?: { object?: string; start_time?: number; end_time?: number; start_date?: string; end_date?: string }
  participants?: Array<{ name?: string; email?: string; status?: string }>
  conferencing?: { details?: { url?: string }; url?: string }
}

function normalizeEvent(e: RawEvent): CalEvent {
  const w = e.when || {}
  const allDay = w.object === 'date' || w.object === 'datespan'
  return {
    id: e.id || '',
    title: e.title || '(sans titre)',
    description: e.description || '',
    location: e.location || '',
    start: typeof w.start_time === 'number' ? new Date(w.start_time * 1000).toISOString() : (w.start_date || null),
    end: typeof w.end_time === 'number' ? new Date(w.end_time * 1000).toISOString() : (w.end_date || null),
    allDay,
    participants: e.participants || [],
    conferenceUrl: e.conferencing?.details?.url || e.conferencing?.url || null,
    status: e.status || '',
  }
}

export async function listNylasEvents(grantId: string, calendarId: string, startEpoch: number, endEpoch: number): Promise<CalEvent[]> {
  const p = new URLSearchParams({ calendar_id: calendarId, start: String(startEpoch), end: String(endEpoch), limit: '100' })
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/events?${p.toString()}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Nylas list events ${res.status}`)
  const d = await res.json() as { data?: RawEvent[] }
  return (d.data || []).map(normalizeEvent)
}

export type CreateEventInput = {
  calendarId: string
  title: string
  description?: string
  location?: string
  startEpoch: number
  endEpoch: number
  participants?: string[]
  conferencing?: 'meet' | 'zoom' | null
}

export async function createNylasEvent(grantId: string, input: CreateEventInput): Promise<CalEvent> {
  const body: Record<string, unknown> = {
    title: input.title,
    when: { start_time: input.startEpoch, end_time: input.endEpoch },
  }
  if (input.description) body.description = input.description
  if (input.location) body.location = input.location
  if (input.participants?.length) body.participants = input.participants.map((email) => ({ email }))
  if (input.conferencing) {
    body.conferencing = { provider: input.conferencing === 'zoom' ? 'Zoom Meeting' : 'Google Meet', autocreate: {} }
  }
  const p = new URLSearchParams({ calendar_id: input.calendarId })
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/events?${p.toString()}`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Nylas create event ${res.status}: ${txt.slice(0, 300)}`)
  }
  const d = await res.json() as { data?: RawEvent }
  return normalizeEvent(d.data || {})
}

export type BusySlot = { start: number; end: number } // epoch secondes

/** Périodes occupées d'un compte sur une plage (pour calcul de créneaux). */
export async function nylasFreeBusy(grantId: string, email: string, startEpoch: number, endEpoch: number): Promise<BusySlot[]> {
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/calendars/free-busy`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ start_time: startEpoch, end_time: endEpoch, emails: [email] }),
  })
  if (!res.ok) throw new Error(`Nylas free-busy ${res.status}`)
  const d = await res.json() as { data?: Array<{ time_slots?: Array<{ start_time?: number; end_time?: number; status?: string }> }> }
  const slots = d.data?.[0]?.time_slots || []
  return slots
    .filter((s) => typeof s.start_time === 'number' && typeof s.end_time === 'number')
    .map((s) => ({ start: s.start_time as number, end: s.end_time as number }))
}

export async function deleteNylasEvent(grantId: string, eventId: string, calendarId: string): Promise<void> {
  const p = new URLSearchParams({ calendar_id: calendarId })
  const res = await fetch(`${apiBase()}/v3/grants/${encodeURIComponent(grantId)}/events/${encodeURIComponent(eventId)}?${p.toString()}`, {
    method: 'DELETE', headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) throw new Error(`Nylas delete event ${res.status}`)
}
