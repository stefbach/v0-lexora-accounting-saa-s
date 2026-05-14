/**
 * Helpers de notifications push Telegram — utilisés par les endpoints internes
 * (leave-create, leave-decide, etc.) et le cron `/api/cron/telegram-notifications`.
 *
 * Tous "best-effort" : un échec d'envoi Telegram ne doit jamais faire échouer
 * l'action métier sous-jacente. On loggue dans `telegram_actions` (intent=notify.*).
 */
import { getAdminClient } from '@/lib/supabase/admin'
import {
  sendTelegramMessage,
  sendTelegramInlineButtons,
  type InlineButton,
} from '@/lib/telegram/auth'

const TYPE_LABEL: Record<string, string> = {
  AL: 'Annual Leave',
  SL: 'Sick Leave',
  VL: 'Vacation Leave',
  FML: 'Family Leave',
  ML: 'Maternity Leave',
  PL: 'Paternity Leave',
}

/** Résout le `chat_id` Telegram d'un employé (via son user_id). */
export async function chatIdForEmploye(employe_id: string): Promise<number | null> {
  const admin = getAdminClient()
  const { data: emp } = await admin
    .from('employes')
    .select('user_id')
    .eq('id', employe_id)
    .maybeSingle()
  if (!emp?.user_id) return null
  const { data: tg } = await admin
    .from('telegram_users')
    .select('chat_id')
    .eq('user_id', emp.user_id)
    .eq('verified', true)
    .maybeSingle()
  return tg?.chat_id ?? null
}

/** Résout les `chat_id` Telegram de tous les users d'une société ayant un rôle donné. */
export async function chatIdsForRole(
  societe_id: string,
  roles: string[],
): Promise<{ chat_id: number; user_id: string; role: string }[]> {
  const admin = getAdminClient()
  const { data: users } = await admin
    .from('user_societes')
    .select('user_id, role')
    .eq('societe_id', societe_id)
    .in('role', roles)
  if (!users?.length) return []
  const userIds = users.map((u: any) => u.user_id)
  const { data: tgs } = await admin
    .from('telegram_users')
    .select('chat_id, user_id, current_societe_id')
    .in('user_id', userIds)
    .eq('verified', true)
  const roleByUser = new Map(users.map((u: any) => [u.user_id, u.role]))
  return (tgs || [])
    .filter((t: any) => !t.current_societe_id || t.current_societe_id === societe_id)
    .map((t: any) => ({ chat_id: t.chat_id, user_id: t.user_id, role: roleByUser.get(t.user_id) || '' }))
}

async function audit(args: {
  chat_id: number
  societe_id: string
  intent: string
  status: 'success' | 'error'
  payload?: unknown
  error_msg?: string
}) {
  try {
    const admin = getAdminClient()
    await admin.from('telegram_actions').insert({
      chat_id: args.chat_id,
      user_id: null,
      societe_id: args.societe_id,
      intent: args.intent,
      payload: args.payload ?? null,
      status: args.status,
      error_msg: args.error_msg ?? null,
    })
  } catch {
    // swallow — audit ne doit jamais bloquer
  }
}

/**
 * Notifie le manager qu'une nouvelle demande de congé est en attente.
 * Boutons inline : Approuver / Refuser.
 */
export async function notifyLeaveCreated(args: {
  demande_id: string
  manager_id: string | null
  employe_nom: string
  type_conge: string
  nb_jours: number
  date_debut: string
  date_fin: string
  societe_id: string
}) {
  if (!args.manager_id) return { sent: false, reason: 'no_manager' }
  const chat_id = await chatIdForEmploye(args.manager_id)
  if (!chat_id) return { sent: false, reason: 'manager_no_telegram' }

  const typeLabel = TYPE_LABEL[args.type_conge] || args.type_conge
  const text =
    `🌴 <b>Nouvelle demande de congé</b>\n` +
    `<b>${args.employe_nom}</b> — ${typeLabel} ${args.nb_jours}j\n` +
    `Du ${args.date_debut} au ${args.date_fin}\n\n` +
    `Décider ?`

  const buttons: InlineButton[][] = [[
    { text: '✅ Approuver', callback_data: `leave.approve:${args.demande_id}` },
    { text: '❌ Refuser', callback_data: `leave.reject:${args.demande_id}` },
  ]]

  try {
    await sendTelegramInlineButtons(chat_id, text, buttons)
    await audit({ chat_id, societe_id: args.societe_id, intent: 'notify.leave.pending', status: 'success', payload: { demande_id: args.demande_id } })
    return { sent: true, chat_id }
  } catch (e: any) {
    await audit({ chat_id, societe_id: args.societe_id, intent: 'notify.leave.pending', status: 'error', error_msg: e?.message })
    return { sent: false, reason: 'send_failed' }
  }
}

/** Notifie l'employé du résultat de sa demande de congé. */
export async function notifyLeaveDecided(args: {
  employe_chat_id: number | null
  employe_nom: string
  decision: 'approuve' | 'refuse'
  type_conge: string
  nb_jours: number
  date_debut: string
  date_fin: string
  commentaire?: string | null
  societe_id: string
}) {
  if (!args.employe_chat_id) return { sent: false, reason: 'employee_no_telegram' }
  const typeLabel = TYPE_LABEL[args.type_conge] || args.type_conge
  const icon = args.decision === 'approuve' ? '✅' : '❌'
  const verb = args.decision === 'approuve' ? 'approuvée' : 'refusée'
  const text =
    `${icon} <b>Demande de congé ${verb}</b>\n` +
    `${typeLabel} ${args.nb_jours}j — ${args.date_debut} → ${args.date_fin}` +
    (args.commentaire ? `\n<i>Note du manager : ${args.commentaire}</i>` : '')
  try {
    await sendTelegramMessage(args.employe_chat_id, text)
    await audit({ chat_id: args.employe_chat_id, societe_id: args.societe_id, intent: 'notify.leave.decided', status: 'success', payload: { decision: args.decision } })
    return { sent: true }
  } catch (e: any) {
    await audit({ chat_id: args.employe_chat_id, societe_id: args.societe_id, intent: 'notify.leave.decided', status: 'error', error_msg: e?.message })
    return { sent: false, reason: 'send_failed' }
  }
}

/** Push simple à un chat_id donné — utilisé par le cron pour MRA / banque / factures. */
export async function pushTo(chat_id: number, text: string, societe_id: string, intent: string) {
  try {
    await sendTelegramMessage(chat_id, text)
    await audit({ chat_id, societe_id, intent, status: 'success' })
    return true
  } catch (e: any) {
    await audit({ chat_id, societe_id, intent, status: 'error', error_msg: e?.message })
    return false
  }
}
