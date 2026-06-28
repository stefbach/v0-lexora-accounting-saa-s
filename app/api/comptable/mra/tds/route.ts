import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateTdsCsv, type TdsCategory } from '@/lib/accounting/tds'

export const dynamic = 'force-dynamic'

/**
 * GET — TDS dashboard mensuel + annual statement
 *   ?societe_id=...&periode=YYYY-MM           → mensuel
 *   ?societe_id=...&year=YYYY&action=annual   → annuel
 *   ?societe_id=...&periode=YYYY-MM&action=export_csv → téléchargement CSV
 */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode    = searchParams.get('periode')
    const year       = searchParams.get('year')
    const action     = searchParams.get('action')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    if (action === 'annual' && year) {
      const { data, error } = await supabase.rpc('tds_annual_statement', { p_societe_id: societe_id, p_year: parseInt(year) })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const total = (data || []).reduce((s: number, r: any) => s + Number(r.total_tds_mur || 0), 0)
      return NextResponse.json({ year: parseInt(year), records: data || [], total_tds_mur: total })
    }

    if (!periode) return NextResponse.json({ error: 'periode YYYY-MM requise' }, { status: 400 })

    if (action === 'export_csv') {
      const [{ data: societe }, { data: factures }] = await Promise.all([
        supabase.from('societes').select('nom, ern').eq('id', societe_id).single(),
        supabase.from('factures')
          .select('tiers, tds_category, tds_amount_mur, montant_mur, date_facture')
          .eq('societe_id', societe_id)
          .eq('type_facture', 'fournisseur')
          .gt('tds_amount_mur', 0)
          .gte('date_facture', `${periode}-01`)
          .lt('date_facture', `${periode.split('-')[0]}-${String(parseInt(periode.split('-')[1]) + 1).padStart(2, '0')}-01`),
      ])
      const csv = generateTdsCsv({
        societe_name: societe?.nom || '—',
        societe_tan: societe?.ern || 'UNKNOWN',
        periode,
        records: (factures || []).map((f: any) => ({
          tiers: f.tiers || '—',
          category: (f.tds_category as TdsCategory) || 'none',
          gross_mur: Number(f.montant_mur) || 0,
          tds_mur: Number(f.tds_amount_mur) || 0,
          payment_date: f.date_facture,
        })),
      })
      return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="tds_${periode}.csv"` } })
    }

    // Default : dashboard mensuel
    const [{ data: rpc }, { data: declaration }, { data: factures }] = await Promise.all([
      supabase.rpc('tds_compute_monthly', { p_societe_id: societe_id, p_periode: periode }),
      supabase.from('tds_declarations_mensuelles_v2').select('*').eq('societe_id', societe_id).eq('periode', periode).maybeSingle(),
      supabase.from('factures').select('id, tiers, tds_category, tds_rate_pct, tds_amount_mur, montant_mur, date_facture, statut')
        .eq('societe_id', societe_id).eq('type_facture', 'fournisseur').gt('tds_amount_mur', 0)
        .gte('date_facture', `${periode}-01`)
        .lt('date_facture', `${periode.split('-')[0]}-${String(parseInt(periode.split('-')[1]) + 1).padStart(2, '0')}-01`),
    ])

    const summary = Array.isArray(rpc) ? rpc[0] : rpc
    return NextResponse.json({ periode, summary, declaration, factures: factures || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

/** POST — marquer une période comme déclarée/payée */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json()
    const { societe_id, periode, action } = body
    if (!societe_id || !periode) return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data: rpc } = await supabase.rpc('tds_compute_monthly', { p_societe_id: societe_id, p_periode: periode })
    const summary = Array.isArray(rpc) ? rpc[0] : rpc

    if (action === 'mark_declared') {
      await supabase.from('tds_declarations_mensuelles_v2').upsert({
        societe_id, periode,
        nb_paiements: summary?.nb_paiements || 0,
        total_paiements_mur: summary?.total_paiements_mur || 0,
        total_tds_mur: summary?.total_tds_mur || 0,
        date_limite: summary?.date_limite,
        date_declaration: new Date().toISOString().slice(0, 10),
        statut: 'declare',
      }, { onConflict: 'societe_id,periode' })
      return NextResponse.json({ ok: true })
    }
    if (action === 'mark_paid') {
      await supabase.from('tds_declarations_mensuelles_v2').update({
        date_paiement: new Date().toISOString().slice(0, 10),
        statut: 'paye',
      }).eq('societe_id', societe_id).eq('periode', periode)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
