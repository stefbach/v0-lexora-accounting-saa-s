import { NextRequest, NextResponse } from 'next/server'
import {
  assertWebhookSecret,
  resolveChatContext,
  sendTelegramMessage,
  logAction,
  answerCallbackQuery,
  editMessageText,
} from '@/lib/telegram/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { ingestTelegramDocument } from '@/lib/telegram/document-ingest'
import { memoryRecall, formatMemoriesForPrompt } from '@/lib/telegram/memory'

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

  // --- Document / photo → ingestion OCR ----------------------------------------
  const tgDoc = update.message?.document
  const tgPhoto = update.message?.photo // array of PhotoSize
  if (tgDoc || tgPhoto) {
    return await handleDocumentMessage(chatId, ctx.user_id, ctx.current_societe_id, tgDoc, tgPhoto, update.message?.caption)
  }

  // Résout le rôle + capabilities + nom société (pour propagation à n8n).
  // SELECT tolérant à la migration 266 manquante.
  const admin = getAdminClient()
  const [usRes, socRes] = await Promise.all([
    admin
      .from('user_societes')
      .select('role, telegram_capabilities')
      .eq('user_id', ctx.user_id)
      .eq('societe_id', ctx.current_societe_id)
      .maybeSingle(),
    admin
      .from('societes')
      .select('id, nom, brn')
      .eq('id', ctx.current_societe_id)
      .maybeSingle(),
  ])
  let usRow: any = usRes.data
  if (usRes.error && /telegram_capabilities/i.test(usRes.error.message || '')) {
    const fallback = await admin
      .from('user_societes')
      .select('role')
      .eq('user_id', ctx.user_id)
      .eq('societe_id', ctx.current_societe_id)
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

  // --- Forward to n8n AI Agent webhook -----------------------------------------
  const N8N_AGENT_WEBHOOK = process.env.N8N_TELEGRAM_AGENT_WEBHOOK
  if (!N8N_AGENT_WEBHOOK) {
    await sendTelegramMessage(chatId, '⚠️ Agent IA non configuré côté serveur.')
    return NextResponse.json({ ok: true })
  }

  // Pré-charge les mémoires pertinentes (best-effort, ne bloque pas le forward)
  let memoryContext: string | null = null
  try {
    const memories = await memoryRecall({
      societe_id: ctx.current_societe_id,
      user_id: ctx.user_id,
      query: text || null,
      top_k: 6,
    })
    memoryContext = formatMemoriesForPrompt(memories)
  } catch (e: any) {
    console.warn('[webhook] memory recall failed:', e?.message)
  }

  try {
    await fetch(N8N_AGENT_WEBHOOK, {
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
        message: update.message,
        memory_context: memoryContext, // injecté dans le system prompt côté n8n
      }),
    })
  } catch (e: any) {
    await logAction({
      chat_id: chatId, user_id: ctx.user_id, societe_id: ctx.current_societe_id,
      intent: 'agent.forward', status: 'error', error_msg: e.message,
    })
    await sendTelegramMessage(chatId, '⚠️ Erreur de communication avec l\'agent IA. Réessaie dans un instant.')
  }

  return NextResponse.json({ ok: true })
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

  let chosen = null as any
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
  await sendTelegramMessage(
    chatId,
    `✅ <b>Document reçu</b>\n` +
    `📄 ${r.nom_fichier} (${tailleKo} Ko, ${r.type_fichier.toUpperCase()})\n\n` +
    `🤖 Traitement OCR en attente. Tu retrouveras le document dans <b>Lexora → Documents</b>.`,
  )
  return NextResponse.json({ ok: true })
}

function buildHelp() {
  return [
    '🤖 <b>Lexora Bot</b> — commandes & exemples',
    '',
    '<b>📑 Documents (OCR)</b>',
    '• Envoie une photo ou un PDF → je l\'ingère dans Lexora',
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
