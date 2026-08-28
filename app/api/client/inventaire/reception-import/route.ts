/**
 * POST /api/client/inventaire/reception-import
 *
 * Réception de marchandises à l'import avec COÛT DE REVIENT (landed cost).
 * Répartit les charges annexes (fret, douane, assurance, manutention…) sur les
 * lignes au prorata de la valeur FOB ou de la quantité, puis enregistre pour
 * chaque produit un mouvement `entree_achat` au coût unitaire LANDED (met à
 * jour le CUMP) et l'écriture comptable équilibrée.
 *
 * Corps : {
 *   societe_id, depot_id?, methode?: 'valeur'|'quantite', date?,
 *   charges: [{ libelle, montant }],
 *   lignes:  [{ produit_id, quantite, prix_unitaire_fob }]
 * }
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { repartirLandedCost, type LigneImport, type ChargeAnnexe, type MethodeRepartition } from '@/lib/inventaire/landed-cost'
import { createEcrituresForMouvementStock } from '@/lib/inventaire/ecritures'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function resolveDepot(supabase: any, societeId: string, depotId: string | null): Promise<string> {
  if (depotId) {
    const { data } = await supabase.from('depots').select('id').eq('id', depotId).eq('societe_id', societeId).maybeSingle()
    if (!data) throw new Error('DEPOT_INTROUVABLE')
    return data.id
  }
  const { data: defaut } = await supabase
    .from('depots').select('id').eq('societe_id', societeId).eq('actif', true)
    .order('est_defaut', { ascending: false }).limit(1).maybeSingle()
  if (defaut) return defaut.id
  const { data: created, error } = await supabase
    .from('depots').insert({ societe_id: societeId, nom: 'Dépôt principal', type: 'entrepot', est_defaut: true })
    .select('id').single()
  if (error) throw new Error(`Création dépôt: ${error.message}`)
  return created.id
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })

    const societe_id = String(body.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const methode: MethodeRepartition = body.methode === 'quantite' ? 'quantite' : 'valeur'
    const date = typeof body.date === 'string' ? body.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    const charges: ChargeAnnexe[] = Array.isArray(body.charges)
      ? body.charges.map((c: any) => ({ libelle: String(c?.libelle || 'Charge'), montant: Number(c?.montant) || 0 })).filter((c: ChargeAnnexe) => c.montant > 0)
      : []
    const lignesIn: LigneImport[] = Array.isArray(body.lignes)
      ? body.lignes.map((l: any) => ({ produit_id: String(l?.produit_id || ''), quantite: Number(l?.quantite) || 0, prix_unitaire_fob: Number(l?.prix_unitaire_fob) || 0 })).filter((l: LigneImport) => l.produit_id)
      : []
    if (lignesIn.length === 0) return NextResponse.json({ error: 'Aucune ligne de réception' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    // Charger les produits ciblés (valider qu'ils appartiennent à la société)
    const produitIds = [...new Set(lignesIn.map((l) => l.produit_id))]
    const { data: produits } = await supabase
      .from('produits')
      .select('id, sku, designation, compte_stock, compte_variation_stock, gere_en_stock')
      .eq('societe_id', societe_id)
      .in('id', produitIds)
    const prodById: Record<string, any> = {}
    for (const p of produits || []) prodById[p.id] = p
    const manquants = produitIds.filter((id) => !prodById[id])
    if (manquants.length > 0) {
      return NextResponse.json({ error: `Produit(s) inconnu(s) pour cette société : ${manquants.join(', ')}` }, { status: 400 })
    }
    // Compléter les désignations pour l'affichage
    for (const l of lignesIn) l.designation = prodById[l.produit_id]?.designation

    // Cœur : répartition landed cost
    const landed = repartirLandedCost(lignesIn, charges, methode)

    // Prévisualisation (aucune écriture / mouvement) — pour l'UI
    if (body.dry_run === true) {
      return NextResponse.json({
        success: true, dry_run: true, methode,
        total_fob: landed.total_fob, total_charges: landed.total_charges,
        total_landed: landed.total_landed, lignes: landed.lignes,
      })
    }

    let depotId: string
    try {
      depotId = await resolveDepot(supabase, societe_id, body.depot_id ? String(body.depot_id) : null)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Dépôt introuvable' }, { status: 400 })
    }

    const errors: Array<{ produit_id: string; error: string }> = []
    let mouvements = 0
    for (const l of landed.lignes) {
      const prod = prodById[l.produit_id]
      if (!prod.gere_en_stock) {
        errors.push({ produit_id: l.produit_id, error: 'Produit non géré en stock' })
        continue
      }
      const { data: rpcResult, error: rpcError } = await supabase.rpc('appliquer_mouvement_stock', {
        p_societe_id: societe_id,
        p_produit_id: l.produit_id,
        p_depot_id: depotId,
        p_type_mouvement: 'entree_achat',
        p_quantite: l.quantite,
        p_cout_unitaire: l.cout_unitaire_landed,
        p_date_mouvement: date,
        p_motif: `Réception import (landed cost, ${methode})`,
        p_reference_type: 'bon_reception',
        p_reference_id: null,
        p_cree_par: user.id,
      })
      if (rpcError) {
        errors.push({ produit_id: l.produit_id, error: rpcError.message })
        continue
      }
      mouvements++
      await createEcrituresForMouvementStock(
        supabase,
        {
          id: String(rpcResult?.mouvement_id || ''),
          societe_id,
          type_mouvement: 'entree_achat',
          valeur_mouvement: Number(rpcResult?.valeur_mouvement) || l.cout_total_landed,
          date_mouvement: date,
          quantite: l.quantite,
        },
        prod,
      )
    }

    return NextResponse.json({
      success: true,
      methode,
      total_fob: landed.total_fob,
      total_charges: landed.total_charges,
      total_landed: landed.total_landed,
      mouvements,
      failed: errors.length,
      lignes: landed.lignes,
      errors: errors.slice(0, 50),
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
