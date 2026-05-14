import { NextRequest, NextResponse } from 'next/server'
import { assertWebhookSecret, resolveChatContext, sendTelegramMessage, logAction } from '@/lib/telegram/auth'
import { getAdminClient } from '@/lib/supabase/admin'

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
  const text: string = update.message?.text || update.callback_query?.data || ''

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

  // Résout le rôle de l'utilisateur dans la société active (pour propagation à n8n)
  const admin = getAdminClient()
  const { data: usRow } = await admin
    .from('user_societes')
    .select('role')
    .eq('user_id', ctx.user_id)
    .eq('societe_id', ctx.current_societe_id)
    .maybeSingle()
  const role = usRow?.role || 'employe'

  // --- Forward to n8n AI Agent webhook -----------------------------------------
  const N8N_AGENT_WEBHOOK = process.env.N8N_TELEGRAM_AGENT_WEBHOOK
  if (!N8N_AGENT_WEBHOOK) {
    await sendTelegramMessage(chatId, '⚠️ Agent IA non configuré côté serveur.')
    return NextResponse.json({ ok: true })
  }

  try {
    await fetch(N8N_AGENT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        user_id: ctx.user_id,
        societe_id: ctx.current_societe_id,
        role,
        locale: ctx.language_code,
        first_name: ctx.telegram_firstname,
        message: update.message || update.callback_query,
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
