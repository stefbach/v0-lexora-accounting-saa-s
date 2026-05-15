import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/telegram/auth'

/**
 * GET /api/telegram/cron-alerts
 *
 * Endpoint cron quotidien (Vercel Cron ou n8n cron node) :
 * - Échéances MRA (J-N selon mra_deadline_advance_days)
 * - Factures clients en retard (> N jours)
 * - Solde bancaire sous seuil
 * - Daily digest (KPIs)
 *
 * Auth: header X-Internal-Token = INTERNAL_API_TOKEN
 */
export async function GET(req: NextRequest) {
  const internalToken = req.headers.get('x-internal-token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = getAdminClient()
  let alertsSent = 0
  const errors: string[] = []

  // ------- 1. Échéances MRA -------
  const { data: mraAlerts } = await admin
    .from('vw_telegram_mra_alerts')
    .select('*')
    .eq('enable_mra_deadlines', true)

  for (const a of mraAlerts || []) {
    if (a.days_until > a.mra_deadline_advance_days) continue
    // Cibler les directeurs/comptables de cette société
    const recipients = await getRecipients(admin, a.societe_id, ['direction', 'comptable', 'client_admin'])
    const emoji = a.days_until < 0 ? '🚨' : a.days_until <= 1 ? '⚠️' : '📅'
    const txt = `${emoji} <b>Échéance MRA — ${a.societe_nom}</b>\n` +
                `${a.echeance_type} ${a.reference}\n` +
                `Date : ${a.date_echeance}\n` +
                (a.days_until < 0 ? `<b>En retard de ${-a.days_until} jour(s)</b>` :
                 a.days_until === 0 ? `<b>Aujourd'hui</b>` :
                 `Dans ${a.days_until} jour(s)`)
    for (const chatId of recipients) {
      try { await sendTelegramMessage(chatId, txt); alertsSent++ } catch (e: any) { errors.push(e.message) }
    }
  }

  // ------- 2. Factures clients en retard -------
  const today = new Date().toISOString().slice(0, 10)
  const { data: overdueInv } = await admin
    .from('factures')
    .select('id, numero, tiers, montant_ttc, date_echeance, societe_id')
    .lt('date_echeance', today)
    .eq('statut', 'en_attente')
    .eq('type_document', 'facture')
    .limit(200)

  // Group by societe to avoid spamming
  const bySoc = new Map<string, any[]>()
  for (const inv of overdueInv || []) {
    if (!bySoc.has(inv.societe_id)) bySoc.set(inv.societe_id, [])
    bySoc.get(inv.societe_id)!.push(inv)
  }
  for (const [societeId, invs] of bySoc) {
    const { data: cfg } = await admin
      .from('telegram_alerts_config')
      .select('enable_invoice_overdue, invoice_overdue_days')
      .eq('societe_id', societeId)
      .maybeSingle()
    if (!cfg?.enable_invoice_overdue) continue
    const filtered = invs.filter(i => {
      const daysOverdue = Math.floor((Date.now() - new Date(i.date_echeance).getTime()) / 86400_000)
      return daysOverdue >= cfg.invoice_overdue_days
    })
    if (filtered.length === 0) continue
    const total = filtered.reduce((s, i) => s + Number(i.montant_ttc || 0), 0)
    const recipients = await getRecipients(admin, societeId, ['direction', 'client_admin'])
    const lines = filtered.slice(0, 5).map(i =>
      `• ${i.numero} — ${i.tiers || '—'} : ${Number(i.montant_ttc).toLocaleString('fr-FR')} MUR (échue ${i.date_echeance})`).join('\n')
    const more = filtered.length > 5 ? `\n... et ${filtered.length - 5} autres` : ''
    const txt = `📌 <b>${filtered.length} facture(s) en retard</b>\nTotal : ${total.toLocaleString('fr-FR')} MUR\n\n${lines}${more}`
    for (const chatId of recipients) {
      try { await sendTelegramMessage(chatId, txt); alertsSent++ } catch (e: any) { errors.push(e.message) }
    }
  }

  // ------- 3. Solde bancaire sous seuil -------
  const { data: lowBalances } = await admin
    .from('comptes_bancaires')
    .select('id, libelle, devise, solde_actuel, societe_id')
    .gt('solde_actuel', 0)  // skip zeros (often empty accounts)

  for (const acc of lowBalances || []) {
    const { data: cfg } = await admin
      .from('telegram_alerts_config')
      .select('enable_low_balance, low_balance_threshold_mur')
      .eq('societe_id', acc.societe_id)
      .maybeSingle()
    if (!cfg?.enable_low_balance) continue
    if (Number(acc.solde_actuel) >= Number(cfg.low_balance_threshold_mur)) continue
    const recipients = await getRecipients(admin, acc.societe_id, ['direction', 'client_admin'])
    const txt = `💰 <b>Solde faible — ${acc.libelle}</b>\n` +
                `Solde actuel : ${Number(acc.solde_actuel).toLocaleString('fr-FR')} ${acc.devise}\n` +
                `Seuil configuré : ${Number(cfg.low_balance_threshold_mur).toLocaleString('fr-FR')} MUR`
    for (const chatId of recipients) {
      try { await sendTelegramMessage(chatId, txt); alertsSent++ } catch (e: any) { errors.push(e.message) }
    }
  }

  return NextResponse.json({ ok: true, alerts_sent: alertsSent, errors: errors.length ? errors : undefined })
}

async function getRecipients(admin: any, societeId: string, roles: string[]): Promise<number[]> {
  // 1. Trouve les users avec ces rôles dans cette société
  const { data: users } = await admin
    .from('user_societes')
    .select('user_id, role')
    .eq('societe_id', societeId)
    .in('role', roles)
  const userIds = (users || []).map((u: any) => u.user_id)
  if (userIds.length === 0) return []
  // 2. Récupère leurs chat_id Telegram (vérifiés + current_societe = cette société)
  const { data: tgUsers } = await admin
    .from('telegram_users')
    .select('chat_id')
    .in('user_id', userIds)
    .eq('verified', true)
    .eq('current_societe_id', societeId)
  return (tgUsers || []).map((t: any) => t.chat_id)
}
