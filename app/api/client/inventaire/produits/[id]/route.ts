/**
 * /api/client/inventaire/produits/[id]
 *
 * GET    : fiche produit (niveaux de stock + derniers mouvements)
 * PATCH  : modifier un produit (jamais cout_unitaire_moyen — réservé RPC)
 * DELETE : désactivation logique (actif=false) — pas de hard delete, le
 *          journal des mouvements référence le produit.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'
import { validateProduitPayload } from '@/lib/inventaire/produits'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

async function loadProduitAndAssertAccess(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase
    .from('produits')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Lookup produit: ${error.message}`)
  if (!data) throw new ResourceNotFoundError('Produit introuvable')
  await assertSocieteAccess(supabase, userId, data.societe_id)
  return data
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const produit = await loadProduitAndAssertAccess(supabase, user.id, id)

    const [niveauxRes, mouvementsRes] = await Promise.all([
      supabase
        .from('stock_niveaux')
        .select('depot_id, quantite, valeur_stock, updated_at, depots(nom, type)')
        .eq('produit_id', id),
      supabase
        .from('mouvements_stock')
        .select('id, type_mouvement, sens, quantite, cout_unitaire, valeur_mouvement, date_mouvement, motif, reference_type, created_at, depots!mouvements_stock_depot_id_fkey(nom)')
        .eq('produit_id', id)
        .order('date_mouvement', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    if (niveauxRes.error) return NextResponse.json({ error: niveauxRes.error.message }, { status: 500 })
    if (mouvementsRes.error) return NextResponse.json({ error: mouvementsRes.error.message }, { status: 500 })

    return NextResponse.json({
      item: produit,
      niveaux: niveauxRes.data || [],
      mouvements: mouvementsRes.data || [],
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const produit = await loadProduitAndAssertAccess(supabase, user.id, id)

    // Validation sur l'état fusionné — le payload PATCH peut être partiel.
    const validated = validateProduitPayload({ ...produit, ...body })
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('produits')
      .update(validated.data)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `SKU déjà utilisé (${validated.data.sku})` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await loadProduitAndAssertAccess(supabase, user.id, id)

    const { error } = await supabase
      .from('produits')
      .update({ actif: false })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, desactive: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
