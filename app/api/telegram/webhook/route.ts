import { NextRequest, NextResponse } from 'next/server'
import {
  assertWebhookSecret,
  resolveChatContext,
  sendTelegramMessage,
  sendTelegramInlineButtons,
  sendTelegramDocumentBuffer,
  logAction,
  answerCallbackQuery,
  editMessageText,
} from '@/lib/telegram/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { ingestTelegramDocument } from '@/lib/telegram/document-ingest'

// Le webhook Telegram doit répondre vite (Telegram retransmet sinon).
// Le pipeline OCR canonique est appelé en fire-and-forget côté ingest.
export const maxDuration = 60
import { memoryRecall, formatMemoriesForPrompt } from '@/lib/telegram/memory'
import { transcribeTelegramVoice } from '@/lib/telegram/voice-transcribe'
import { detectPointageIntent, isExpensesListCommand } from '@/lib/telegram/pointage-nlp'
import { captionLooksLikeExpense } from '@/lib/telegram/expense-ocr'
import { runLexoraAgent } from '@/lib/telegram/lexora-agent'

/**
 * POST /api/telegram/webhook
 *
 * Endpoint appelé par Telegram (ou par n8n qui sert de relais).
 * - Vérifie le secret X-Telegram-Bot-Api-Secret-Token
 * - Résout chat_id → user_id + societe_id
 * - Gère les commandes système (/start CODE, /societe, /help, /logout)
 * - Tout le reste est transmis à n8n qui orchestre l'AI Agent + tools
 */
export async function POST(req: NextRequest) {
  try {
    assertWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 })
  }

  const update = await req.json().catch(() => null)
  if (!update) return NextResponse.json({ ok: true })

  const msg = update.message || update.callback_query?.message
  const fromUser = update.message?.from || update.callback_query?.from
  if (!msg || !fromUser) return NextResponse.json({ ok: true })

  const chatId: number = msg.chat.id

  // --- Callback query (clic sur inline button) --------------------------------
  // On gère AVANT le reste : un callback_query n'est PAS une commande slash.
  if (update.callback_query) {
    return await handleCallbackQuery(update.callback_query)
  }

  const text: string = update.message?.text || ''

  // --- Commande /start CODE ----------------------------------------------------
  if (text.startsWith('/start')) {
    const parts = text.trim().split(/\s+/)
    const code = parts[1]?.toUpperCase()
    if (!code) {
      await sendTelegramMessage(chatId,
        '👋 Bienvenue sur <b>Lexora Bot</b>.\n\n' +
        'Pour vous connecter, générez un code de vérification depuis votre espace ' +
        'Lexora (Profil → Telegram) puis tapez :\n<code>/start CODE</code>')
      return NextResponse.json({ ok: true })
    }
    return await handleStartVerification(chatId, code, fromUser)
  }

  // --- Commande /societe -------------------------------------------------------
  if (text.startsWith('/societe')) {
    return await handleSocieteSelect(chatId, text.replace(/^\/societe\s*/, '').trim())
  }

  // --- Commande /help ----------------------------------------------------------
  if (text === '/help') {
    await sendTelegramMessage(chatId, buildHelp())
    return NextResponse.json({ ok: true })
  }

  // --- Commande /logout --------------------------------------------------------
  if (text === '/logout') {
    const admin = getAdminClient()
    await admin.from('telegram_users').delete().eq('chat_id', chatId)
    await sendTelegramMessage(chatId, '✅ Déconnecté. Tape /start CODE pour te reconnecter.')
    return NextResponse.json({ ok: true })
  }

  // --- Auth requise pour le reste ----------------------------------------------
  const ctx = await resolveChatContext(chatId)
  if (!ctx) {
    await sendTelegramMessage(chatId,
      '⚠️ Compte non vérifié. Génère un code dans Lexora (Profil → Telegram) puis tape <code>/start CODE</code>.')
    return NextResponse.json({ ok: true })
  }

  if (!ctx.current_societe_id) {
    await sendTelegramMessage(chatId,
      'Aucune société active. Tape <code>/societe</code> pour en choisir une.')
    return NextResponse.json({ ok: true })
  }

  // --- Voice message → Whisper transcribe → forward as text -------------------
  const tgVoice = update.message?.voice
  if (tgVoice) {
    return await handleVoiceMessage(chatId, ctx, tgVoice, update.message)
  }

  // --- Document / photo → ingestion OCR ----------------------------------------
  const tgDoc = update.message?.document
  const tgPhoto = update.message?.photo // array of PhotoSize
  if (tgDoc || tgPhoto) {
    return await handleDocumentMessage(chatId, ctx.user_id, ctx.current_societe_id, tgDoc, tgPhoto, update.message?.caption)
  }

  // --- Commande /in /out /pointage_in /pointage_out + langage naturel ----------
  const pointageIntent = detectPointageIntent(text)
  if (pointageIntent) {
    return await handlePointageCommand(chatId, ctx, pointageIntent)
  }

  // --- Commande /notes_de_frais (liste des notes de frais en cours) -----------
  if (isExpensesListCommand(text)) {
    return await handleExpensesList(chatId, ctx)
  }

  await forwardToN8nAgent(chatId, ctx, update.message, text, {})
  return NextResponse.json({ ok: true })
}

/**
 * Forward un message (texte ou texte-issu-d'un-vocal-transcrit) à l'agent IA n8n.
 * Centralisé pour pouvoir être appelé aussi depuis le handler voice.
 *
 * extras : champs additionnels insérés dans le payload (ex: is_voice, voice_duration_ms).
 * Si `overrideMessage` est fourni, on l'utilise comme `message` du payload n8n
 * (utilisé après transcription vocale : on injecte un message synthétique au
 * format Telegram avec `text` préfixé "[Vocal] ").
 */
async function forwardToN8nAgent(
  chatId: number,
  ctx: Awaited<ReturnType<typeof resolveChatContext>>,
  originalMessage: any,
  textForMemoryQuery: string,
  extras: Record<string, unknown> & { overrideMessage?: any },
) {
  if (!ctx) return

  const admin = getAdminClient()
  const [usRes, socRes] = await Promise.all([
    admin
      .from('user_societes')
      .select('role, telegram_capabilities')
      .eq('user_id', ctx.user_id)
      .eq('societe_id', ctx.current_societe_id!)
      .maybeSingle(),
    admin
      .from('societes')
      .select('id, nom, brn')
      .eq('id', ctx.current_societe_id!)
      .maybeSingle(),
  ])
  let usRow: any = usRes.data
  if (usRes.error && /telegram_capabilities/i.test(usRes.error.message || '')) {
    const fallback = await admin
      .from('user_societes')
      .select('role')
      .eq('user_id', ctx.user_id)
      .eq('societe_id', ctx.current_societe_id!)
      .maybeSingle()
    usRow = fallback.data
  }
  const socRow = socRes.data
  const role = (usRow?.role || 'employe') as keyof typeof ROLE_LABELS
  const capabilities = Array.isArray(usRow?.telegram_capabilities)
    ? (usRow!.telegram_capabilities as string[])
    : defaultCapabilitiesForRole(role)
  const societeName = socRow?.nom || 'votre société'
  const roleLabel = ROLE_LABELS[role] || role

  // Contexte mémoire (rappels société/user) — partagé par les deux modes.
  let memoryContext: string | null = null
  try {
    const memories = await memoryRecall({
      societe_id: ctx.current_societe_id!,
      user_id: ctx.user_id,
      query: textForMemoryQuery || null,
      top_k: 6,
    })
    memoryContext = formatMemoriesForPrompt(memories)
  } catch (e: any) {
    console.warn('[webhook] memory recall failed:', e?.message)
  }

  const { overrideMessage, ...extraFields } = extras

  // Typing indicator immédiat : l'utilisateur voit "typing…" et sait que le bot
  // a reçu et travaille. Best-effort, non bloquant.
  fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => { /* noop */ })

  // ── MODE AGENT ──────────────────────────────────────────────────────
  // TELEGRAM_AGENT_MODE : 'lexora' (défaut) = LLM natif Lexora (bypass n8n),
  // 'n8n' = legacy (forward vers le workflow n8n). Le mode lexora ne dépend
  // plus du tout de n8n : Claude tourne dans Lexora et appelle directement les
  // endpoints /api/telegram/internal/* (parité totale avec ce que n8n faisait).
  const AGENT_MODE = (process.env.TELEGRAM_AGENT_MODE || 'lexora').toLowerCase()

  if (AGENT_MODE !== 'n8n') {
    const tAgent = Date.now()
    // Le texte effectif (vocal transcrit → overrideMessage.text, sinon texte brut)
    const userText = String(overrideMessage?.text || originalMessage?.text || textForMemoryQuery || '').trim()
    try {
      const result = await runLexoraAgent(userText, {
        chat_id: chatId,
        user_id: ctx.user_id,
        societe_id: ctx.current_societe_id!,
        societe_name: societeName,
        role,
        role_label: roleLabel,
        first_name: ctx.telegram_firstname,
        locale: ctx.language_code,
        memory_context: memoryContext,
      })
      if (result.ok) {
        await sendTelegramMessage(chatId, result.text)
        // Expédie les pièces jointes produites par les outils download.
        // Best-effort : on log l'échec sans bloquer le message texte déjà envoyé.
        if (result.artifacts && result.artifacts.length > 0) {
          for (const art of result.artifacts) {
            try {
              await sendTelegramDocumentBuffer(
                chatId, art.buffer, art.filename, art.contentType, art.caption,
              )
            } catch (e: any) {
              console.warn('[webhook] sendDocument artifact failed:', art.filename, e?.message)
              await sendTelegramMessage(
                chatId,
                `⚠️ Impossible d'envoyer le fichier <code>${art.filename}</code>.`,
              ).catch(() => {})
            }
          }
        }
        await logAction({
          chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
          intent: 'agent.lexora', status: 'success',
          payload: {
            turns: result.turns, tools_used: result.tools_used,
            artifacts_count: result.artifacts?.length || 0,
          },
          duration_ms: Date.now() - tAgent,
        }).catch(() => {})
      } else {
        await logAction({
          chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
          intent: 'agent.lexora', status: 'error', error_msg: result.error,
          duration_ms: Date.now() - tAgent,
        }).catch(() => {})
        // Diagnostic : on remonte l'erreur réelle (tronquée, sans secret) pour
        // identifier la cause (modèle inaccessible, clé invalide, HMAC…).
        const errDetail = String(result.error || '').slice(0, 300)
        await sendTelegramMessage(
          chatId,
          `⚠️ Petit souci pour traiter ta demande.\n<code>${errDetail}</code>\n\nRéessaie, ou utilise <code>/help</code> pour les commandes directes.`,
        )
      }
    } catch (e: any) {
      await logAction({
        chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
        intent: 'agent.lexora', status: 'error', error_msg: e?.message,
        duration_ms: Date.now() - tAgent,
      }).catch(() => {})
      await sendTelegramMessage(chatId, '⚠️ Erreur interne de l\'assistant. Réessaie dans un instant.')
    }
    return
  }

  // ── MODE LEGACY n8n ─────────────────────────────────────────────────
  const N8N_AGENT_WEBHOOK = process.env.N8N_TELEGRAM_AGENT_WEBHOOK
  if (!N8N_AGENT_WEBHOOK) {
    await sendTelegramMessage(chatId, '⚠️ Agent IA non configuré côté serveur.')
    return
  }

  // Timeout 25s : si n8n hang, on prévient l'utilisateur au lieu de laisser
  // le webhook timeout (60s) silencieusement.
  const ctrl = new AbortController()
  const t0 = Date.now()
  const timeoutId = setTimeout(() => ctrl.abort(), 25_000)

  try {
    const res = await fetch(N8N_AGENT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        user_id: ctx.user_id,
        societe_id: ctx.current_societe_id,
        societe_name: societeName,
        role,
        role_label: roleLabel,
        capabilities,
        locale: ctx.language_code,
        first_name: ctx.telegram_firstname,
        message: overrideMessage || originalMessage,
        memory_context: memoryContext,
        ...extraFields,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const bodyExcerpt = await res.text().catch(() => '').then(s => s.slice(0, 200))
      await logAction({
        chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
        intent: 'agent.forward', status: 'error',
        error_msg: `n8n HTTP ${res.status}: ${bodyExcerpt}`,
        duration_ms: Date.now() - t0,
      })
      await sendTelegramMessage(
        chatId,
        `⚠️ L'agent IA a renvoyé une erreur (HTTP ${res.status}).\n` +
        `Réessaie dans un instant, ou tape <code>/help</code> pour les commandes directes.`,
      )
      return
    }

    // Succès du dispatch — la vraie réponse arrivera via /api/telegram/send
    // appelé depuis n8n. On log juste l'envoi côté Lexora.
    await logAction({
      chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
      intent: 'agent.forward', status: 'success', duration_ms: Date.now() - t0,
    }).catch(() => { /* log non bloquant */ })
  } catch (e: any) {
    clearTimeout(timeoutId)
    const isTimeout = e?.name === 'AbortError'
    await logAction({
      chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
      intent: 'agent.forward', status: 'error',
      error_msg: isTimeout ? 'n8n timeout 25s' : e.message,
      duration_ms: Date.now() - t0,
    })
    await sendTelegramMessage(
      chatId,
      isTimeout
        ? '⏱ L\'agent IA met trop de temps à répondre (>25s). Réessaie dans un instant ou utilise <code>/help</code>.'
        : '⚠️ Erreur de communication avec l\'agent IA. Tape <code>/help</code> pour voir les commandes directes (<code>/in</code>, <code>/out</code>, <code>/notes_de_frais</code>…).',
    )
  }
}

async function handleStartVerification(chatId: number, code: string, fromUser: any) {
  const admin = getAdminClient()
  const { data: pending } = await admin
    .from('telegram_users')
    .select('chat_id, user_id, verification_expires_at')
    .eq('verification_code', code)
    .eq('verified', false)
    .maybeSingle()

  if (!pending) {
    await sendTelegramMessage(chatId, '❌ Code invalide ou expiré. Génère un nouveau code dans Lexora.')
    return NextResponse.json({ ok: true })
  }

  if (pending.verification_expires_at && new Date(pending.verification_expires_at) < new Date()) {
    await sendTelegramMessage(chatId, '⏰ Code expiré. Génère un nouveau code dans Lexora.')
    return NextResponse.json({ ok: true })
  }

  // Si le placeholder chat_id existe (négatif), on le supprime puis on insert le vrai chat_id
  await admin.from('telegram_users').delete().eq('chat_id', pending.chat_id)

  await admin.from('telegram_users').insert({
    chat_id: chatId,
    user_id: pending.user_id,
    verified: true,
    verification_code: null,
    verification_expires_at: null,
    telegram_username: fromUser.username,
    telegram_firstname: fromUser.first_name,
    telegram_lastname: fromUser.last_name,
    language_code: fromUser.language_code === 'en' ? 'en' : 'fr',
    last_seen_at: new Date().toISOString(),
  })

  // Liste les sociétés accessibles
  const { data: socs } = await admin
    .from('user_societes')
    .select('societe_id, societes!inner(nom)')
    .eq('user_id', pending.user_id)

  const list = (socs || []) as any[]
  if (list.length === 0) {
    await sendTelegramMessage(chatId, '✅ Compte lié.\n⚠️ Aucune société associée à ton compte Lexora.')
  } else if (list.length === 1) {
    await admin.from('telegram_users').update({ current_societe_id: list[0].societe_id }).eq('chat_id', chatId)
    await sendTelegramMessage(chatId,
      `✅ Compte lié à <b>${list[0].societes.nom}</b>.\n\nTape <code>/help</code> pour voir ce que je peux faire.`)
  } else {
    const lines = list.map((s, i) => `${i + 1}. ${s.societes.nom}`).join('\n')
    await sendTelegramMessage(chatId,
      `✅ Compte lié.\n\nTu as accès à <b>${list.length} sociétés</b> :\n${lines}\n\n` +
      `Tape <code>/societe N</code> pour démarrer (ex: /societe 1)`)
  }
  return NextResponse.json({ ok: true })
}

async function handleSocieteSelect(chatId: number, target: string) {
  const admin = getAdminClient()
  const ctx = await resolveChatContext(chatId)
  if (!ctx) {
    await sendTelegramMessage(chatId, '⚠️ Compte non vérifié.')
    return NextResponse.json({ ok: true })
  }

  const { data: socs } = await admin
    .from('user_societes')
    .select('societe_id, societes!inner(nom)')
    .eq('user_id', ctx.user_id)

  const list = (socs || []) as any[]
  if (list.length === 0) {
    await sendTelegramMessage(chatId, 'Aucune société liée à ton compte.')
    return NextResponse.json({ ok: true })
  }

  if (!target) {
    const lines = list.map((s, i) => `${i + 1}. ${s.societes.nom}`).join('\n')
    await sendTelegramMessage(chatId, `Sociétés disponibles :\n${lines}\n\nTape <code>/societe N</code> ou <code>/societe NOM</code>.`)
    return NextResponse.json({ ok: true })
  }

  let chosen: any
  const idx = parseInt(target, 10)
  if (!Number.isNaN(idx) && idx >= 1 && idx <= list.length) {
    chosen = list[idx - 1]
  } else {
    chosen = list.find(s => s.societes.nom.toLowerCase().includes(target.toLowerCase()))
  }
  if (!chosen) {
    await sendTelegramMessage(chatId, `❌ Société "${target}" introuvable.`)
    return NextResponse.json({ ok: true })
  }

  await admin.from('telegram_users').update({ current_societe_id: chosen.societe_id }).eq('chat_id', chatId)
  await sendTelegramMessage(chatId, `✅ Société active : <b>${chosen.societes.nom}</b>`)
  return NextResponse.json({ ok: true })
}

/**
 * Gère un clic sur un bouton inline.
 *
 * Format conventionnel `callback_data` : `intent:param1:param2` (max 64 bytes).
 * Intents supportés :
 *   - leave.approve:<demande_id>
 *   - leave.reject:<demande_id>
 *   - payroll.approve:<periode>:confirm   (ex: payroll.approve:2025-05:confirm)
 *   - invoice.confirm:<prompt_hash>       (placeholder — endpoint à venir)
 *
 * Pipeline :
 *   1. resolveChatContext → auth (sinon refus)
 *   2. parse intent + params
 *   3. POST sur l'endpoint interne Lexora correspondant (X-Internal-Token)
 *   4. answerCallbackQuery (toast) + editMessageText (grisé du message original)
 */
async function handleCallbackQuery(cb: any) {
  const chatId: number = cb.message?.chat?.id
  const messageId: number | undefined = cb.message?.message_id
  const callbackId: string = cb.id
  const data: string = cb.data || ''
  const originalText: string = cb.message?.text || cb.message?.caption || ''

  // Auth
  const ctx = await resolveChatContext(chatId)
  if (!ctx) {
    await answerCallbackQuery(callbackId, '⚠️ Compte non vérifié.', true)
    return NextResponse.json({ ok: true })
  }
  if (!ctx.current_societe_id) {
    await answerCallbackQuery(callbackId, '⚠️ Aucune société active.', true)
    return NextResponse.json({ ok: true })
  }

  const [rawIntent, ...params] = data.split(':')
  const intent = rawIntent || 'unknown'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.LEXORA_BASE_URL || ''
  const internalToken = process.env.INTERNAL_API_TOKEN || ''

  if (!baseUrl || !internalToken) {
    await answerCallbackQuery(callbackId, '⚠️ Configuration serveur incomplète.', true)
    return NextResponse.json({ ok: true })
  }

  const callInternal = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': internalToken,
      },
      body: JSON.stringify({
        ...body,
        user_id: ctx.user_id,
        societe_id: ctx.current_societe_id,
      }),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  }

  const started = Date.now()
  try {
    let popup = '✅ Traité'
    let updatedLine = ''

    if (intent === 'leave.approve' || intent === 'leave.reject') {
      const demandeId = params[0]
      if (!demandeId) {
        await answerCallbackQuery(callbackId, 'Paramètre manquant.', true)
        return NextResponse.json({ ok: true })
      }
      const decision = intent === 'leave.approve' ? 'approuve' : 'refuse'
      const r = await callInternal('/api/telegram/internal/leave-decide', {
        demande_id: demandeId,
        decision,
      })
      if (!r.ok) {
        popup = `⚠️ ${r.json?.error || 'Erreur'}`
        await answerCallbackQuery(callbackId, popup, true)
        await logAction({
          chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
          intent, payload: { demande_id: demandeId }, result: r.json,
          status: 'error', error_msg: r.json?.error, duration_ms: Date.now() - started,
        })
        return NextResponse.json({ ok: true })
      }
      popup = decision === 'approuve' ? '✅ Congé approuvé' : '❌ Congé refusé'
      updatedLine = decision === 'approuve'
        ? '\n\n<i>✅ Approuvé via Telegram</i>'
        : '\n\n<i>❌ Refusé via Telegram</i>'
    } else if (intent === 'payroll.approve') {
      const periode = params[0]
      const confirm = params[1] === 'confirm'
      if (!periode || !confirm) {
        await answerCallbackQuery(callbackId, 'Paramètres manquants.', true)
        return NextResponse.json({ ok: true })
      }
      const r = await callInternal('/api/telegram/internal/payroll-approve', {
        periode,
        confirm: true,
      })
      if (!r.ok) {
        popup = `⚠️ ${r.json?.error || 'Erreur'}`
        await answerCallbackQuery(callbackId, popup, true)
        await logAction({
          chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
          intent, payload: { periode }, result: r.json,
          status: 'error', error_msg: r.json?.error, duration_ms: Date.now() - started,
        })
        return NextResponse.json({ ok: true })
      }
      popup = `✅ Paie ${periode} validée`
      updatedLine = `\n\n<i>✅ Validée via Telegram (${periode})</i>`
    } else if (intent === 'invoice.confirm') {
      // Placeholder : endpoint /api/telegram/internal/invoice-confirm pas encore implémenté.
      popup = '⏳ Confirmation facture non disponible (endpoint à venir).'
      await answerCallbackQuery(callbackId, popup, true)
      await logAction({
        chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
        intent, payload: { params }, status: 'pending',
        error_msg: 'endpoint not implemented', duration_ms: Date.now() - started,
      })
      return NextResponse.json({ ok: true })
    } else if (intent === 'doc.received' || intent === 'doc.snooze') {
      // doc.received:<type>:<period>          → stoppe les rappels futurs
      // doc.snooze:<type>:<period>:<days>     → reporte de <days> jours
      const [docType, period, daysStr] = params
      if (!docType || !period) {
        await answerCallbackQuery(callbackId, 'Paramètres manquants.', true)
        return NextResponse.json({ ok: true })
      }
      const admin = getAdminClient()
      const isSnooze = intent === 'doc.snooze'
      const days = isSnooze ? Math.max(1, Math.min(30, Number(daysStr) || 7)) : null

      const row: Record<string, unknown> = {
        societe_id: ctx.current_societe_id,
        type: docType,
        period,
        status: isSnooze ? 'snoozed' : 'received',
        snoozed_until: isSnooze
          ? new Date(Date.now() + (days as number) * 86400_000).toISOString()
          : null,
        received_by: isSnooze ? null : ctx.user_id,
        received_at: isSnooze ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error: upErr } = await admin
        .from('telegram_doc_reminders_state')
        .upsert(row, { onConflict: 'societe_id,type,period' })

      if (upErr) {
        popup = `⚠️ ${upErr.message}`
        await answerCallbackQuery(callbackId, popup, true)
        await logAction({
          chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
          intent, payload: { type: docType, period, days }, status: 'error',
          error_msg: upErr.message, duration_ms: Date.now() - started,
        })
        return NextResponse.json({ ok: true })
      }

      popup = isSnooze
        ? `⏰ Reporté de ${days}j`
        : '✅ Marqué comme reçu/soumis'
      updatedLine = isSnooze
        ? `\n\n<i>⏰ Reporté de ${days}j via Telegram</i>`
        : '\n\n<i>✅ Reçu/Soumis (Telegram)</i>'
    } else if (intent === 'attendance.pointed') {
      // attendance.pointed:<employe_id>:<date>
      const [employeId, date] = params
      if (!employeId || !date) {
        await answerCallbackQuery(callbackId, 'Paramètres manquants.', true)
        return NextResponse.json({ ok: true })
      }
      const admin = getAdminClient()

      const nowIso = new Date().toISOString()
      const heureEntree = nowIso.slice(11, 19) // HH:MM:SS

      // INSERT pointage si pas déjà existant aujourd'hui
      const { data: existing } = await admin
        .from('pointages')
        .select('id, heure_entree')
        .eq('employe_id', employeId)
        .eq('date_pointage', date)
        .maybeSingle()

      if (existing?.heure_entree) {
        popup = '✅ Déjà pointé aujourd\'hui'
      } else if (existing) {
        await admin
          .from('pointages')
          .update({ heure_entree: heureEntree, type_pointage: 'telegram' })
          .eq('id', existing.id)
        popup = '✅ Pointage in enregistré'
      } else {
        await admin.from('pointages').insert({
          employe_id: employeId,
          date_pointage: date,
          heure_entree: heureEntree,
          type_pointage: 'telegram',
        })
        popup = '✅ Pointage in enregistré'
      }

      await admin
        .from('telegram_attendance_alerts')
        .update({
          status: 'pointed',
          resolved_at: nowIso,
          resolved_by: ctx.user_id,
        })
        .eq('employe_id', employeId)
        .eq('date_planning', date)

      updatedLine = '\n\n<i>✅ Pointé via Telegram</i>'
    } else if (intent === 'attendance.sick') {
      // attendance.sick:<employe_id>:<date> → invite à déclarer
      const [, date] = params
      popup = '🤒 Indique la durée'
      updatedLine = '\n\n<i>🤒 Sick leave — réponds avec la durée (ex: "sick 3j")</i>'
      await sendTelegramMessage(
        chatId,
        '🤒 <b>Sick leave</b>\n' +
        `Combien de jours d'arrêt ? Réponds-moi avec par exemple :\n` +
        `<code>sick 3j</code> ou <code>/sick</code>\n` +
        `(date : ${date || 'aujourd\'hui'})`,
      )
    } else if (intent === 'attendance.leave') {
      // attendance.leave:<employe_id>:<date> → invite à demander un congé urgent
      const [, date] = params
      popup = '🌴 Demande de congé'
      updatedLine = '\n\n<i>🌴 Demande de congé urgent — réponds avec le motif et la durée</i>'
      await sendTelegramMessage(
        chatId,
        '🌴 <b>Demande de congé urgent</b>\n' +
        `Indique-moi le motif et le nombre de jours (ex: <code>congé urgent 1j famille</code>).\n` +
        `(date : ${date || 'aujourd\'hui'})`,
      )
    } else if (intent === 'attendance.excused' || intent === 'attendance.unjustified') {
      // attendance.excused | unjustified :<employe_id>:<date>
      const [employeId, date] = params
      if (!employeId || !date) {
        await answerCallbackQuery(callbackId, 'Paramètres manquants.', true)
        return NextResponse.json({ ok: true })
      }
      const admin = getAdminClient()
      const newStatus = intent === 'attendance.excused' ? 'excused' : 'unjustified'

      await admin
        .from('telegram_attendance_alerts')
        .update({
          status: newStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: ctx.user_id,
          notes: newStatus === 'unjustified' ? 'Marqué non justifié via Telegram (manager)' : null,
        })
        .eq('employe_id', employeId)
        .eq('date_planning', date)

      popup = newStatus === 'excused' ? '✅ Absence excusée' : '⚠️ Absence non justifiée'
      updatedLine = newStatus === 'excused'
        ? '\n\n<i>✅ Excusé via Telegram</i>'
        : '\n\n<i>⚠️ Marqué non justifié via Telegram</i>'
    } else if (intent === 'attendance.contact') {
      // attendance.contact:<employe_id>:<date> — non-destructif, simple ack
      const [employeId] = params
      const admin = getAdminClient()
      const { data: emp } = await admin
        .from('employes')
        .select('telephone, prenom, nom')
        .eq('id', employeId || '')
        .maybeSingle()
      popup = emp?.telephone ? `📞 ${emp.telephone}` : '📞 Pas de téléphone enregistré'
      updatedLine = `\n\n<i>📞 Contact lancé via Telegram${emp?.telephone ? ' (' + emp.telephone + ')' : ''}</i>`
    } else if (intent === 'expense.confirm') {
      const documentId = params[0]
      if (!documentId) {
        await answerCallbackQuery(callbackId, 'Paramètre manquant.', true)
        return NextResponse.json({ ok: true })
      }
      const r = await callInternal('/api/telegram/internal/expense-create', {
        document_id: documentId,
      })
      if (!r.ok) {
        popup = `⚠️ ${r.json?.error || 'Erreur'}`
        await answerCallbackQuery(callbackId, popup, true)
        await logAction({
          chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
          intent, payload: { document_id: documentId }, result: r.json,
          status: 'error', error_msg: r.json?.error, duration_ms: Date.now() - started,
        })
        return NextResponse.json({ ok: true })
      }
      const dataExp = r.json || {}
      const montant = dataExp?.montant_ttc ? `${dataExp.montant_ttc} ${dataExp.devise || 'MUR'}` : 'à compléter'
      const vendor = dataExp?.vendor || '(vendor à compléter)'
      popup = `✅ Note de frais créée`
      updatedLine = `\n\n<i>📷 Note de frais créée : ${vendor} · ${montant}</i>`
    } else if (intent === 'expense.skip') {
      popup = `📄 OK, gardé comme document classique`
      updatedLine = `\n\n<i>📄 Conservé comme document classique</i>`
    } else {
      await answerCallbackQuery(callbackId, `Action inconnue : ${intent}`, true)
      return NextResponse.json({ ok: true })
    }

    // Toast confirmation
    await answerCallbackQuery(callbackId, popup, false)

    // Édite le message d'origine pour griser le bouton
    if (messageId) {
      try {
        await editMessageText(
          chatId,
          messageId,
          `${originalText}${updatedLine}`,
          { reply_markup: { inline_keyboard: [] } },
        )
      } catch {
        // Non-bloquant si le message ne peut pas être édité
      }
    }

    await logAction({
      chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
      intent, payload: { params }, status: 'success',
      duration_ms: Date.now() - started,
    })
  } catch (e: any) {
    await answerCallbackQuery(callbackId, '⚠️ Erreur interne.', true)
    await logAction({
      chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
      intent, status: 'error', error_msg: e.message,
      duration_ms: Date.now() - started,
    })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Gère un message contenant un document ou une photo.
 *
 * - `document` : meilleur cas — on a file_id + file_name + mime_type
 * - `photo`    : on prend la plus grande taille (dernier élément de l'array)
 *   et on déduit l'extension PNG/JPG depuis le mime renvoyé par getFile
 */
async function handleDocumentMessage(
  chatId: number,
  userId: string,
  societeId: string,
  tgDoc: any | undefined,
  tgPhoto: any[] | undefined,
  caption: string | undefined,
) {
  let file_id: string | null = null
  let file_name: string | undefined
  let mime_type: string | undefined
  let declared_size: number | undefined

  if (tgDoc) {
    file_id = tgDoc.file_id
    file_name = tgDoc.file_name
    mime_type = tgDoc.mime_type
    declared_size = tgDoc.file_size
  } else if (tgPhoto && tgPhoto.length > 0) {
    const largest = tgPhoto[tgPhoto.length - 1]
    file_id = largest.file_id
    file_name = caption ? `${caption.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg` : `photo_${Date.now()}.jpg`
    mime_type = 'image/jpeg'
    declared_size = largest.file_size
  }

  if (!file_id) {
    await sendTelegramMessage(chatId, '⚠️ Document non reconnu.')
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage(chatId, '📥 Réception du document…')

  const r = await ingestTelegramDocument({
    chat_id: chatId,
    user_id: userId,
    societe_id: societeId,
    file_id,
    file_name,
    mime_type,
    declared_size,
  })

  if (!r.ok) {
    await sendTelegramMessage(chatId, `⚠️ ${r.error}`)
    await logAction({
      chat_id: chatId, user_id: userId, societe_id: societeId,
      intent: 'document.ingest', status: 'error', error_msg: r.error,
    })
    return NextResponse.json({ ok: true })
  }

  const tailleKo = Math.round(r.taille / 1024)
  const isImage = r.type_fichier === 'jpeg' || r.type_fichier === 'png'
  const captionMatches = captionLooksLikeExpense(caption)
  const ocr = (r as any).ocr || null
  const ocrSuccess = !!ocr?.success
  const typeDoc = ocr?.type_document || 'autre'
  const societeDetectee = ocr?.societe_detectee

  // Note de frais (caption explicite)
  if (isImage && captionMatches) {
    await handleExpensePhotoAuto(chatId, userId, societeId, r.doc_id, r.nom_fichier, tailleKo)
    return NextResponse.json({ ok: true })
  }

  const typeLabel: Record<string, string> = {
    facture_fournisseur: 'Facture fournisseur',
    facture_client: 'Facture client',
    releve_bancaire: 'Relevé bancaire',
    fiche_paie: 'Fiche de paie',
    charges_sociales: 'Charges sociales',
    contrat: 'Contrat',
    autre: 'Document',
  }

  if (ocrSuccess) {
    const lines = [
      `✅ <b>Document traité</b>`,
      `📄 ${r.nom_fichier} (${tailleKo} Ko)`,
      `📋 Type : <b>${typeLabel[typeDoc] || typeDoc}</b>`,
    ]
    if (societeDetectee && societeDetectee !== 'INCONNU') lines.push(`🏢 Société : ${societeDetectee}`)
    lines.push(``, `Disponible dans <b>Lexora → Documents</b>.`)
    if (isImage && !captionMatches && typeDoc === 'autre') {
      try {
        await sendTelegramInlineButtons(
          chatId,
          lines.join('\n') + `\n\n📷 C'est aussi une <b>note de frais</b> ?`,
          [[
            { text: '✅ Oui', callback_data: `expense.confirm:${r.doc_id}` },
            { text: '❌ Non', callback_data: `expense.skip:${r.doc_id}` },
          ]],
        )
        return NextResponse.json({ ok: true })
      } catch { /* noop */ }
    }
    await sendTelegramMessage(chatId, lines.join('\n'))
    return NextResponse.json({ ok: true })
  }

  // OCR a échoué : on affiche le vrai message d'erreur pour debug
  const ocrErr = ocr?.error
  await sendTelegramMessage(
    chatId,
    `✅ <b>Document reçu</b>\n` +
    `📄 ${r.nom_fichier} (${tailleKo} Ko, ${r.type_fichier.toUpperCase()})\n\n` +
    (ocrErr
      ? `⚠️ <b>Pipeline OCR en erreur :</b>\n<code>${String(ocrErr).slice(0, 400)}</code>\n\nTu peux relancer depuis <b>Lexora → Documents → Reanalyser</b>.`
      : `🤖 Traitement OCR en attente. Disponible dans <b>Lexora → Documents</b>.`),
  )
  return NextResponse.json({ ok: true })
}

/**
 * Auto-création d'une note de frais depuis une photo + caption "frais/repas/taxi/…".
 * Appelle l'endpoint interne expense-create avec document_id. L'OCR est fait
 * côté endpoint via Anthropic vision.
 */
async function handleExpensePhotoAuto(
  chatId: number,
  userId: string,
  societeId: string,
  documentId: string,
  nomFichier: string,
  tailleKo: number,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.LEXORA_BASE_URL || ''
  const internalToken = process.env.INTERNAL_API_TOKEN || ''
  if (!baseUrl || !internalToken) {
    await sendTelegramMessage(chatId, `✅ Document reçu (${tailleKo} Ko)\n⚠️ OCR note de frais indisponible — config serveur incomplète.`)
    return
  }
  try {
    const res = await fetch(`${baseUrl}/api/telegram/internal/expense-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': internalToken },
      body: JSON.stringify({ chat_id: chatId, document_id: documentId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      await sendTelegramMessage(
        chatId,
        `📷 <b>Document reçu</b> (${nomFichier})\n⚠️ Création note de frais échouée : ${json?.error || res.status}\nUn comptable pourra la traiter manuellement.`,
      )
      return
    }
    const data = json
    const montant = data?.montant_ttc ? `${formatNumber(data.montant_ttc)} ${data.devise || 'MUR'}` : 'montant à compléter'
    const vendor = data?.vendor || 'vendor à compléter'
    const date = data?.date_facture || '(date manquante)'
    const cat = data?.categorie ? ` · <i>${data.categorie}</i>` : ''
    await sendTelegramMessage(
      chatId,
      `📷 <b>Note de frais ajoutée</b>\n` +
      `${vendor} · ${montant} · ${date}${cat}\n\n` +
      `📋 Statut : <b>brouillon</b> — à valider par comptable.\n` +
      `Tape <code>/notes_de_frais</code> pour voir tes notes en cours.`,
    )
  } catch (e: any) {
    await sendTelegramMessage(chatId, `⚠️ Erreur création note de frais : ${e?.message || 'inconnue'}`)
  }
}

function formatNumber(n: number): string {
  if (typeof n !== 'number' || !isFinite(n)) return String(n)
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h <= 0) return `${min} min`
  return `${h}h${String(min).padStart(2, '0')}`
}

/**
 * Voice message → Whisper transcription → forward to n8n agent as text.
 * Best-effort : en cas d'échec on prévient l'utilisateur.
 */
async function handleVoiceMessage(
  chatId: number,
  ctx: NonNullable<Awaited<ReturnType<typeof resolveChatContext>>>,
  voice: any,
  originalMessage: any,
) {
  const t0 = Date.now()
  // Ack rapide
  await sendTelegramMessage(chatId, '🎤 Transcription en cours…').catch(() => {})

  const langHint = ctx.language_code === 'en' ? 'en' : 'fr'
  const tr = await transcribeTelegramVoice({
    file_id: voice.file_id,
    declared_duration_seconds: voice.duration,
    language: langHint,
  })

  if (!tr.ok) {
    await sendTelegramMessage(
      chatId,
      ctx.language_code === 'en'
        ? '⚠️ Sorry, I couldn\'t understand your voice message. Try again in text.'
        : '⚠️ Désolé, je n\'ai pas pu comprendre ton message vocal. Réessaie en texte.',
    )
    await logAction({
      chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
      intent: 'voice.transcribe', status: 'error', error_msg: tr.error,
      payload: { reason: (tr as any).reason || null, voice_duration: voice?.duration || null, file_size: voice?.file_size || null },
      duration_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: true })
  }

  // Audit succès
  await logAction({
    chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
    intent: 'voice.transcribe', status: 'success',
    payload: {
      voice_duration: voice?.duration || null,
      audio_bytes: tr.audio_bytes,
      language: tr.language || null,
    },
    result: { text_length: tr.text.length },
    duration_ms: tr.duration_ms,
  })

  // Détection pointage / expense list dans le texte transcrit
  const ptg = detectPointageIntent(tr.text)
  if (ptg) {
    return await handlePointageCommand(chatId, ctx, ptg, { fromVoice: true })
  }
  if (isExpensesListCommand(tr.text)) {
    return await handleExpensesList(chatId, ctx, { fromVoice: true })
  }

  // Forward au n8n avec un message synthétique : on copie la structure Telegram
  // mais en remplaçant le `voice` par un `text` préfixé "[Vocal] ".
  const prefixed = `[Vocal] ${tr.text}`
  const syntheticMessage = {
    ...originalMessage,
    voice: undefined,
    text: prefixed,
  }
  delete syntheticMessage.voice
  await forwardToN8nAgent(chatId, ctx, originalMessage, prefixed, {
    overrideMessage: syntheticMessage,
    is_voice: true,
    voice_duration_seconds: voice?.duration || null,
    voice_transcribe_ms: tr.duration_ms,
    voice_language: tr.language || null,
  })
  return NextResponse.json({ ok: true })
}

/**
 * Commande /in /out (ou langage naturel équivalent) → POST pointage-create.
 */
async function handlePointageCommand(
  chatId: number,
  ctx: NonNullable<Awaited<ReturnType<typeof resolveChatContext>>>,
  type: 'in' | 'out',
  opts: { fromVoice?: boolean } = {},
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.LEXORA_BASE_URL || ''
  const internalToken = process.env.INTERNAL_API_TOKEN || ''
  if (!baseUrl || !internalToken) {
    await sendTelegramMessage(chatId, '⚠️ Configuration serveur incomplète (pointage).')
    return NextResponse.json({ ok: true })
  }
  try {
    const res = await fetch(`${baseUrl}/api/telegram/internal/pointage-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': internalToken },
      body: JSON.stringify({ chat_id: chatId, type }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      await sendTelegramMessage(chatId, `⚠️ ${json?.error || `Erreur pointage ${type}`}`)
      return NextResponse.json({ ok: true })
    }
    const r = json
    if (type === 'in') {
      let txt =
        `✅ <b>Pointage in enregistré</b>\n` +
        `🕒 ${r.heure} · ${r.date}`
      if (r.forgot_out_warning) {
        txt += `\n\n⚠️ Oubli de pointage <b>out</b> détecté le ${r.forgot_out_warning.date_pointage} (début ${String(r.forgot_out_warning.heure_debut).slice(0, 5)}). Pense à corriger via l'UI RH.`
      }
      if (opts.fromVoice) txt += `\n\n<i>(via message vocal)</i>`
      await sendTelegramMessage(chatId, txt)
    } else {
      const duree = typeof r.duree_minutes === 'number' ? formatMinutes(r.duree_minutes) : '—'
      const cumul = typeof r.cumul_jour_minutes === 'number' ? formatMinutes(r.cumul_jour_minutes) : '—'
      let txt =
        `✅ <b>Pointage out enregistré</b>\n` +
        `🕒 ${r.heure_in} → ${r.heure} · ${r.date}\n` +
        `⏱ Durée session : <b>${duree}</b>\n` +
        `📊 Cumul jour : ${cumul}`
      if (r.cross_day) txt += `\n\n⚠️ Session ouverte la veille — durée calculée sur 24h+.`
      if (opts.fromVoice) txt += `\n\n<i>(via message vocal)</i>`
      await sendTelegramMessage(chatId, txt)
    }
  } catch (e: any) {
    await sendTelegramMessage(chatId, `⚠️ Erreur pointage : ${e?.message || 'inconnue'}`)
  }
  return NextResponse.json({ ok: true })
}

/**
 * Commande /notes_de_frais → GET expenses-list.
 */
async function handleExpensesList(
  chatId: number,
  ctx: NonNullable<Awaited<ReturnType<typeof resolveChatContext>>>,
  opts: { fromVoice?: boolean } = {},
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.LEXORA_BASE_URL || ''
  const internalToken = process.env.INTERNAL_API_TOKEN || ''
  if (!baseUrl || !internalToken) {
    await sendTelegramMessage(chatId, '⚠️ Configuration serveur incomplète.')
    return NextResponse.json({ ok: true })
  }
  try {
    const res = await fetch(
      `${baseUrl}/api/telegram/internal/expenses-list?chat_id=${chatId}`,
      { headers: { 'X-Internal-Token': internalToken } },
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      await sendTelegramMessage(chatId, `⚠️ ${json?.error || 'Erreur expenses-list'}`)
      return NextResponse.json({ ok: true })
    }
    const expenses = (json?.expenses || []) as any[]
    if (expenses.length === 0) {
      await sendTelegramMessage(
        chatId,
        `📋 Aucune note de frais en cours.\n\nEnvoie une <b>photo de ticket</b> avec la légende "<i>frais</i>", "<i>repas</i>", "<i>taxi</i>" pour en créer une.`,
      )
      return NextResponse.json({ ok: true })
    }
    const lines = expenses.slice(0, 10).map((e: any, i: number) => {
      const m = typeof e.montant_ttc === 'number' ? formatNumber(e.montant_ttc) : '—'
      const dev = e.devise || 'MUR'
      const vendor = e.vendor || '(vendor manquant)'
      const date = e.date_facture || '—'
      const cat = e.categorie ? ` · ${e.categorie}` : ''
      const st = e.statut === 'en_validation' ? '🟡' : '⚪'
      return `${i + 1}. ${st} ${vendor} · ${m} ${dev} · ${date}${cat}`
    }).join('\n')
    const total = typeof json.total_mur === 'number' ? formatNumber(json.total_mur) : '0'
    let txt =
      `📋 <b>Notes de frais en cours</b> (${expenses.length})\n\n` +
      `${lines}\n\n` +
      `💰 Total MUR : <b>${total} MUR</b>\n` +
      `⚪ brouillon · 🟡 en validation`
    if (opts.fromVoice) txt += `\n\n<i>(via message vocal)</i>`
    await sendTelegramMessage(chatId, txt)
  } catch (e: any) {
    await sendTelegramMessage(chatId, `⚠️ Erreur : ${e?.message || 'inconnue'}`)
  }
  return NextResponse.json({ ok: true })
}

function buildHelp() {
  return [
    '🤖 <b>Lexora Bot</b> — commandes & exemples',
    '',
    '<b>📑 Documents (OCR)</b>',
    '• Envoie une photo ou un PDF → je l\'ingère dans Lexora',
    '',
    '<b>🕒 Pointage</b>',
    '• <code>/in</code> ou "j\'arrive" / "je commence" → pointe l\'entrée',
    '• <code>/out</code> ou "je pars" / "je termine" → pointe la sortie + durée',
    '',
    '<b>🎤 Messages vocaux</b>',
    '• Tu peux m\'envoyer un message vocal — je le transcris et je le traite',
    '',
    '<b>📷 Notes de frais</b>',
    '• Photo de ticket + légende "frais" / "repas" / "taxi" → je crée la note',
    '• <code>/notes_de_frais</code> — liste tes notes en cours',
    '',
    '<b>📊 Tableau de bord</b>',
    '• "kpis du mois" / "trésorerie" / "alertes"',
    '',
    '<b>🧾 Factures</b>',
    '• "facture ACME 50000 MUR services janvier" → je génère + envoie le PDF',
    '• "statut facture INV-2025-001"',
    '',
    '<b>🌴 Congés</b>',
    '• "3 jours congé du 5 au 7 mai" (employé)',
    '• Bouton Approuver/Refuser (manager) sur les demandes',
    '',
    '<b>💼 Paie</b>',
    '• "Jean 8h OT 1.5x mai" / "prime de 5000 pour Marie"',
    '• "valide paie mai" (direction)',
    '• "export PAYE mai" → CSV/XML MRA en pièce jointe',
    '',
    '<b>📅 Échéances MRA</b>',
    '• Alertes automatiques J-7 avant chaque échéance',
    '• "échéances" pour la liste',
    '',
    '<b>⚙️ Commandes système</b>',
    '<code>/societe</code> — changer de société',
    '<code>/societe NOM</code> — choisir directement',
    '<code>/logout</code> — me déconnecter',
    '<code>/help</code> — ce message',
  ].join('\n')
}

// Référentiel rôles (synchro avec lib/telegram/internal-auth.ts et l'UI)
const ROLE_LABELS = {
  employe: 'Employé',
  manager: 'Manager',
  rh: 'RH',
  comptable: 'Comptable',
  comptable_dedie: 'Comptable dédié',
  direction: 'Direction',
  client_admin: 'Dirigeant client',
  admin: 'Administrateur',
  super_admin: 'Super Admin',
} as const

function defaultCapabilitiesForRole(role: string): string[] {
  const base = ['view_help', 'switch_societe', 'logout']
  switch (role) {
    case 'employe':
      return [...base, 'view_my_payslip', 'view_my_leave_balance', 'request_leave']
    case 'manager':
      return [...base, 'view_my_payslip', 'view_my_leave_balance', 'request_leave',
              'view_team_kpis', 'approve_team_leave', 'view_team_pending']
    case 'rh':
      return [...base, 'view_my_payslip', 'view_team_kpis', 'add_ot', 'add_bonus',
              'compute_payroll', 'export_mra', 'view_employees', 'manage_leave_settings']
    case 'comptable':
    case 'comptable_dedie':
      return [...base, 'view_kpis', 'view_bank', 'create_invoice', 'view_tax_calendar',
              'export_mra', 'reconcile_bank', 'view_audit_log']
    case 'direction':
    case 'client_admin':
      return [...base, 'view_kpis', 'view_bank', 'view_tax_calendar', 'create_invoice',
              'compute_payroll', 'approve_payroll', 'export_mra', 'approve_team_leave',
              'view_audit_log', 'manage_alerts_config']
    case 'admin':
    case 'super_admin':
      return ['ALL']
    default:
      return base
  }
}
