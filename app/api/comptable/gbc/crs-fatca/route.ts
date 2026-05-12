import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateCrsXmlSkeleton } from '@/lib/accounting/crs-fatca'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear() - 1), 10)
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: holders }, { data: submissions }] = await Promise.all([
      supabase.from('crs_account_holders').select('*').eq('societe_id', societe_id).eq('reporting_year', year),
      supabase.from('crs_fatca_submissions').select('*').eq('societe_id', societe_id).eq('reporting_year', year),
    ])
    const total = (holders || []).reduce((s: number, h: any) => s + Number(h.account_balance_eoy_usd || 0), 0)
    return NextResponse.json({
      societe_id, reporting_year: year,
      holders: holders || [],
      submissions: submissions || [],
      summary: {
        nb_holders: holders?.length || 0,
        nb_crs_reportable: (holders || []).filter((h: any) => h.is_crs_reportable).length,
        nb_fatca_reportable: (holders || []).filter((h: any) => h.is_fatca_reportable).length,
        total_balance_usd: Math.round(total * 100) / 100,
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

    if (body.action === 'generate_xml') {
      const { societe_id, year } = body
      const { data: societe } = await supabase.from('societes').select('raison_sociale, brn, vat_number').eq('id', societe_id).single()
      const { data: holders } = await supabase.from('crs_account_holders').select('*').eq('societe_id', societe_id).eq('reporting_year', year).eq('is_crs_reportable', true)
      const xml = generateCrsXmlSkeleton({
        reportingYear: year,
        societeName: societe?.raison_sociale || '—',
        societeTin: societe?.brn || societe?.vat_number || 'UNKNOWN',
        holders: (holders || []).map((h: any) => ({
          holderName: h.holder_name, countryOfResidence: h.country_of_residence,
          tin: h.tin, accountNumber: h.account_number,
          balanceUsd: Number(h.account_balance_eoy_usd) || 0,
          interestUsd: Number(h.interest_paid_usd) || 0,
          dividendsUsd: Number(h.dividends_paid_usd) || 0,
          grossProceedsUsd: Number(h.gross_proceeds_usd) || 0,
        })),
      })
      // Persist as submission draft
      await supabase.from('crs_fatca_submissions').upsert({
        societe_id, reporting_year: year, submission_type: 'crs',
        xml_payload: xml, status: 'draft',
        nb_holders: (holders || []).length,
        total_balance_usd: (holders || []).reduce((s: number, h: any) => s + Number(h.account_balance_eoy_usd || 0), 0),
        submitted_by: user.id,
      }, { onConflict: 'societe_id,reporting_year,submission_type' })

      return new Response(xml, { headers: { 'Content-Type': 'application/xml', 'Content-Disposition': `attachment; filename="crs_${societe_id}_${year}.xml"` } })
    }

    if (body.action === 'declare_holder') {
      const { data, error } = await supabase.from('crs_account_holders').insert(body.payload).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, holder: data })
    }

    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
