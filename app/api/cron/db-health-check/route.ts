import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { envoyerNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Daily DB health check — runs 3 levels:
//  L1 AUTO-FIX: deterministic repairs with audit trail
//  L2 NOTIFY:   issues the accountant must handle (WhatsApp)
//  L3 ALERT:    critical issues logged only (to health dashboard)
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const t0 = Date.now()
  const supabase = getServiceClient()
  const cronName = 'db-health-check'

  const anomalies: Array<{ type: string; severity: string; details: string; count?: number }> = []
  const autoFixed: Array<{ type: string; table: string; id: string; old?: any; new?: any }> = []
  const needsAction: Array<{ type: string; severity: string; details: string; count?: number }> = []

  try {
    const now = new Date()
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // ══════════════════════════════════════════════════════════
    // LEVEL 1 — AUTO-FIX (deterministic, reversible)
    // ══════════════════════════════════════════════════════════

    // 1.1 Documents stuck 'en_cours' > 10 min → mark 'erreur'
    try {
      const { data: stuckDocs } = await supabase
        .from('documents')
        .select('id, nom_fichier, created_at')
        .eq('statut', 'en_cours')
        .lt('created_at', tenMinAgo)
      for (const d of stuckDocs || []) {
        await supabase.from('documents').update({ statut: 'erreur' }).eq('id', d.id)
        autoFixed.push({ type: 'document_stuck', table: 'documents', id: d.id, old: { statut: 'en_cours' }, new: { statut: 'erreur' } })
      }
    } catch (e) { console.warn('[health-check] 1.1 failed:', e) }

    // 1.2 Factures montant_mur=0 but montant_ttc>0 → recalculate
    try {
      const { data: zeroMurs } = await supabase
        .from('factures')
        .select('id, montant_ttc, devise, taux_change, montant_mur')
        .eq('montant_mur', 0)
        .gt('montant_ttc', 0)
      for (const f of zeroMurs || []) {
        const fx = Number(f.taux_change) || 1
        const newMur = Math.round(Number(f.montant_ttc) * fx * 100) / 100
        if (newMur > 0) {
          await supabase.from('factures').update({ montant_mur: newMur }).eq('id', f.id)
          autoFixed.push({ type: 'facture_mur_recalc', table: 'factures', id: f.id, old: { montant_mur: 0 }, new: { montant_mur: newMur } })
        }
      }
    } catch (e) { console.warn('[health-check] 1.2 failed:', e) }

    // 1.3 Factures date_echeance null → date_facture + 30 days
    try {
      const { data: noEcheance } = await supabase
        .from('factures')
        .select('id, date_facture')
        .is('date_echeance', null)
        .not('date_facture', 'is', null)
      for (const f of noEcheance || []) {
        const d = new Date(f.date_facture)
        d.setDate(d.getDate() + 30)
        const newEcheance = d.toISOString().split('T')[0]
        await supabase.from('factures').update({ date_echeance: newEcheance }).eq('id', f.id)
        autoFixed.push({ type: 'facture_echeance_default', table: 'factures', id: f.id, old: { date_echeance: null }, new: { date_echeance: newEcheance } })
      }
    } catch (e) { console.warn('[health-check] 1.3 failed:', e) }

    // 1.4 ecritures_comptables_v2 societe_id null → fix from dossier_id
    try {
      const { data: orphanEcr } = await supabase
        .from('ecritures_comptables_v2')
        .select('id, dossier_id')
        .is('societe_id', null)
        .not('dossier_id', 'is', null)
        .limit(500)
      for (const e of orphanEcr || []) {
        const { data: d } = await supabase.from('dossiers').select('societe_id').eq('id', e.dossier_id).single()
        if (d?.societe_id) {
          await supabase.from('ecritures_comptables_v2').update({ societe_id: d.societe_id }).eq('id', e.id)
          autoFixed.push({ type: 'ecriture_societe_backfill', table: 'ecritures_comptables_v2', id: e.id, old: { societe_id: null }, new: { societe_id: d.societe_id } })
        }
      }
    } catch (e) { console.warn('[health-check] 1.4 failed:', e) }

    // 1.5 Factures tiers empty or JSON-like → flag needs_reprocess via document.n8n_result
    try {
      const { data: badTiers } = await supabase
        .from('factures')
        .select('id, tiers, document_id')
        .or('tiers.is.null,tiers.eq.,tiers.like.{%')
        .not('document_id', 'is', null)
        .limit(200)
      for (const f of badTiers || []) {
        if (!f.document_id) continue
        const { data: doc } = await supabase.from('documents').select('n8n_result').eq('id', f.document_id).single()
        const current = (doc?.n8n_result as any) || {}
        await supabase.from('documents').update({
          n8n_result: { ...current, facture_status: 'needs_reprocess', facture_skip_reason: 'empty_or_invalid_tiers' }
        }).eq('id', f.document_id)
        autoFixed.push({ type: 'facture_tiers_flagged', table: 'documents', id: f.document_id, old: { facture_status: current.facture_status }, new: { facture_status: 'needs_reprocess' } })
      }
    } catch (e) { console.warn('[health-check] 1.5 failed:', e) }

    // ══════════════════════════════════════════════════════════
    // LEVEL 2 — NOTIFY (WhatsApp alerts for the accountant)
    // ══════════════════════════════════════════════════════════

    // 2.1 Factures client/fournisseur without linked document
    try {
      const { count: noDocCount } = await supabase
        .from('factures')
        .select('id', { count: 'exact', head: true })
        .in('type_facture', ['client', 'fournisseur'])
        .is('document_id', null)
      if ((noDocCount || 0) > 0) {
        needsAction.push({ type: 'facture_no_document', severity: 'major', details: `${noDocCount} facture(s) sans document justificatif`, count: noDocCount || 0 })
      }
    } catch (e) { console.warn('[health-check] 2.1 failed:', e) }

    // 2.2 Bulletins paie valides non comptabilisés > 30 jours
    try {
      const { data: oldBulletins } = await supabase
        .from('bulletins_paie')
        .select('id, periode, societe_id')
        .eq('statut', 'valide')
        .eq('comptabilise', false)
        .lt('periode', thirtyDaysAgo)
      if ((oldBulletins || []).length > 0) {
        needsAction.push({ type: 'bulletin_not_comptabilise', severity: 'major', details: `${oldBulletins!.length} bulletin(s) valide(s) non comptabilisé(s) depuis > 30 jours`, count: oldBulletins!.length })
      }
    } catch (e) { console.warn('[health-check] 2.2 failed:', e) }

    // 2.3 Journal SAL/BNQ imbalance > 1000 MUR in last 2 months
    try {
      const twoMoAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      for (const journal of ['SAL', 'BNQ']) {
        const { data: entries } = await supabase
          .from('ecritures_comptables_v2')
          .select('debit_mur, credit_mur')
          .eq('journal', journal)
          .gte('date_ecriture', twoMoAgo)
        const totDebit = (entries || []).reduce((s: number, e: any) => s + (Number(e.debit_mur) || 0), 0)
        const totCredit = (entries || []).reduce((s: number, e: any) => s + (Number(e.credit_mur) || 0), 0)
        const imbalance = Math.abs(totDebit - totCredit)
        if (imbalance > 1000) {
          needsAction.push({ type: `journal_${journal.toLowerCase()}_imbalance`, severity: 'critical', details: `Journal ${journal} déséquilibré: D=${totDebit.toFixed(2)} vs C=${totCredit.toFixed(2)} (écart ${imbalance.toFixed(2)} MUR)` })
        }
      }
    } catch (e) { console.warn('[health-check] 2.3 failed:', e) }

    // ══════════════════════════════════════════════════════════
    // LEVEL 3 — ALERT ONLY (logged to dashboard, no WhatsApp)
    // ══════════════════════════════════════════════════════════

    // 3.1 Any journal imbalance in any month
    try {
      const { data: allMonthly } = await supabase
        .from('ecritures_comptables_v2')
        .select('journal, date_ecriture, debit_mur, credit_mur')
        .gte('date_ecriture', new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0])
        .limit(10000)
      const byMonthJournal: Record<string, { d: number; c: number }> = {}
      for (const e of allMonthly || []) {
        const key = `${e.date_ecriture?.substring(0, 7)}:${e.journal}`
        if (!byMonthJournal[key]) byMonthJournal[key] = { d: 0, c: 0 }
        byMonthJournal[key].d += Number(e.debit_mur) || 0
        byMonthJournal[key].c += Number(e.credit_mur) || 0
      }
      for (const [key, v] of Object.entries(byMonthJournal)) {
        const imbalance = Math.abs(v.d - v.c)
        if (imbalance > 0.01) {
          anomalies.push({ type: 'journal_monthly_imbalance', severity: 'warning', details: `${key} imbalance ${imbalance.toFixed(2)} MUR` })
        }
      }
    } catch (e) { console.warn('[health-check] 3.1 failed:', e) }

    // 3.2 Releves bancaires solde_cloture mismatch vs transactions sum
    try {
      const { data: releves } = await supabase
        .from('releves_bancaires')
        .select('id, solde_ouverture, solde_cloture, transactions_json')
        .limit(200)
      for (const r of releves || []) {
        const txs = (r.transactions_json as any[]) || []
        const totD = txs.reduce((s, t) => s + (Number(t.debit) || 0), 0)
        const totC = txs.reduce((s, t) => s + (Number(t.credit) || 0), 0)
        const expected = Number(r.solde_ouverture || 0) - totD + totC
        const diff = Math.abs(expected - Number(r.solde_cloture || 0))
        if (diff > 1) {
          anomalies.push({ type: 'releve_solde_mismatch', severity: 'critical', details: `Relevé ${r.id}: solde_cloture=${r.solde_cloture} vs calculated=${expected.toFixed(2)} (diff ${diff.toFixed(2)})` })
        }
      }
    } catch (e) { console.warn('[health-check] 3.2 failed:', e) }

    const duration_ms = Date.now() - t0

    // Persist to health_check_runs
    let whatsappSent = false
    try {
      const { data: run } = await supabase.from('health_check_runs').insert({
        anomalies, auto_fixed: autoFixed, needs_action: needsAction, duration_ms,
      }).select('id').single()
      if (run) console.warn(`[health-check] Run saved: ${run.id}`)
    } catch (e) {
      console.warn('[health-check] Failed to save run:', e)
    }

    // Notify admins when action needed
    if (needsAction.length > 0) {
      try {
        const { data: admins } = await supabase
          .from('profiles').select('id').in('role', ['admin', 'super_admin', 'client_admin']).limit(10)
        const summary = needsAction.slice(0, 5).map(n => `• ${n.details}`).join('\n')
        const autoSummary = autoFixed.length > 0 ? `\n\n✅ Auto-corrigé: ${autoFixed.length} élément(s)` : ''
        const message = `🩺 Lexora Health Check — ${now.toLocaleDateString('fr-FR')}\n\n🔴 ACTION REQUISE (${needsAction.length})\n${summary}${autoSummary}\n\nRapport complet: /comptable/health`
        for (const admin of admins || []) {
          await envoyerNotification({
            destinataire_id: admin.id,
            destinataire_type: 'client',
            type: 'health_check',
            titre: 'Lexora Health Check',
            message,
            niveau: 'critique',
            canaux: ['app', 'whatsapp'],
            cron_name: cronName,
          })
        }
        whatsappSent = true
      } catch (e) {
        console.warn('[health-check] Notification failed:', e)
      }
    }

    // Log to cron_logs
    await supabase.from('cron_logs').insert({
      cron_name: cronName, statut: 'success',
      details: {
        anomalies_count: anomalies.length,
        auto_fixed_count: autoFixed.length,
        needs_action_count: needsAction.length,
        whatsapp_sent: whatsappSent,
      },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, anomalies, autoFixed, needsAction, duration_ms })
  } catch (e: any) {
    const duration_ms = Date.now() - t0
    console.error('[health-check] fatal error:', e)
    await supabase.from('cron_logs').insert({
      cron_name: cronName, statut: 'error',
      details: { error: e?.message || String(e) },
      executed_at: new Date().toISOString(),
    })
    return NextResponse.json({ success: false, error: e?.message || 'Erreur', duration_ms }, { status: 500 })
  }
}
