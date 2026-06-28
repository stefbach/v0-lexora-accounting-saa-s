/**
 * Cron quotidien — notifications push Telegram time-based.
 *
 * Pour chaque société ayant une config alerts (telegram_alerts_config) :
 *  - MRA deadlines J-N (N = mra_deadline_advance_days, défaut 7) + J-3 + J-1
 *  - Bank balance < low_balance_threshold_mur (défaut 50 000 MUR)
 *  - Factures clients en retard > invoice_overdue_days (défaut 30 j)
 *
 * Destinataires : direction + client_admin + admin de la société (via leur chat_id Telegram).
 *
 * Idempotence : on insère un audit `telegram_actions` avec intent=notify.<type>
 * et clef `notify_key` dans payload — un cron qui re-tourne le même jour
 * vérifie l'existence préalable avant de renvoyer.
 *
 * AUTH : Header 'Authorization: Bearer <CRON_SECRET>'.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { chatIdsForRole, pushTo } from '@/lib/telegram/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function fmtMUR(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' MUR'
}

function daysBetween(dateStr: string, today: Date): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  return Math.floor((d.getTime() - today.getTime()) / 86400000)
}

async function alreadyNotifiedToday(
  supabase: ReturnType<typeof getServiceClient>,
  societe_id: string,
  intent: string,
  notifyKey: string,
): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('telegram_actions')
    .select('id, payload')
    .eq('societe_id', societe_id)
    .eq('intent', intent)
    .eq('status', 'success')
    .gte('created_at', startOfDay.toISOString())
    .limit(50)
  return (data || []).some((r: any) => r?.payload?.notify_key === notifyKey)
}

async function logIdempotenceKey(
  supabase: ReturnType<typeof getServiceClient>,
  societe_id: string,
  intent: string,
  notifyKey: string,
) {
  await supabase.from('telegram_actions').insert({
    chat_id: 0,
    societe_id,
    intent: `${intent}.key`,
    payload: { notify_key: notifyKey },
    status: 'success',
  })
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
  }

  const supabase = getServiceClient()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayIso = today.toISOString().slice(0, 10)

  const stats = { societes: 0, mra: 0, balance: 0, overdue: 0, errors: 0 }

  const { data: configs, error: cfgErr } = await supabase
    .from('telegram_alerts_config')
    .select('societe_id, enable_mra_deadlines, mra_deadline_advance_days, enable_low_balance, low_balance_threshold_mur, enable_invoice_overdue, invoice_overdue_days')
  if (cfgErr) {
    return NextResponse.json({ error: cfgErr.message }, { status: 500 })
  }

  for (const cfg of configs || []) {
    stats.societes++
    const societe_id = cfg.societe_id

    const recipients = await chatIdsForRole(societe_id, ['direction', 'client_admin', 'admin', 'super_admin'])
    if (!recipients.length) continue

    // ── 1. MRA deadlines J-N, J-3, J-1 ──────────────────────────────────────
    if (cfg.enable_mra_deadlines) {
      const advance = cfg.mra_deadline_advance_days ?? 7
      const triggers = [advance, 3, 1].filter((v, i, a) => a.indexOf(v) === i)
      const { data: deadlines } = await supabase
        .from('vw_tax_calendar')
        .select('echeance_type, reference, date_echeance, statut, montant_mur')
        .eq('societe_id', societe_id)
        .gte('date_echeance', todayIso)
        .lte('date_echeance', new Date(today.getTime() + advance * 86400000).toISOString().slice(0, 10))

      for (const d of deadlines || []) {
        if ((d.statut || '').toLowerCase() === 'declare' || (d.statut || '').toLowerCase() === 'paye') continue
        const days = daysBetween(d.date_echeance, today)
        if (!triggers.includes(days)) continue

        const notifyKey = `mra:${d.echeance_type}:${d.reference}:${d.date_echeance}:${days}`
        if (await alreadyNotifiedToday(supabase, societe_id, 'notify.mra.deadline', notifyKey)) continue

        const urgency = days === 1 ? '🔴' : days <= 3 ? '🟠' : '🟡'
        const text =
          `${urgency} <b>Échéance MRA dans ${days}j</b>\n` +
          `${d.echeance_type} ${d.reference}\n` +
          `Date limite : ${d.date_echeance}` +
          (d.montant_mur ? `\nMontant estimé : ${fmtMUR(Number(d.montant_mur))}` : '')

        for (const r of recipients) {
          const ok = await pushTo(r.chat_id, text, societe_id, 'notify.mra.deadline')
          if (ok) stats.mra++
          else stats.errors++
        }
        await logIdempotenceKey(supabase, societe_id, 'notify.mra.deadline', notifyKey)
      }
    }

    // ── 2. Bank balance < threshold ─────────────────────────────────────────
    if (cfg.enable_low_balance) {
      const threshold = Number(cfg.low_balance_threshold_mur ?? 50000)
      const { data: comptes } = await supabase
        .from('comptes_bancaires')
        .select('id, nom_compte, banque, devise, solde_actuel')
        .eq('societe_id', societe_id)
        .eq('actif', true)
      for (const c of comptes || []) {
        if (c.devise !== 'MUR') continue
        const solde = Number(c.solde_actuel || 0)
        if (solde >= threshold) continue

        const notifyKey = `lowbal:${c.id}:${todayIso}`
        if (await alreadyNotifiedToday(supabase, societe_id, 'notify.bank.low', notifyKey)) continue

        const text =
          `💰 <b>Solde bancaire bas</b>\n` +
          `${c.banque || 'Compte'} — ${c.nom_compte}\n` +
          `Solde : <b>${fmtMUR(solde)}</b> (seuil ${fmtMUR(threshold)})`
        for (const r of recipients) {
          const ok = await pushTo(r.chat_id, text, societe_id, 'notify.bank.low')
          if (ok) stats.balance++
          else stats.errors++
        }
        await logIdempotenceKey(supabase, societe_id, 'notify.bank.low', notifyKey)
      }
    }

    // ── 3. Factures clients en retard > N jours ─────────────────────────────
    if (cfg.enable_invoice_overdue) {
      const overdueDays = cfg.invoice_overdue_days ?? 30
      const cutoff = new Date(today.getTime() - overdueDays * 86400000).toISOString().slice(0, 10)
      const { data: factures } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, date_echeance, solde_non_paye, montant_mur, montant_ttc')
        .eq('societe_id', societe_id)
        .eq('type_facture', 'client')
        .in('statut', ['en_attente', 'partiel', 'retard'])
        .lte('date_echeance', cutoff)
        .order('date_echeance', { ascending: true })
        .limit(20)

      if (factures && factures.length > 0) {
        const totalDu = factures.reduce((sum: number, f: any) => {
          const s = Number(f.solde_non_paye)
          return sum + (Number.isFinite(s) && s > 0 ? s : Number(f.montant_mur) || Number(f.montant_ttc) || 0)
        }, 0)

        const notifyKey = `overdue:${todayIso}:${factures.length}`
        if (!(await alreadyNotifiedToday(supabase, societe_id, 'notify.invoice.overdue', notifyKey))) {
          const lignes = factures.slice(0, 5).map((f: any) => {
            const jours = daysBetween(f.date_echeance, today)
            const solde = Number(f.solde_non_paye) || Number(f.montant_mur) || 0
            return `• ${f.numero_facture || '?'} ${f.tiers || ''} — ${fmtMUR(solde)} (${-jours}j retard)`
          }).join('\n')
          const more = factures.length > 5 ? `\n…et ${factures.length - 5} autres` : ''
          const text =
            `🧾 <b>Factures en retard > ${overdueDays}j</b>\n` +
            `${factures.length} facture(s) — total ${fmtMUR(totalDu)}\n\n` +
            lignes + more

          for (const r of recipients) {
            const ok = await pushTo(r.chat_id, text, societe_id, 'notify.invoice.overdue')
            if (ok) stats.overdue++
            else stats.errors++
          }
          await logIdempotenceKey(supabase, societe_id, 'notify.invoice.overdue', notifyKey)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, stats })
}
