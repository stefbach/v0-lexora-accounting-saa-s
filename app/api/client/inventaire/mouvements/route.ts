/**
 * /api/client/inventaire/mouvements
 *
 * GET  : journal des mouvements (filtres produit/depot/type/période)
 * POST : enregistre un mouvement via la RPC atomique appliquer_mouvement_stock
 *        (migration 482), génère l'écriture comptable équilibrée
 *        (ref_folio STK-<id>) et met à jour les alertes de seuil.
 *
 * Le journal est immuable : pas de PATCH/DELETE — correction par mouvement
 * compensatoire.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateMouvementPayload } from '@/lib/inventaire/mouvements'
import { createEcrituresForMouvementStock } from '@/lib/inventaire/ecritures'
import { evaluerSeuil } from '@/lib/inventaire/alertes'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    let query = supabase
      .from('mouvements_stock')
      .select('*, produits(sku, designation, unite_mesure), depots!mouvements_stock_depot_id_fkey(nom)')
      .eq('societe_id', societe_id)
      .order('date_mouvement', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    const produitId = searchParams.get('produit_id')
    if (produitId) query = query.eq('produit_id', produitId)
    const depotId = searchParams.get('depot_id')
    if (depotId) query = query.eq('depot_id', depotId)
    const type = searchParams.get('type_mouvement')
    if (type) query = query.eq('type_mouvement', type)
    const dateMin = searchParams.get('date_min')
    if (dateMin) query = query.gte('date_mouvement', dateMin)
    const dateMax = searchParams.get('date_max')
    if (dateMax) query = query.lte('date_mouvement', dateMax)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

/** Dépôt cible : celui fourni, sinon le dépôt par défaut (créé au besoin). */
async function resolveDepot(supabase: any, societeId: string, depotId: string | null): Promise<string> {
  if (depotId) {
    const { data } = await supabase
      .from('depots')
      .select('id')
      .eq('id', depotId)
      .eq('societe_id', societeId)
      .maybeSingle()
    if (!data) throw new Error('DEPOT_INTROUVABLE: dépôt inconnu pour cette société')
    return data.id
  }
  const { data: defaut } = await supabase
    .from('depots')
    .select('id')
    .eq('societe_id', societeId)
    .eq('actif', true)
    .order('est_defaut', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (defaut) return defaut.id
  const { data: created, error } = await supabase
    .from('depots')
    .insert({ societe_id: societeId, nom: 'Dépôt principal', type: 'entrepot', est_defaut: true })
    .select('id')
    .single()
  if (error) throw new Error(`Création dépôt par défaut: ${error.message}`)
  return created.id
}

/** Après mouvement : upsert/résolution de l'alerte active produit×dépôt. */
async function syncAlerte(
  supabase: any,
  societeId: string,
  produit: { id: string; seuil_alerte: number | null; stock_mini: number | null; stock_maxi: number | null },
  depotId: string,
  quantiteApres: number,
) {
  const alerte = evaluerSeuil(quantiteApres, produit)
  const { data: active } = await supabase
    .from('alertes_stock')
    .select('id, type_alerte')
    .eq('produit_id', produit.id)
    .eq('depot_id', depotId)
    .eq('statut', 'active')
    .maybeSingle()

  if (alerte) {
    if (active) {
      await supabase
        .from('alertes_stock')
        .update({
          type_alerte: alerte.type_alerte,
          seuil_reference: alerte.seuil_reference,
          quantite_constatee: quantiteApres,
          declenchee_at: new Date().toISOString(),
        })
        .eq('id', active.id)
    } else {
      await supabase.from('alertes_stock').insert({
        societe_id: societeId,
        produit_id: produit.id,
        depot_id: depotId,
        type_alerte: alerte.type_alerte,
        seuil_reference: alerte.seuil_reference,
        quantite_constatee: quantiteApres,
        statut: 'active',
      })
    }
  } else if (active) {
    await supabase
      .from('alertes_stock')
      .update({ statut: 'resolue', resolue_at: new Date().toISOString() })
      .eq('id', active.id)
  }
  return alerte
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const societe_id = String(body.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const validated = validateMouvementPayload(body)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    const mvt = validated.data

    const depotId = await resolveDepot(supabase, societe_id, mvt.depot_id)

    // Application atomique (verrou de ligne + CUMP + stock_niveaux) — RPC seule.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('appliquer_mouvement_stock', {
      p_societe_id: societe_id,
      p_produit_id: mvt.produit_id,
      p_depot_id: depotId,
      p_type_mouvement: mvt.type_mouvement,
      p_quantite: mvt.quantite,
      p_cout_unitaire: mvt.cout_unitaire,
      p_date_mouvement: mvt.date_mouvement,
      p_motif: mvt.motif,
      p_reference_type: 'manuel',
      p_reference_id: null,
      p_cree_par: user.id,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      if (msg.includes('STOCK_INSUFFISANT')) return NextResponse.json({ error: msg }, { status: 409 })
      if (msg.includes('PERIOD_LOCKED')) return NextResponse.json({ error: msg }, { status: 423 })
      if (msg.includes('INTROUVABLE')) return NextResponse.json({ error: msg }, { status: 404 })
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const mouvementId = String(rpcResult?.mouvement_id || '')
    const { data: produit } = await supabase
      .from('produits')
      .select('id, sku, designation, compte_stock, compte_variation_stock, seuil_alerte, stock_mini, stock_maxi')
      .eq('id', mvt.produit_id)
      .single()

    // Écriture comptable équilibrée (inventaire permanent, §1.4 de la spec).
    const ecritures = await createEcrituresForMouvementStock(
      supabase,
      {
        id: mouvementId,
        societe_id,
        type_mouvement: mvt.type_mouvement,
        valeur_mouvement: Number(rpcResult?.valeur_mouvement) || 0,
        date_mouvement: mvt.date_mouvement,
        quantite: mvt.quantite,
      },
      produit || { designation: '?', sku: '?' },
    )

    const alerte = produit
      ? await syncAlerte(supabase, societe_id, produit, depotId, Number(rpcResult?.quantite_apres) || 0)
      : null

    return NextResponse.json(
      {
        mouvement_id: mouvementId,
        depot_id: depotId,
        ...rpcResult,
        ecritures: { ok: ecritures.ok, nb_entries: ecritures.nb_entries, error: ecritures.error },
        alerte,
      },
      { status: 201 },
    )
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    const msg = e?.message || 'Erreur'
    const status = String(msg).includes('DEPOT_INTROUVABLE') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
