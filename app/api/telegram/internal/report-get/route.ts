import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/report-get
 *
 * Rapports financiers et opérationnels condensés.
 * Rôle min : manager (KPIs simples) ou comptable+ (rapports complets).
 *
 * Body :
 *   - type     : 'pl' | 'balance' | 'tresorerie' | 'top_clients' | 'top_fournisseurs'
 *              | 'aging_clients' | 'aging_fournisseurs' | 'tva' | 'paye_summary'
 *   - periode  : 'YYYY-MM' ou 'YYYY' optionnel
 *   - top_n    : pour les "top_*", défaut 10
 */
export async function POST(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'report.get', async (ctx, body) => {
    if (!hasRole(ctx, 'comptable') && !hasRole(ctx, 'direction')) {
      return { result: null, status: 'denied', error_msg: 'Rapports réservés aux comptables et plus' }
    }

    const type = String(body?.type || '').toLowerCase()
    const periode = body?.periode ? String(body.periode).trim() : null
    const top_n = Math.min(Math.max(Number(body?.top_n) || 10, 1), 50)
    const admin = getAdminClient()

    if (type === 'top_clients' || type === 'top_fournisseurs') {
      const typeFacture = type === 'top_clients' ? 'client' : 'fournisseur'
      let q = admin.from('factures')
        .select('tiers, montant_ttc, devise')
        .eq('societe_id', ctx.societe_id)
        .eq('type_facture', typeFacture)
        .neq('statut', 'annulee')
      if (periode) {
        if (/^\d{4}-\d{2}$/.test(periode)) {
          const [y, m] = periode.split('-').map(Number)
          q = q.gte('date_facture', `${periode}-01`).lte('date_facture', `${periode}-${new Date(y, m, 0).getDate()}`)
        } else if (/^\d{4}$/.test(periode)) {
          q = q.gte('date_facture', `${periode}-01-01`).lte('date_facture', `${periode}-12-31`)
        }
      }
      const { data } = await q
      const agg = new Map<string, number>()
      for (const r of data || []) {
        agg.set(r.tiers || '?', (agg.get(r.tiers || '?') || 0) + Number(r.montant_ttc || 0))
      }
      const sorted = Array.from(agg.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, top_n)
        .map(([tiers, total_ttc]) => ({ tiers, total_ttc: Math.round(total_ttc) }))
      return { result: { type, periode, top: sorted, total: sorted.reduce((s, x) => s + x.total_ttc, 0) } }
    }

    if (type === 'aging_clients' || type === 'aging_fournisseurs') {
      const typeFacture = type === 'aging_clients' ? 'client' : 'fournisseur'
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await admin
        .from('factures')
        .select('id, numero_facture, tiers, date_echeance, solde_non_paye, montant_ttc')
        .eq('societe_id', ctx.societe_id)
        .eq('type_facture', typeFacture)
        .in('statut', ['en_attente', 'partiel', 'retard'])
        .order('date_echeance', { ascending: true })
      const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } as Record<string, number>
      const items: any[] = []
      for (const f of data || []) {
        if (!f.date_echeance) continue
        const solde = Number(f.solde_non_paye || f.montant_ttc || 0)
        if (solde <= 0) continue
        const days = Math.floor((Date.parse(today) - Date.parse(f.date_echeance)) / 86400000)
        const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'
        buckets[bucket] += solde
        items.push({ numero: f.numero_facture, tiers: f.tiers, echeance: f.date_echeance, days_retard: days, solde })
      }
      return { result: { type, buckets, top_items: items.slice(0, top_n), total_du: Math.round(items.reduce((s, x) => s + x.solde, 0)) } }
    }

    if (type === 'tresorerie') {
      const { data } = await admin
        .from('comptes_bancaires')
        .select('id, banque, nom_compte, devise, solde_actuel')
        .eq('societe_id', ctx.societe_id)
        .eq('actif', true)
      const total_mur = (data || [])
        .filter(c => c.devise === 'MUR')
        .reduce((s, c) => s + Number(c.solde_actuel || 0), 0)
      return { result: { type, comptes: data || [], total_mur: Math.round(total_mur) } }
    }

    if (type === 'pl' || type === 'balance') {
      // Synthèse simple depuis ecritures_comptables_v2 (debit/credit par classe)
      // FIX table : 'ecritures' (sans suffixe) n'existe pas → 'ecritures_comptables_v2' (mig 007).
      // FIX colonnes : 'compte_comptable' → 'numero_compte',
      //                'montant_debit' → 'debit_mur',
      //                'montant_credit' → 'credit_mur'.
      let q = admin.from('ecritures_comptables_v2')
        .select('numero_compte, debit_mur, credit_mur')
        .eq('societe_id', ctx.societe_id)
      if (periode && /^\d{4}-\d{2}$/.test(periode)) {
        const [y, m] = periode.split('-').map(Number)
        q = q.gte('date_ecriture', `${periode}-01`).lte('date_ecriture', `${periode}-${new Date(y, m, 0).getDate()}`)
      } else if (periode && /^\d{4}$/.test(periode)) {
        q = q.gte('date_ecriture', `${periode}-01-01`).lte('date_ecriture', `${periode}-12-31`)
      }
      const { data } = await q
      const byClass = new Map<string, { debit: number; credit: number }>()
      for (const e of data || []) {
        const cls = String(e.numero_compte || '?').slice(0, 1)
        const v = byClass.get(cls) || { debit: 0, credit: 0 }
        v.debit += Number(e.debit_mur || 0)
        v.credit += Number(e.credit_mur || 0)
        byClass.set(cls, v)
      }
      const result: any = { type, periode, classes: {} as Record<string, { debit: number; credit: number; net: number }> }
      for (const [cls, v] of byClass.entries()) {
        result.classes[cls] = { debit: Math.round(v.debit), credit: Math.round(v.credit), net: Math.round(v.credit - v.debit) }
      }
      // Pour P&L : produits = classe 7 - charges = classe 6
      if (type === 'pl') {
        const produits = result.classes['7']?.credit || 0
        const charges = result.classes['6']?.debit || 0
        result.summary = { produits, charges, resultat: produits - charges }
      }
      return { result }
    }

    if (type === 'paye_summary') {
      if (!hasRole(ctx, 'rh') && !hasRole(ctx, 'direction')) {
        return { result: null, status: 'denied', error_msg: 'Synthèse paie réservée RH/direction' }
      }
      const p = periode && /^\d{4}-\d{2}$/.test(periode) ? periode : new Date().toISOString().slice(0, 7)
      const [y, m] = p.split('-').map(Number)
      const start = `${p}-01`
      const end = `${p}-${new Date(y, m, 0).getDate()}`
      const { data } = await admin
        .from('bulletins_paie')
        // FIX colonnes : 'csg_employe', 'csg_employeur', 'nsf_employe',
        // 'nsf_employeur' n'existent pas sur bulletins_paie. Les vraies
        // colonnes (mig 015 / 016) sont csg_salarie, csg_patronal,
        // nsf_salarie, nsf_patronal.
        .select('id, employe_id, salaire_brut, salaire_net, paye, csg_salarie, csg_patronal, nsf_salarie, nsf_patronal, verrouille')
        .eq('societe_id', ctx.societe_id)
        .gte('periode', start)
        .lte('periode', end)
      const agg = {
        nb_bulletins: data?.length || 0,
        nb_verrouilles: (data || []).filter(b => b.verrouille).length,
        total_brut: 0, total_net: 0, total_paye: 0,
        total_csg: 0, total_nsf: 0,
      }
      for (const b of data || []) {
        agg.total_brut += Number(b.salaire_brut || 0)
        agg.total_net += Number(b.salaire_net || 0)
        agg.total_paye += Number(b.paye || 0)
        // FIX colonnes : csg_salarie/csg_patronal + nsf_salarie/nsf_patronal
        agg.total_csg += Number(b.csg_salarie || 0) + Number(b.csg_patronal || 0)
        agg.total_nsf += Number(b.nsf_salarie || 0) + Number(b.nsf_patronal || 0)
      }
      for (const k of ['total_brut', 'total_net', 'total_paye', 'total_csg', 'total_nsf'] as const) {
        ;(agg as any)[k] = Math.round((agg as any)[k])
      }
      return { result: { type, periode: p, ...agg } }
    }

    return { result: null, status: 'error', error_msg: `Type rapport inconnu : ${type}. Types valides : pl, balance, tresorerie, top_clients, top_fournisseurs, aging_clients, aging_fournisseurs, paye_summary.` }
  })
}
