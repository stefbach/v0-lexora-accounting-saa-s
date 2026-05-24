import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateSftXml } from '@/lib/accounting/mra-xml'

export const dynamic = 'force-dynamic'

/**
 * Catégories SFT légales (Income Tax SFT Regulations 2015 + MRA Comm 2019/06).
 * Le paramètre `category` du GET filtre optionnellement sur une catégorie.
 */
const SFT_CATEGORIES = [
  'immobilier',
  'cash',
  'virement_intl',
  'dividende_nr',
  'interet_nr',
  'loyer_nr',
] as const
type SftCategory = (typeof SFT_CATEGORIES)[number]

/**
 * GET — Détecte les transactions SFT qualifiées selon les 6 catégories
 * réglementaires (SFT Reg 2015) + retourne celles déjà déclarées.
 *
 * Params :
 *   societe_id : UUID (requis)
 *   year       : année de reporting (default = N-1)
 *   category   : filtre par catégorie SFT (optionnel)
 *   action     : 'export_xml' pour générer le XML MRA
 */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const year       = parseInt(searchParams.get('year') || String(new Date().getFullYear() - 1))
    const categoryRaw = searchParams.get('category')
    const category: SftCategory | null = (categoryRaw && (SFT_CATEGORIES as readonly string[]).includes(categoryRaw))
      ? (categoryRaw as SftCategory)
      : null
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

    // Nouvelle RPC v2 (mig 418) — 6 catégories qualifiées avec seuils dédiés.
    // L'ancien paramètre `threshold` est ignoré : chaque catégorie a son
    // propre seuil légal (immobilier 2M, cash 500k cumul, virements intl
    // 500k, dividendes NR 500k, intérêts NR 100k, loyers NR 240k).
    const [{ data: detected, error: detectErr }, { data: declared }, { data: summary }] = await Promise.all([
      supabase.rpc('sft_detect_transactions_v2', {
        p_societe_id: societe_id,
        p_year: year,
        p_category: category,
      }),
      supabase.from('sft_transactions').select('*').eq('societe_id', societe_id).eq('reporting_year', year),
      supabase.rpc('sft_summary_by_category', { p_societe_id: societe_id, p_year: year }),
    ])

    if (detectErr) {
      return NextResponse.json({ error: detectErr.message, code: detectErr.code }, { status: 500 })
    }

    return NextResponse.json({
      year,
      category,
      categories: SFT_CATEGORIES,
      detected: detected || [],
      declared: declared || [],
      summary_by_category: summary || [],
      summary: {
        nb_detected: detected?.length || 0,
        nb_declared: declared?.length || 0,
        total_amount_mur: (detected || []).reduce((s: number, t: any) => s + Number(t.amount_mur || 0), 0),
      },
      _meta: {
        rpc: 'sft_detect_transactions_v2',
        legal_ref: 'Income Tax SFT Regulations 2015 + MRA Communiqué 2019/06',
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
