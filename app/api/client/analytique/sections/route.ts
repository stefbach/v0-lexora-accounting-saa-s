/**
 * /api/client/analytique/sections
 *
 * GET  : liste les sections analytiques d'une société, chacune avec son P&L
 *        (produits / charges / marge) calculé depuis les écritures rattachées.
 * POST : crée une section manuelle (centre de coût / projet).
 *
 * Tenant isolation : assertSocieteAccess sur societe_id.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateSectionPayload, computeSectionPnl, groupBySection } from '@/lib/analytique/sections'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const type = searchParams.get('type') // filtre optionnel
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    let q = supabase.from('sections_analytiques').select('*').eq('societe_id', societe_id)
    if (type) q = q.eq('type', type)
    const { data: sections, error } = await q.order('type').order('code')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Écritures analytiques → P&L par section (calcul pur réutilisé).
    const { data: ecritures } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, section_analytique_id')
      .eq('societe_id', societe_id)
      .not('section_analytique_id', 'is', null)
      .limit(50000)

    const bySection = groupBySection(ecritures || [])

    // Ventilations (répartition analytique des charges/produits non tagués).
    const { data: vents } = await supabase
      .from('ventilations_analytiques')
      .select('section_analytique_id, montant, ecritures_comptables_v2(numero_compte)')
      .eq('societe_id', societe_id)
      .limit(50000)
    const ventBySection = new Map<string, { produits: number; charges: number; n: number }>()
    for (const v of vents || []) {
      const cls = String((v as any).ecritures_comptables_v2?.numero_compte || '').charAt(0)
      const cur = ventBySection.get(v.section_analytique_id) || { produits: 0, charges: 0, n: 0 }
      const m = Number(v.montant) || 0
      if (cls === '7') cur.produits += m
      else if (cls === '6') cur.charges += m
      cur.n += 1
      ventBySection.set(v.section_analytique_id, cur)
    }

    const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
    const items = (sections || []).map((s) => {
      const direct = computeSectionPnl(bySection.get(s.id) || [])
      const vent = ventBySection.get(s.id) || { produits: 0, charges: 0, n: 0 }
      const produits = r2(direct.produits + vent.produits)
      const charges = r2(direct.charges + vent.charges)
      const marge = r2(produits - charges)
      return {
        ...s,
        pnl: {
          produits, charges, marge,
          marge_pct: produits !== 0 ? r2((marge / produits) * 100) : null,
          nb_ecritures: direct.nb_ecritures + vent.n,
        },
      }
    })

    return NextResponse.json({ items })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    const societe_id = String(body.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const validated = validateSectionPayload(body)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    const { data, error } = await supabase
      .from('sections_analytiques')
      .insert({ ...validated.data, societe_id, created_by: user.id })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `Code déjà utilisé (${validated.data.code})` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: { ...data, pnl: computeSectionPnl([]) } }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
