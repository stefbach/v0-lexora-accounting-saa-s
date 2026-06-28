import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateCitXml } from '@/lib/accounting/mra-xml'
import { computeCitDeadlineISO } from '@/lib/accounting/mra-deadlines'

export const dynamic = 'force-dynamic'

/** GET — CIT return + auto-calcul depuis P&L */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice   = searchParams.get('exercice')
    const action     = searchParams.get('action')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data: cit } = await supabase.from('cit_returns').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle()

    if (action === 'export_xml' && cit) {
      const { data: societe } = await supabase.from('societes').select('brn, ern').eq('id', societe_id).single()
      const xml = generateCitXml({
        societe_brn: societe?.brn || '—',
        societe_tan: societe?.ern || '—',
        exercice,
        profit_avant_impot: Number(cit.profit_avant_impot_mur) || 0,
        profit_imposable: Number(cit.profit_imposable_mur) || 0,
        impot_net: Number(cit.impot_net_mur) || 0,
        ftc_applied: Number(cit.ftc_applied_mur) || 0,
        tds_credit: Number(cit.tds_credit_mur) || 0,
      })
      return new Response(xml, { headers: { 'Content-Type': 'application/xml', 'Content-Disposition': `attachment; filename="cit_${exercice}.xml"` } })
    }

    return NextResponse.json({ cit })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

/** POST — calcul auto depuis financial + sauvegarde */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json()
    const { societe_id, exercice, action, ajustements } = body
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()

    if (action === 'compute_auto') {
      // Récupère le P&L depuis /api/client/financial
      const url = new URL(`/api/client/financial?societe_id=${societe_id}&exercice=${exercice}`, request.url)
      const res = await fetch(url.toString(), { headers: { cookie: request.headers.get('cookie') || '' } })
      const json: any = await res.json()
      const fin = json?.financial || json

      const ca = Number(fin.chiffreAffaires) || 0
      const charges = (Number(fin.achats) || 0) + (Number(fin.salaires) || 0) + (Number(fin.chargesSociales) || 0)
        + (Number(fin.autresServicesExterieurs) || Number(fin.autresCharges) || 0)
        + (Number(fin.impotsEtTaxes) || 0) + (Number(fin.amortissements) || 0)
      const resExpl = ca - charges
      const resFin  = (Number(fin.produitsFinanciers) || 0) - (Number(fin.chargesFinancieres) || 0)
      const profitAvImpot = resExpl + resFin

      // Ajustements fiscaux (saisis par l'utilisateur)
      const adj = ajustements || {}
      const profitImposable = profitAvImpot
        + (Number(adj.ajustements_non_deductibles_mur) || 0)
        + (Number(adj.donations_excess_mur) || 0)
        + (Number(adj.entertainment_excess_mur) || 0)
        + (Number(adj.depreciation_book_mur) || 0)
        - (Number(adj.capital_allowance_mur) || 0)

      // Tax rate selon régime + date_fin_exercice pour deadline CIT (ITA s.116)
      const { data: societe } = await supabase.from('societes').select('regime, date_fin_exercice').eq('id', societe_id).single()
      const taux = (societe?.regime === 'gbc1' || societe?.regime === 'authorised_company') ? 3.0 : 15.0
      const impotBrut = Math.max(0, profitImposable) * (taux / 100)
      const ftc = Number(adj.ftc_applied_mur) || 0
      const tdsCredit = Number(adj.tds_credit_mur) || 0
      const apsCredit = Number(adj.aps_credit_mur) || 0
      const impotNet = Math.max(0, impotBrut - ftc - tdsCredit - apsCredit)

      // Date limite CIT — ITA s.116(1) : 6 mois après la fin du mois de
      // clôture de l'exercice. La société renseigne sa fin d'exercice
      // dans societes.date_fin_exercice (mig 006). Fallback 30/06 de
      // endYear si non renseigné (exercice juillet-juin classique).
      const dateLimit = computeCitDeadlineISO(exercice, societe?.date_fin_exercice)

      const { data, error } = await supabase.from('cit_returns').upsert({
        societe_id, exercice,
        chiffre_affaires_mur: ca,
        charges_exploitation_mur: charges,
        resultat_exploitation_mur: resExpl,
        resultat_financier_mur: resFin,
        profit_avant_impot_mur: profitAvImpot,
        ajustements_non_deductibles_mur: adj.ajustements_non_deductibles_mur || 0,
        donations_excess_mur: adj.donations_excess_mur || 0,
        entertainment_excess_mur: adj.entertainment_excess_mur || 0,
        depreciation_book_mur: adj.depreciation_book_mur || 0,
        capital_allowance_mur: adj.capital_allowance_mur || 0,
        profit_imposable_mur: profitImposable,
        taux_is_pct: taux,
        impot_brut_mur: Math.round(impotBrut * 100) / 100,
        ftc_applied_mur: ftc,
        tds_credit_mur: tdsCredit,
        aps_credit_mur: apsCredit,
        impot_net_mur: Math.round(impotNet * 100) / 100,
        date_limite: dateLimit,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'societe_id,exercice' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, cit: data })
    }

    // Workflow validation 4-yeux
    if (['submit_review', 'approve', 'submit_mra'].includes(action)) {
      const updateFields: any = { updated_at: new Date().toISOString() }
      if (action === 'submit_review') { updateFields.statut = 'review'; updateFields.reviewer_id = user.id; updateFields.reviewed_at = new Date().toISOString() }
      if (action === 'approve')       { updateFields.statut = 'approved'; updateFields.approver_id = user.id; updateFields.approved_at = new Date().toISOString() }
      if (action === 'submit_mra')    { updateFields.statut = 'submitted'; updateFields.submitted_at = new Date().toISOString(); updateFields.date_declaration = new Date().toISOString().slice(0, 10) }
      const { error } = await supabase.from('cit_returns').update(updateFields).eq('societe_id', societe_id).eq('exercice', exercice)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, statut: updateFields.statut })
    }

    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
