import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { computeTopUp, isInScope } from '@/lib/accounting/pillar-two'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: jurisdictions }, { data: gir }] = await Promise.all([
      supabase.from('globe_jurisdictions').select('*').eq('societe_id', societe_id).eq('exercice', exercice),
      supabase.from('globe_gir_submissions').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle(),
    ])
    const totalTopUp = (jurisdictions || []).reduce((s: number, j: any) => s + Number(j.top_up_tax_mur || 0), 0)
    return NextResponse.json({
      societe_id, exercice,
      jurisdictions: jurisdictions || [],
      gir,
      summary: {
        nb_jurisdictions: jurisdictions?.length || 0,
        nb_low_taxed: (jurisdictions || []).filter((j: any) => j.is_low_taxed).length,
        total_top_up_mur: Math.round(totalTopUp * 100) / 100,
        in_scope: gir ? isInScope(Number(gir.consolidated_revenue_eur) || 0) : null,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const body = await request.json()
    const supabase = getAdminClient()

    if (body.action === 'declare_jurisdiction') {
      const p = body.payload
      const calc = computeTopUp({
        globeIncomeMur: Number(p.globe_income_mur) || 0,
        coveredTaxesMur: Number(p.covered_taxes_mur) || 0,
        payrollMur: Number(p.payroll_mur) || 0,
        tangibleAssetsMur: Number(p.tangible_assets_mur) || 0,
        year: parseInt(p.exercice.split('-')[0]) + 1, // fin d'exercice Maurice
      })
      const { data, error } = await supabase.from('globe_jurisdictions').upsert({
        ...p,
        etr_pct: calc.etrPct,
        top_up_tax_mur: calc.topUpMur,
      }, { onConflict: 'societe_id,exercice,jurisdiction' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, record: data, calc })
    }

    if (body.action === 'submit_gir') {
      const { societe_id, exercice, consolidated_revenue_eur, total_top_up_mur, total_dmtt_mur } = body
      const { data, error } = await supabase.from('globe_gir_submissions').upsert({
        societe_id, exercice, consolidated_revenue_eur,
        total_top_up_mur, total_dmtt_mur,
        status: 'submitted', submission_date: new Date().toISOString().slice(0, 10),
      }, { onConflict: 'societe_id,exercice' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, gir: data })
    }

    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
