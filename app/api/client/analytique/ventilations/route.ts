/**
 * /api/client/analytique/ventilations
 *
 * GET  : liste de travail « à ventiler » — écritures de charge/produit (classe
 *        6/7) non taguées (section_analytique_id null), avec leur montant net,
 *        le déjà-ventilé et le reste à répartir.
 * POST : enregistre la répartition d'une écriture entre sections (remplace la
 *        ventilation existante de cette écriture).
 * DELETE: supprime la ventilation d'une écriture (?ecriture_id=).
 *
 * Tenant isolation : assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { ecritureNet, validateAllocations } from '@/lib/analytique/ventilation'

export const dynamic = 'force-dynamic'

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const onlyPending = searchParams.get('reste') === '1'
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    // Écritures de charge/produit non taguées directement.
    const { data: ecritures } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, date_ecriture, numero_compte, nom_compte, description, debit_mur, credit_mur, journal, ref_folio')
      .eq('societe_id', societe_id)
      .is('section_analytique_id', null)
      .or('numero_compte.like.6%,numero_compte.like.7%')
      .order('date_ecriture', { ascending: false })
      .limit(1000)

    const ids = (ecritures || []).map((e) => e.id)
    const ventBySection = new Map<string, Array<{ section_analytique_id: string; montant: number }>>()
    if (ids.length) {
      const { data: vents } = await supabase
        .from('ventilations_analytiques')
        .select('ecriture_id, section_analytique_id, montant')
        .eq('societe_id', societe_id)
        .in('ecriture_id', ids)
      for (const v of vents || []) {
        const arr = ventBySection.get(v.ecriture_id) || []
        arr.push({ section_analytique_id: v.section_analytique_id, montant: Number(v.montant) || 0 })
        ventBySection.set(v.ecriture_id, arr)
      }
    }

    const items = (ecritures || []).map((e) => {
      const { nature, net } = ecritureNet(e.numero_compte, e.debit_mur, e.credit_mur)
      const allocations = ventBySection.get(e.id) || []
      const ventile = round2(allocations.reduce((s, a) => s + a.montant, 0))
      return { ...e, nature, net, ventile, reste: round2(net - ventile), allocations }
    }).filter((e) => e.net > 0 && (!onlyPending || e.reste > 0.009))

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
    const societe_id = String(body?.societe_id || '')
    const ecriture_id = String(body?.ecriture_id || '')
    if (!societe_id || !ecriture_id) return NextResponse.json({ error: 'societe_id et ecriture_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data: ec } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, debit_mur, credit_mur, section_analytique_id')
      .eq('id', ecriture_id).eq('societe_id', societe_id).maybeSingle()
    if (!ec) return NextResponse.json({ error: 'Écriture introuvable' }, { status: 404 })
    if (ec.section_analytique_id) {
      return NextResponse.json({ error: 'Écriture déjà affectée directement à une section' }, { status: 409 })
    }

    const { net } = ecritureNet(ec.numero_compte, ec.debit_mur, ec.credit_mur)
    const allocations = Array.isArray(body?.allocations)
      ? body.allocations.map((a: any) => ({ section_analytique_id: String(a.section_analytique_id || ''), montant: Number(a.montant) || 0 }))
      : []
    const valid = validateAllocations(net, allocations)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

    // Remplace la ventilation existante de cette écriture.
    await supabase.from('ventilations_analytiques').delete().eq('societe_id', societe_id).eq('ecriture_id', ecriture_id)
    const rows = valid.allocations.map((a) => ({
      societe_id,
      ecriture_id,
      section_analytique_id: a.section_analytique_id,
      montant: a.montant,
      quote_part_pct: net > 0 ? round2((a.montant / net) * 100) : null,
      created_by: user.id,
    }))
    const { error } = await supabase.from('ventilations_analytiques').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, ventile: valid.total, reste: round2(net - valid.total) })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id') || ''
    const ecriture_id = searchParams.get('ecriture_id') || ''
    if (!societe_id || !ecriture_id) return NextResponse.json({ error: 'societe_id et ecriture_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { error } = await supabase
      .from('ventilations_analytiques').delete().eq('societe_id', societe_id).eq('ecriture_id', ecriture_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
