import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Calcule l'IS GBC avec PER 80% + Foreign Tax Credit appliqué. */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id || !exercice) {
      return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const [{ data: result, error }, { data: categories }, { data: ftcRecords }] = await Promise.all([
      supabase.rpc('gbc_compute_tax_liability', { p_societe_id: societe_id, p_exercice: exercice }),
      supabase.from('gbc_per_categories').select('*'),
      supabase.from('gbc_foreign_tax_credits').select('*').eq('societe_id', societe_id).eq('exercice', exercice),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      societe_id, exercice,
      tax_breakdown: Array.isArray(result) ? result[0] : result,
      per_categories: categories || [],
      ftc_records: ftcRecords || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

/** POST : ajoute un record FTC pour l'exercice */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, exercice, source_country, income_type, foreign_income_mur, foreign_tax_paid_mur, treaty_rate_pct, notes } = body
    if (!societe_id || !exercice || !source_country || !income_type) {
      return NextResponse.json({ error: 'Champs requis: societe_id, exercice, source_country, income_type' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const ftc_applied = Math.min(Number(foreign_tax_paid_mur || 0), Number(foreign_income_mur || 0) * 0.15)
    const { data, error } = await supabase.from('gbc_foreign_tax_credits').insert({
      societe_id, exercice, source_country, income_type,
      foreign_income_mur, foreign_tax_paid_mur, treaty_rate_pct,
      ftc_applied_mur: Math.round(ftc_applied * 100) / 100, notes,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, record: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
