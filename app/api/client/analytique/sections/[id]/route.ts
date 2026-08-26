/**
 * /api/client/analytique/sections/[id]
 *
 * GET    : détail d'une section + P&L + ventilation par compte + écritures.
 * PATCH  : renommer, clôturer/rouvrir, ajuster les budgets.
 * DELETE : supprime une section SANS écriture rattachée (sinon 409 → clôturer).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { computeSectionPnl } from '@/lib/analytique/sections'

export const dynamic = 'force-dynamic'

async function authAndSection(request: Request, id: string) {
  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id') || ''
  if (!societe_id) throw { _http: 400, msg: 'societe_id requis' }
  const supabase = getAdminClient()
  const authClient = await createClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) throw { _http: 401, msg: 'unauthorized' }
  await assertSocieteAccess(supabase, user.id, societe_id)
  const { data: section } = await supabase
    .from('sections_analytiques').select('*').eq('id', id).eq('societe_id', societe_id).maybeSingle()
  if (!section) throw { _http: 404, msg: 'Section introuvable' }
  return { supabase, user, societe_id, section }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, societe_id, section } = await authAndSection(request, id)

    const { data: ecritures } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, date_ecriture, numero_compte, nom_compte, description, debit_mur, credit_mur, journal, ref_folio')
      .eq('societe_id', societe_id)
      .eq('section_analytique_id', id)
      .order('date_ecriture', { ascending: false })
      .limit(2000)

    const rows = ecritures || []

    // Ventilation par compte (direct + réparti), charges/produits.
    const byCompte = new Map<string, { numero_compte: string; nom_compte: string; net: number }>()
    const addCompte = (compte: string, nom: string, net: number) => {
      if (!net) return
      const cur = byCompte.get(compte) || { numero_compte: compte, nom_compte: nom, net: 0 }
      cur.net += net
      byCompte.set(compte, cur)
    }
    for (const e of rows) {
      const cls = String(e.numero_compte || '').charAt(0)
      if (cls !== '6' && cls !== '7') continue
      const d = Number(e.debit_mur) || 0
      const c = Number(e.credit_mur) || 0
      addCompte(e.numero_compte, e.nom_compte || '', cls === '7' ? c - d : d - c)
    }

    // Écritures réparties sur cette section via ventilations_analytiques.
    const { data: vents } = await supabase
      .from('ventilations_analytiques')
      .select('montant, ecritures_comptables_v2(numero_compte, nom_compte)')
      .eq('societe_id', societe_id)
      .eq('section_analytique_id', id)
      .limit(5000)
    let ventProduits = 0
    let ventCharges = 0
    for (const v of vents || []) {
      const ec = (v as any).ecritures_comptables_v2
      const cls = String(ec?.numero_compte || '').charAt(0)
      const m = Number(v.montant) || 0
      if (cls === '7') { ventProduits += m; addCompte(ec.numero_compte, ec.nom_compte || '', m) }
      else if (cls === '6') { ventCharges += m; addCompte(ec.numero_compte, ec.nom_compte || '', m) }
    }

    const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
    const direct = computeSectionPnl(rows)
    const produits = r2(direct.produits + ventProduits)
    const charges = r2(direct.charges + ventCharges)
    const marge = r2(produits - charges)
    const pnl = {
      produits, charges, marge,
      marge_pct: produits !== 0 ? r2((marge / produits) * 100) : null,
      nb_ecritures: direct.nb_ecritures + (vents?.length || 0),
    }

    const ventilation = Array.from(byCompte.values())
      .map((v) => ({ ...v, net: r2(v.net) }))
      .sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))

    return NextResponse.json({ section, pnl, ventilation, ecritures: rows })
  } catch (e: any) {
    if (e?._http) return NextResponse.json({ error: e.msg }, { status: e._http })
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { supabase, societe_id } = await authAndSection(request, id)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.libelle === 'string' && body.libelle.trim()) patch.libelle = body.libelle.trim().slice(0, 200)
    if (body.statut === 'actif' || body.statut === 'clos') patch.statut = body.statut
    if (body.budget_montant !== undefined) patch.budget_montant = body.budget_montant === null ? null : Number(body.budget_montant)
    if (body.budget_heures !== undefined) patch.budget_heures = body.budget_heures === null ? null : Number(body.budget_heures)

    const { data, error } = await supabase
      .from('sections_analytiques').update(patch).eq('id', id).eq('societe_id', societe_id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (e: any) {
    if (e?._http) return NextResponse.json({ error: e.msg }, { status: e._http })
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, societe_id } = await authAndSection(request, id)

    const { count } = await supabase
      .from('ecritures_comptables_v2')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id)
      .eq('section_analytique_id', id)
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: 'Section rattachée à des écritures — la clôturer plutôt que la supprimer' },
        { status: 409 },
      )
    }
    const { error } = await supabase.from('sections_analytiques').delete().eq('id', id).eq('societe_id', societe_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?._http) return NextResponse.json({ error: e.msg }, { status: e._http })
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
