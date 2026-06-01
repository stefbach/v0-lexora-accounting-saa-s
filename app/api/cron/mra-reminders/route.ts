/**
 * Cron quotidien — rappels MRA progressifs (MRA Compliance Hub, phase 2).
 *
 * Parcourt toutes les déclarations mra_declarations encore actives
 * (statut ∉ paye/sans_objet) et, pour chacune, applique les règles
 * mra_reminder_rules dont l'offset_days correspond au nombre de jours
 * jusqu'à l'échéance (négatif = avant, 0 = jour J, positif = retard).
 *
 * Canaux :
 *   • telegram  → pushTo (direction/client_admin/admin de la société)
 *   • email     → best-effort via Resend fallback aux emails des mêmes rôles
 *   • dashboard → pas d'envoi (déjà visible via vw_mra_compliance_status)
 *
 * Anti-doublon : table mra_reminder_log (UNIQUE declaration+offset+canal).
 *
 * AUTH : Header 'Authorization: Bearer <CRON_SECRET>'.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { chatIdsForRole, pushTo } from '@/lib/telegram/notify'
import { sendEmailFallbackResend } from '@/lib/email/router'

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

const TYPE_LABEL: Record<string, string> = {
  PAYE: 'PAYE', CSG: 'CSG', NSF: 'NSF', TDS: 'TDS', TVA: 'TVA',
  CIT: 'Impôt société (CIT)', APS: 'Acompte APS', IT_FORM3: 'IT Form 3 (TDS annuel)',
}

function renderTpl(tpl: string, d: any, jours: number): string {
  return tpl
    .replace(/{type}/g, TYPE_LABEL[d.type] || d.type)
    .replace(/{periode}/g, d.periode)
    .replace(/{montant}/g, fmtMUR(Number(d.montant_du) || 0))
    .replace(/{echeance}/g, String(d.date_echeance))
    .replace(/{jours}/g, String(Math.abs(jours)))
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const supabase = getServiceClient()
  const stats = { declarations: 0, telegram: 0, email: 0, skipped: 0, errors: 0 }

  // Règles actives
  const { data: rules } = await supabase
    .from('mra_reminder_rules').select('*').eq('actif', true)
  const activeRules = (rules || []) as any[]
  if (activeRules.length === 0) return NextResponse.json({ ok: true, stats, note: 'aucune règle active' })

  // Déclarations encore à traiter
  const { data: decls } = await supabase
    .from('mra_declarations')
    .select('*')
    .not('statut', 'in', '(paye,sans_objet)')
    .gt('montant_du', 0)
  const list = (decls || []) as any[]

  const today = new Date(); today.setUTCHours(0, 0, 0, 0)

  // Cache des destinataires par société
  const tgCache = new Map<string, { chat_id: number }[]>()
  const emailCache = new Map<string, string[]>()

  async function tgRecipients(societe_id: string) {
    if (!tgCache.has(societe_id)) {
      const r = await chatIdsForRole(societe_id, ['direction', 'client_admin', 'admin', 'super_admin'])
      tgCache.set(societe_id, r.map(x => ({ chat_id: x.chat_id })))
    }
    return tgCache.get(societe_id)!
  }
  async function emailRecipients(societe_id: string): Promise<string[]> {
    if (!emailCache.has(societe_id)) {
      const { data: us } = await supabase.from('user_societes')
        .select('user_id').eq('societe_id', societe_id)
        .in('role', ['direction', 'client_admin', 'admin', 'super_admin'])
      const ids = (us || []).map((u: any) => u.user_id)
      let emails: string[] = []
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('email').in('id', ids)
        emails = (profs || []).map((p: any) => p.email).filter((e: any) => e && /@/.test(e))
      }
      emailCache.set(societe_id, [...new Set(emails)])
    }
    return emailCache.get(societe_id)!
  }

  for (const d of list) {
    stats.declarations++
    const ech = new Date(String(d.date_echeance) + 'T00:00:00Z')
    const jours = Math.floor((ech.getTime() - today.getTime()) / 86400000) // négatif = échéance passée
    // Règles dont l'offset correspond exactement à aujourd'hui
    const matching = activeRules.filter(r =>
      (r.type == null || r.type === d.type) && Number(r.offset_days) === jours,
    )
    for (const rule of matching) {
      // Anti-doublon
      const { data: existing } = await supabase
        .from('mra_reminder_log').select('id')
        .eq('declaration_id', d.id).eq('offset_days', jours).eq('canal', rule.canal)
        .maybeSingle()
      if (existing) { stats.skipped++; continue }

      const tpl = rule.message_tpl || '{type} {periode} — {montant} (échéance {echeance})'
      const msg = renderTpl(tpl, d, jours)

      let sentAny = false
      try {
        if (rule.canal === 'telegram') {
          const rec = await tgRecipients(d.societe_id)
          for (const r of rec) {
            const ok = await pushTo(r.chat_id, msg, d.societe_id, 'notify.mra.reminder')
            if (ok) { stats.telegram++; sentAny = true } else stats.errors++
          }
        } else if (rule.canal === 'email') {
          const emails = await emailRecipients(d.societe_id)
          const plain = msg.replace(/<[^>]+>/g, '')
          for (const to of emails) {
            try {
              const r = await sendEmailFallbackResend({
                to: [to],
                subject: `Lexora MRA — ${TYPE_LABEL[d.type] || d.type} ${d.periode}`,
                html: `<p>${msg}</p><p style="color:#888;font-size:12px">Rappel automatique Lexora — conformité MRA.</p>`,
                text: plain,
              })
              if (r.ok) { stats.email++; sentAny = true } else stats.errors++
            } catch { stats.errors++ }
          }
        } else {
          // dashboard : pas d'envoi, on logue juste pour ne pas re-traiter
          sentAny = true
        }
      } catch { stats.errors++ }

      // Log (même si dashboard) pour idempotence
      await supabase.from('mra_reminder_log').insert({
        declaration_id: d.id, rule_id: rule.id, canal: rule.canal, offset_days: jours,
      }).then(() => {}, () => {})

      // Passe automatiquement en RETARD si échéance dépassée et encore a_faire/auto
      if (jours < 0 && ['auto', 'a_faire'].includes(d.statut)) {
        await supabase.from('mra_declarations')
          .update({ statut: 'retard', updated_at: new Date().toISOString() })
          .eq('id', d.id).then(() => {}, () => {})
      }
      void sentAny
    }
  }

  return NextResponse.json({ ok: true, stats })
}
