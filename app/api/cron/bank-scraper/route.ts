/**
 * Cron quotidien — scrape automatique de tous les comptes bancaires configurés.
 *
 * Déclenché par Vercel Cron à 02:00 UTC (06:00 Maurice) cf. vercel.json.
 * Pour chaque compte avec credentials actives :
 *   1. Lance le robot Playwright (lib/banks/scraper.ts)
 *   2. Insère bank_scrape_runs avec balance + transactions
 *   3. Détecte les anomalies (balance_mismatch, balance_drop)
 *   4. Si anomalie critique → push notif Telegram à direction + comptable
 *
 * AUTH : Header 'Authorization: Bearer <CRON_SECRET>'.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { verifyCronSecret } from '@/lib/claude'
import { getAdminClient } from '@/lib/supabase/admin'
import { scrapeBankAccount, detectAnomalies, BANK_NAMES, type BankCode } from '@/lib/banks/scraper'
import { chatIdsForRole, pushTo } from '@/lib/telegram/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
  }

  const admin = getAdminClient()
  const stats = { comptes_total: 0, success: 0, failed: 0, manual_needed: 0, anomalies: 0 }

  // Liste tous les comptes avec credentials actives
  const { data: creds } = await admin
    .from('comptes_bancaires_scraping_creds')
    .select('compte_bancaire_id')
    .eq('active', true)
    .not('username_enc', 'is', null)
    .not('password_enc', 'is', null)

  if (!creds || creds.length === 0) {
    return NextResponse.json({ ok: true, stats, message: 'Aucun compte avec credentials actives' })
  }

  stats.comptes_total = creds.length

  for (const cred of creds) {
    const { data: compte } = await admin
      .from('comptes_bancaires')
      .select('id, societe_id, banque, numero_compte')
      .eq('id', cred.compte_bancaire_id)
      .maybeSingle()
    if (!compte) continue

    const result = await scrapeBankAccount({
      compte_bancaire_id: compte.id,
      societe_id: compte.societe_id,
      trigger_source: 'cron',
    })

    if (result.status === 'success') {
      stats.success++
      await detectAnomalies(compte.id, result)
    } else if (result.status === 'failed') {
      stats.failed++
    } else if (result.status === 'manual_needed') {
      stats.manual_needed++
    }

    // Notif Telegram si anomalies critiques non encore notifiées
    const { data: anomalies } = await admin
      .from('bank_scrape_anomalies')
      .select('id, type, severity, details, detected_at')
      .eq('compte_bancaire_id', compte.id)
      .eq('status', 'open')
      .is('notified_telegram_at', null)
      .in('severity', ['warning', 'critical'])

    if (anomalies && anomalies.length > 0) {
      const recipients = await chatIdsForRole(compte.societe_id, ['direction', 'client_admin', 'admin', 'comptable', 'comptable_dedie'])
      for (const a of anomalies) {
        stats.anomalies++
        const icon = a.severity === 'critical' ? '🔴' : '🟠'
        const label = a.type === 'balance_mismatch' ? 'Solde incohérent'
          : a.type === 'balance_drop' ? 'Variation anormale de solde'
          : a.type === 'missing_in_releve' ? 'Tx scrapée absente du relevé'
          : a.type === 'missing_in_scrape' ? 'Tx du relevé jamais vue'
          : a.type
        const text =
          `${icon} <b>Anomalie bancaire</b> — ${BANK_NAMES[compte.banque as BankCode] || compte.banque}\n` +
          `Compte ${compte.numero_compte || compte.id.slice(0, 8)}\n` +
          `Type : ${label}\n` +
          `Détails : <code>${JSON.stringify(a.details).slice(0, 200)}</code>`
        for (const r of recipients) {
          await pushTo(r.chat_id, text, compte.societe_id, 'notify.bank.anomaly')
        }
        await admin.from('bank_scrape_anomalies')
          .update({ notified_telegram_at: new Date().toISOString() })
          .eq('id', a.id)
      }
    }
  }

  return NextResponse.json({ ok: true, stats })
}
