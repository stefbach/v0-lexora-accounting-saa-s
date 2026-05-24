import { getAdminClient } from '@/lib/supabase/admin'
import { safeBearer } from '@/lib/security/safe-equal'

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

export function assertWebhookSecret(headerSecret: string | null) {
  if (!SECRET) throw new Error('TELEGRAM_WEBHOOK_SECRET not configured on server')
  // SEC-004 : comparaison en temps constant pour empêcher timing attacks
  if (!safeBearer(headerSecret, SECRET)) {
    throw Object.assign(new Error('Invalid webhook secret'), { status: 403 })
  }
}

export async function resolveChatContext(chatId: number) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('telegram_users')
    .select('chat_id, user_id, current_societe_id, verified, language_code, telegram_firstname')
    .eq('chat_id', chatId)
    .eq('verified', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function logAction(args: {
  chat_id: number
  user_id?: string | null
  societe_id?: string | null
  intent: string
  payload?: unknown
  result?: unknown
  status: 'success' | 'denied' | 'error' | 'pending'
  error_msg?: string
  duration_ms?: number
}) {
  const admin = getAdminClient()
  await admin.from('telegram_actions').insert({
    chat_id: args.chat_id,
    user_id: args.user_id ?? null,
    societe_id: args.societe_id ?? null,
    intent: args.intent,
    payload: args.payload ?? null,
    result: args.result ?? null,
    status: args.status,
    error_msg: args.error_msg ?? null,
    duration_ms: args.duration_ms ?? null,
  })
}

export function telegramApi(method: string) {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`
}

export async function sendTelegramMessage(
  chat_id: number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  const res = await fetch(telegramApi('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', ...extra }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`)
  }
  return res.json()
}

export async function sendTelegramDocument(
  chat_id: number,
  fileUrl: string,
  caption?: string,
) {
  const res = await fetch(telegramApi('sendDocument'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, document: fileUrl, caption, parse_mode: 'HTML' }),
  })
  if (!res.ok) throw new Error(`Telegram sendDocument failed: ${res.status}`)
  return res.json()
}

/**
 * Upload un buffer (PDF, XLSX, CSV) en pièce jointe Telegram via multipart.
 * Utilisé pour bulletins de paie, factures, exports MRA générés à la volée.
 */
export async function sendTelegramDocumentBuffer(
  chat_id: number,
  buffer: ArrayBuffer | Uint8Array | Buffer,
  filename: string,
  contentType: string,
  caption?: string,
) {
  const blob = new Blob([buffer as any], { type: contentType })
  const form = new FormData()
  form.set('chat_id', String(chat_id))
  if (caption) {
    form.set('caption', caption)
    form.set('parse_mode', 'HTML')
  }
  form.set('document', blob, filename)
  const res = await fetch(telegramApi('sendDocument'), { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram sendDocument(buffer) failed: ${res.status} ${body}`)
  }
  return res.json()
}

/**
 * Inline keyboard button — `callback_data` est limité à 64 bytes par Telegram.
 * Format conventionnel utilisé par Lexora : `intent:param1:param2`
 *   ex : leave.approve:abc-123 / payroll.approve:2025-05:confirm
 */
export type InlineButton = { text: string; callback_data: string }

/**
 * Envoie un message Telegram avec un inline keyboard.
 * `buttons` est un tableau 2D : chaque sous-tableau = une rangée de boutons.
 */
export async function sendTelegramInlineButtons(
  chat_id: number,
  text: string,
  buttons: InlineButton[][],
  extra: Record<string, unknown> = {},
) {
  const res = await fetch(telegramApi('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
      ...extra,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram sendInlineButtons failed: ${res.status} ${body}`)
  }
  return res.json()
}

/**
 * Répond à une callback_query (toast / popup confirmation Telegram).
 */
export async function answerCallbackQuery(
  callback_query_id: string,
  text?: string,
  show_alert = false,
) {
  const res = await fetch(telegramApi('answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id, text, show_alert }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram answerCallbackQuery failed: ${res.status} ${body}`)
  }
  return res.json()
}

/**
 * Édite le texte d'un message existant — utilisé pour "griser" un message
 * après clic sur un bouton (retire le keyboard et reformule).
 */
export async function editMessageText(
  chat_id: number,
  message_id: number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  const res = await fetch(telegramApi('editMessageText'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      message_id,
      text,
      parse_mode: 'HTML',
      ...extra,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram editMessageText failed: ${res.status} ${body}`)
  }
  return res.json()
}
