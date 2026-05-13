import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateSftXml } from '@/lib/accounting/mra-xml'

export const dynamic = 'force-dynamic'

/** GET — Détecte les transactions SFT > 50k MUR + retourne les déjà déclarées */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const year       = parseInt(searchParams.get('year') || String(new Date().getFullYear() - 1))
    const threshold  = parseFloat(searchParams.get('threshold') || '50000')
    const action     = searchParams.get('action')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    if (action === 'export_xml') {
      const [{ data: societe }, { data: declared }] = await Promise.all([
        supabase.from('societes').select('brn').eq('id', societe_id).single(),
        supabase.from('sft_transactions').select('*').eq('societe_id', societe_id).eq('reporting_year', year),
      ])
      const xml = generateSftXml({
        societe_brn: societe?.brn || '—', year,
        transactions: (declared || []).map((t: any) => ({
          date: t.transaction_date, counterparty: t.counterparty_name,
          counterparty_id: t.counterparty_id, amount_mur: Number(t.amount_mur), type: t.transaction_type,
        })),
      })
      return new Response(xml, { headers: { 'Content-Type': 'application/xml', 'Content-Disposition': `attachment; filename="sft_${year}.xml"` } })
    }

    const [{ data: detected }, { data: declared }] = await Promise.all([
      supabase.rpc('sft_detect_transactions', { p_societe_id: societe_id, p_year: year, p_threshold_mur: threshold }),
      supabase.from('sft_transactions').select('*').eq('societe_id', societe_id).eq('reporting_year', year),
    ])
    return NextResponse.json({
      year, threshold,
      detected: detected || [], declared: declared || [],
      summary: {
        nb_detected: detected?.length || 0,
        nb_declared: declared?.length || 0,
        total_amount_mur: (detected || []).reduce((s: number, t: any) => s + Number(t.amount_mur || 0), 0),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

/** POST — ajout/marquage SFT déclaré */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const body = await request.json()
    const supabase = getAdminClient()
    if (body.action === 'declare') {
      const { data, error } = await supabase.from('sft_transactions').insert(body.payload).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, transaction: data })
    }
    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
