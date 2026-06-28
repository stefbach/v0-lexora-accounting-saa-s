/**
 * Cron quotidien (08:00 UTC) — Rappels documents manquants via Telegram.
 *
 * Pour chaque société :
 *   1. Relevés bancaires manquants pour le mois en cours
 *   2. Factures clients en brouillon / non émises
 *   3. Aucune facture fournisseur du mois (suspect pour TVA)
 *   4. Déclaration TVA du mois précédent (J-7 → J-1 de l'échéance)
 *   5. Charges sociales (PAYE / CSG / NSF) — soumission du mois précédent (J-7)
 *
 * Destinataires : roles comptable+ et direction+ de la société.
 * Format : message court + boutons inline [✅ Reçu/Soumis] [⏰ Rappeler dans 7j].
 *
 * Idempotence : on insère un audit `telegram_actions` avec intent=`notify.document.missing`
 * et `notify_key` quotidien dans payload. La table `telegram_doc_reminders_state`
 * permet en plus de couper définitivement le rappel si l'utilisateur a cliqué "Reçu".
 *
 * AUTH : Header 'Authorization: Bearer <CRON_SECRET>'.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { chatIdsForRole } from '@/lib/telegram/notify'
import { sendTelegramInlineButtons, type InlineButton } from '@/lib/telegram/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type ServiceClient = ReturnType<typeof getServiceClient>

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function previousMonthPeriod(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  return periodOf(x)
}

function monthBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { start, end }
}

async function alreadyNotifiedToday(
  supabase: ServiceClient,
  societe_id: string,
  notifyKey: string,
): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('telegram_actions')
    .select('id, payload')
    .eq('societe_id', societe_id)
    .eq('intent', 'notify.document.missing.key')
    .gte('created_at', startOfDay.toISOString())
    .limit(100)
  return (data || []).some((r: any) => r?.payload?.notify_key === notifyKey)
}

async function logIdempotenceKey(
  supabase: ServiceClient,
  societe_id: string,
  notifyKey: string,
) {
  try {
    await supabase.from('telegram_actions').insert({
      chat_id: 0,
      societe_id,
      intent: 'notify.document.missing.key',
      payload: { notify_key: notifyKey },
      status: 'success',
    })
  } catch {
    // audit best-effort
  }
}

async function isStopped(
  supabase: ServiceClient,
  societe_id: string,
  type: string,
  period: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('telegram_doc_reminders_state')
    .select('status, snoozed_until')
    .eq('societe_id', societe_id)
    .eq('type', type)
    .eq('period', period)
    .maybeSingle()
  if (!data) return false
  if (data.status === 'received') return true
  if (data.status === 'snoozed' && data.snoozed_until && new Date(data.snoozed_until) > new Date()) {
    return true
  }
  return false
}

async function safeSend(
  supabase: ServiceClient,
  societe_id: string,
  chat_id: number,
  text: string,
  buttons: InlineButton[][],
): Promise<boolean> {
  try {
    await sendTelegramInlineButtons(chat_id, text, buttons)
    await supabase.from('telegram_actions').insert({
      chat_id,
      societe_id,
      intent: 'notify.document.missing',
      status: 'success',
      payload: { kind: 'reminder' },
    })
    return true
  } catch (e: any) {
    try {
      await supabase.from('telegram_actions').insert({
        chat_id,
        societe_id,
        intent: 'notify.document.missing',
        status: 'error',
        error_msg: e?.message?.slice(0, 500) ?? null,
      })
    } catch { /* swallow */ }
    return false
  }
}

interface ReminderJob {
  type: string                // clef stable pour idempotence + ack
  period: string              // YYYY-MM concerné
  text: string                // contenu Telegram (HTML)
  statKey: 'releves' | 'factures_clients' | 'factures_fournisseurs' | 'tva' | 'social'
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
  }

  const supabase = getServiceClient()
  const now = new Date()
  const todayPeriod = periodOf(now)
  const prevPeriod = previousMonthPeriod(now)
  const dayOfMonth = now.getUTCDate()

  const stats = {
    societes: 0,
    releves: 0,
    factures_clients: 0,
    factures_fournisseurs: 0,
    tva: 0,
    social: 0,
    sent: 0,
    errors: 0,
  }

  // On scanne toutes les sociétés actives
  const { data: societes, error: socErr } = await supabase
    .from('societes')
    .select('id, nom, statut')
    .eq('statut', 'active')

  if (socErr) {
    return NextResponse.json({ error: socErr.message }, { status: 500 })
  }

  for (const soc of societes || []) {
    stats.societes++
    const societe_id: string = soc.id

    const recipients = await chatIdsForRole(societe_id, [
      'comptable', 'comptable_dedie',
      'direction', 'client_admin',
      'admin', 'super_admin',
    ])
    if (!recipients.length) continue

    const jobs: ReminderJob[] = []

    // ── 1. Relevés bancaires manquants — mois en cours ───────────────────
    const { start: monthStart, end: monthEnd } = monthBounds(todayPeriod)
    const { data: comptes } = await supabase
      .from('comptes_bancaires')
      .select('id, nom_compte, banque')
      .eq('societe_id', societe_id)
      .eq('actif', true)

    for (const c of comptes || []) {
      const { data: releve } = await supabase
        .from('releves_bancaires')
        .select('id')
        .eq('compte_bancaire_id', c.id)
        .or(`date_debut.gte.${monthStart},date_fin.gte.${monthStart}`)
        .lte('date_debut', monthEnd)
        .limit(1)
        .maybeSingle()
      if (releve) continue

      jobs.push({
        type: `releve_bancaire:${c.id}`,
        period: todayPeriod,
        statKey: 'releves',
        text:
          `📄 <b>Relevé bancaire manquant</b>\n` +
          `${c.banque || 'Banque'} — ${c.nom_compte || '?'}\n` +
          `Période : ${todayPeriod}`,
      })
      stats.releves++
    }

    // ── 2. Factures clients en brouillon ──────────────────────────────────
    const { data: brouillons } = await supabase
      .from('factures')
      .select('id, numero_facture, statut')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'client')
      .in('statut', ['brouillon'])
      .limit(50)

    if (brouillons && brouillons.length > 0) {
      jobs.push({
        type: 'factures_clients_brouillon',
        period: todayPeriod,
        statKey: 'factures_clients',
        text:
          `🧾 <b>Factures clients à finaliser</b>\n` +
          `${brouillons.length} facture(s) en brouillon / non émise(s).\n` +
          `Pense à les valider pour la TVA du mois.`,
      })
      stats.factures_clients++
    }

    // ── 3. Aucune facture fournisseur ce mois-ci ─────────────────────────
    const { count: nbAchats } = await supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id)
      .eq('type_facture', 'fournisseur')
      .gte('date_facture', monthStart)
      .lte('date_facture', monthEnd)

    if ((nbAchats || 0) === 0) {
      jobs.push({
        type: 'factures_fournisseurs',
        period: todayPeriod,
        statKey: 'factures_fournisseurs',
        text:
          `📥 <b>Aucune facture fournisseur ce mois</b>\n` +
          `Période ${todayPeriod} : 0 facture d'achat enregistrée.\n` +
          `Vérifie si c'est normal (pas d'achat) ou si des pièces manquent.`,
      })
      stats.factures_fournisseurs++
    }

    // ── 4. TVA mois précédent — fenêtre J-7 → J-1 de la date_limite ──────
    // date_limite = 20 du mois suivant la période → on regarde si le rappel
    // tombe entre 13 et 19 du mois courant pour la période M-1.
    const { data: tva } = await supabase
      .from('tva_mensuelle')
      .select('id, statut_declaration, date_limite, date_declaration')
      .eq('societe_id', societe_id)
      .eq('periode', prevPeriod)
      .maybeSingle()

    // Si pas d'entrée TVA ou pas déclarée et qu'on est dans la fenêtre :
    if (dayOfMonth >= 13 && dayOfMonth <= 19) {
      const declared = tva?.statut_declaration === 'declare'
      if (!declared) {
        jobs.push({
          type: 'tva',
          period: prevPeriod,
          statKey: 'tva',
          text:
            `🚨 <b>TVA ${prevPeriod} à déclarer</b>\n` +
            `Échéance MRA : 20 ${todayPeriod} (J-${20 - dayOfMonth}).\n` +
            (tva ? 'Brouillon trouvé — à valider et soumettre.' : 'Aucun brouillon TVA enregistré.'),
        })
        stats.tva++
      }
    }

    // ── 5. Charges sociales (PAYE/CSG/NSF) — J-7 de l'échéance (= 13 du mois) ─
    // L'échéance MRA des charges sociales est généralement le 20 du mois suivant.
    // On signale à J-7 (donc 13 du mois) si la paie M-1 n'est pas verrouillée.
    if (dayOfMonth === 13) {
      const { data: paieLock } = await supabase
        .from('paie_periodes_lock')
        .select('periode, statut')
        .eq('societe_id', societe_id)
        .eq('periode', prevPeriod)
        .maybeSingle()

      if (!paieLock || paieLock.statut !== 'locked') {
        jobs.push({
          type: 'social',
          period: prevPeriod,
          statKey: 'social',
          text:
            `🏛️ <b>Charges sociales ${prevPeriod}</b>\n` +
            `PAYE / CSG / NSF à soumettre avant le 20 (J-7).\n` +
            (paieLock ? `Paie en cours (statut: ${paieLock.statut}).` : 'Paie non clôturée.'),
        })
        stats.social++
      }
    }

    // ── ENVOI des jobs ────────────────────────────────────────────────────
    for (const job of jobs) {
      if (await isStopped(supabase, societe_id, job.type, job.period)) continue

      const notifyKey = `docrem:${job.type}:${job.period}:${now.toISOString().slice(0, 10)}`
      if (await alreadyNotifiedToday(supabase, societe_id, notifyKey)) continue

      const buttons: InlineButton[][] = [[
        { text: '✅ Reçu/Soumis', callback_data: `doc.received:${job.type}:${job.period}` },
        { text: '⏰ Dans 7j',     callback_data: `doc.snooze:${job.type}:${job.period}:7` },
      ]]

      let anySent = false
      for (const r of recipients) {
        const ok = await safeSend(supabase, societe_id, r.chat_id, job.text, buttons)
        if (ok) { stats.sent++; anySent = true } else { stats.errors++ }
      }
      if (anySent) await logIdempotenceKey(supabase, societe_id, notifyKey)
    }
  }

  return NextResponse.json({ ok: true, stats })
}
