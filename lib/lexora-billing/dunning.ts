/**
 * Relances Lexora — orchestrateur multi-canal.
 *
 * Canaux supportés :
 *  - email     : via Resend (RESEND_API_KEY)
 *  - telegram  : via TELEGRAM_BOT_TOKEN (l'utilisateur doit avoir un chat_id
 *                lié — table telegram_users) — sinon skip silencieux
 *  - sms       : via Twilio (TWILIO_SID / TWILIO_TOKEN / TWILIO_SMS_FROM)
 *                — stub si non configuré
 *  - whatsapp  : via Twilio WhatsApp Business (TWILIO_WHATSAPP_FROM)
 *                — stub si non configuré
 *
 * Chaque canal log dans `lexora_dunning_log` (status: sent/failed/skipped).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DunningChannel, LexoraInvoice } from './types'

interface SendDunningInput {
  supabaseAdmin: SupabaseClient
  invoice: LexoraInvoice
  channels: DunningChannel[]
  stage: string                  // 'J+7', 'J+15', 'J+30', 'manual'
  customMessage?: string
  triggeredBy?: string | null
}

interface ChannelResult {
  channel: DunningChannel
  status: 'sent' | 'failed' | 'skipped'
  provider?: string
  provider_msg_id?: string
  error?: string
  recipient: string
}

export async function sendDunning(input: SendDunningInput): Promise<ChannelResult[]> {
  const { supabaseAdmin, invoice, channels, stage } = input
  const results: ChannelResult[] = []

  const baseMessage = input.customMessage ||
    `Rappel : la facture ${invoice.invoice_number} d'un montant de ${invoice.amount_ttc.toLocaleString('fr-FR')} ${invoice.devise} ` +
    `est arrivée à échéance le ${invoice.due_date}. Merci d'effectuer le règlement par virement bancaire en mentionnant la référence ${invoice.invoice_number}.`

  for (const channel of channels) {
    let res: ChannelResult
    try {
      if (channel === 'email')       res = await sendEmail(invoice, baseMessage)
      else if (channel === 'telegram') res = await sendTelegram(supabaseAdmin, invoice, baseMessage)
      else if (channel === 'sms')      res = await sendSms(invoice, baseMessage)
      else if (channel === 'whatsapp') res = await sendWhatsapp(invoice, baseMessage)
      else res = { channel, status: 'skipped', recipient: '', error: `Canal inconnu` }
    } catch (e: any) {
      res = { channel, status: 'failed', recipient: '', error: e?.message || String(e) }
    }
    results.push(res)

    // Log
    await supabaseAdmin.from('lexora_dunning_log').insert({
      invoice_id: invoice.id,
      channel,
      recipient: res.recipient,
      stage,
      message: baseMessage,
      status: res.status,
      provider: res.provider,
      provider_msg_id: res.provider_msg_id,
      error: res.error,
      created_by: input.triggeredBy,
    })
  }

  return results
}

// ────────────────────────────────────────────────────────────────────
// EMAIL — Resend
// ────────────────────────────────────────────────────────────────────
async function sendEmail(invoice: LexoraInvoice, message: string): Promise<ChannelResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || 'Lexora Billing <billing@lexora.finance>'
  const to = invoice.customer_snapshot?.dirigeant_email
  if (!to) return { channel: 'email', status: 'skipped', recipient: '', error: 'pas d\'email client' }
  if (!apiKey) return { channel: 'email', status: 'skipped', recipient: to, error: 'RESEND_API_KEY manquant' }

  const subject = `Relance facture ${invoice.invoice_number} — ${invoice.customer_snapshot.nom}`
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1F2937; max-width: 600px;">
      <h2 style="color: #0B0F2E;">Rappel de paiement</h2>
      <p>Bonjour ${invoice.customer_snapshot?.dirigeant_nom || ''},</p>
      <p>${message}</p>
      <p style="margin-top: 24px;">
        <strong>Montant à régler :</strong> ${invoice.amount_ttc.toLocaleString('fr-FR')} ${invoice.devise}<br/>
        <strong>Échéance :</strong> ${invoice.due_date}<br/>
        <strong>Référence à mentionner :</strong> ${invoice.invoice_number}
      </p>
      <p style="color: #6B7280; font-size: 12px; margin-top: 32px;">
        ${invoice.issuer_snapshot.raison_sociale} — ${invoice.issuer_snapshot.banque_nom || ''} —
        IBAN ${invoice.issuer_snapshot.iban || ''}
      </p>
    </div>
  `.trim()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { channel: 'email', status: 'failed', recipient: to, provider: 'resend', error: t.slice(0, 300) }
  }
  const j = await res.json().catch(() => ({}))
  return { channel: 'email', status: 'sent', recipient: to, provider: 'resend', provider_msg_id: j?.id }
}

// ────────────────────────────────────────────────────────────────────
// TELEGRAM — bot existant
// ────────────────────────────────────────────────────────────────────
async function sendTelegram(supabaseAdmin: SupabaseClient, invoice: LexoraInvoice, message: string): Promise<ChannelResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { channel: 'telegram', status: 'skipped', recipient: '', error: 'TELEGRAM_BOT_TOKEN manquant' }

  // Trouve le chat_id du dirigeant (table telegram_users si elle existe).
  let chatId: string | null = null
  if (invoice.client_user_id) {
    const { data } = await supabaseAdmin
      .from('telegram_users')
      .select('chat_id')
      .eq('user_id', invoice.client_user_id)
      .maybeSingle()
    chatId = (data as { chat_id?: string | null } | null)?.chat_id || null
  }
  if (!chatId) return { channel: 'telegram', status: 'skipped', recipient: '', error: 'pas de chat_id lié' }

  const text = `🔔 *Rappel facture ${invoice.invoice_number}*\n\n${message}`
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { channel: 'telegram', status: 'failed', recipient: chatId, provider: 'telegram_bot', error: t.slice(0, 300) }
  }
  const j = await res.json().catch(() => ({}))
  return { channel: 'telegram', status: 'sent', recipient: chatId, provider: 'telegram_bot', provider_msg_id: String(j?.result?.message_id || '') }
}

// ────────────────────────────────────────────────────────────────────
// SMS — Twilio
// ────────────────────────────────────────────────────────────────────
async function sendSms(invoice: LexoraInvoice, message: string): Promise<ChannelResult> {
  const sid = process.env.TWILIO_SID
  const token = process.env.TWILIO_TOKEN
  const from = process.env.TWILIO_SMS_FROM
  const to = invoice.customer_snapshot?.telephone
  if (!to) return { channel: 'sms', status: 'skipped', recipient: '', error: 'pas de téléphone client' }
  if (!sid || !token || !from) return { channel: 'sms', status: 'skipped', recipient: to, error: 'Twilio non configuré (TWILIO_SID/TWILIO_TOKEN/TWILIO_SMS_FROM)' }

  const params = new URLSearchParams({ From: from, To: to, Body: message })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
    },
    body: params.toString(),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { channel: 'sms', status: 'failed', recipient: to, provider: 'twilio_sms', error: t.slice(0, 300) }
  }
  const j = await res.json().catch(() => ({}))
  return { channel: 'sms', status: 'sent', recipient: to, provider: 'twilio_sms', provider_msg_id: j?.sid }
}

// ────────────────────────────────────────────────────────────────────
// WHATSAPP — Twilio WhatsApp Business
// ────────────────────────────────────────────────────────────────────
async function sendWhatsapp(invoice: LexoraInvoice, message: string): Promise<ChannelResult> {
  const sid = process.env.TWILIO_SID
  const token = process.env.TWILIO_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const to = invoice.customer_snapshot?.telephone
  if (!to) return { channel: 'whatsapp', status: 'skipped', recipient: '', error: 'pas de téléphone client' }
  if (!sid || !token || !from) return { channel: 'whatsapp', status: 'skipped', recipient: to, error: 'Twilio WhatsApp non configuré (TWILIO_WHATSAPP_FROM)' }

  const params = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${to}`,
    Body: message,
  })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
    },
    body: params.toString(),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { channel: 'whatsapp', status: 'failed', recipient: to, provider: 'twilio_whatsapp', error: t.slice(0, 300) }
  }
  const j = await res.json().catch(() => ({}))
  return { channel: 'whatsapp', status: 'sent', recipient: to, provider: 'twilio_whatsapp', provider_msg_id: j?.sid }
}
