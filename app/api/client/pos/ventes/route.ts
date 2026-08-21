/**
 * /api/client/pos/ventes
 *
 * GET  : tickets (filtre session), avec lignes et paiements
 * POST : validation ATOMIQUE d'un ticket via la RPC valider_vente_pos
 *        (migration 486 — lignes + paiements + déduction de stock par
 *        appliquer_mouvement_stock dans une seule transaction), puis
 *        écritures comptables (journal POS : encaissement / TVA collectée,
 *        et COGS via le socle inventaire) et alertes de seuil.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateVentePayload } from '@/lib/pos/panier'
import { createEcrituresForVentePos } from '@/lib/pos/ecritures'
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
      .from('ventes_pos')
      .select('*, lignes_vente_pos(*, produits(sku, designation)), paiements_pos(moyen_paiement, montant, reference)')
      .eq('societe_id', societe_id)
      .order('date_vente', { ascending: false })
      .limit(200)
    const sessionId = searchParams.get('session_id')
    if (sessionId) query = query.eq('session_caisse_id', sessionId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

/** Après déduction : upsert/résolution de l'alerte active produit×dépôt. */
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
    .select('id')
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
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const validated = validateVentePayload(body)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    const vente = validated.data
    const dateVente = new Date().toISOString()

    // Validation atomique : ticket + lignes + paiements + stock (RPC 486).
    const { data: rpcResult, error: rpcError } = await supabase.rpc('valider_vente_pos', {
      p_societe_id: societe_id,
      p_session_id: vente.session_id,
      p_lignes: vente.lignes,
      p_paiements: vente.paiements,
      p_client_id: null,
      p_date_vente: dateVente,
      p_cree_par: user.id,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      if (msg.includes('STOCK_INSUFFISANT') || msg.includes('SESSION_FERMEE')) {
        return NextResponse.json({ error: msg }, { status: 409 })
      }
      if (msg.includes('PERIOD_LOCKED')) return NextResponse.json({ error: msg }, { status: 423 })
      if (msg.includes('INTROUVABLE')) return NextResponse.json({ error: msg }, { status: 404 })
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const venteId = String(rpcResult?.vente_id || '')

    // Données persistées (lignes recalculées serveur + paiements ventilés).
    const [{ data: lignesDb }, { data: paiementsDb }, { data: venteDb }] = await Promise.all([
      supabase
        .from('lignes_vente_pos')
        .select('produit_id, quantite, montant_ht, mouvement_stock_id, produits(sku, designation, compte_vente, compte_stock, compte_variation_stock, gere_en_stock, seuil_alerte, stock_mini, stock_maxi)')
        .eq('vente_pos_id', venteId),
      supabase
        .from('paiements_pos')
        .select('compte_comptable, montant')
        .eq('vente_pos_id', venteId),
      supabase
        .from('ventes_pos')
        .select('depot_id')
        .eq('id', venteId)
        .single(),
    ])

    // Écriture d'encaissement (journal POS) — R1, idempotente par POS-<id>.
    const ecrituresVente = await createEcrituresForVentePos(
      supabase,
      {
        id: venteId,
        societe_id,
        numero_ticket: String(rpcResult?.numero_ticket || ''),
        date_vente: dateVente,
        montant_tva: Number(rpcResult?.montant_tva) || 0,
      },
      (lignesDb || []).map((l: any) => ({
        montant_ht: Number(l.montant_ht) || 0,
        compte_vente: l.produits?.compte_vente || null,
      })),
      (paiementsDb || []).map((p: any) => ({
        compte_comptable: p.compte_comptable,
        montant: Number(p.montant) || 0,
      })),
    )

    // COGS + alertes — un mouvement `sortie_vente` par ligne stockée (socle inventaire).
    let cogsEntries = 0
    const mouvements: any[] = Array.isArray(rpcResult?.mouvements) ? rpcResult.mouvements : []
    for (const mvt of mouvements) {
      const ligne: any = (lignesDb || []).find((l: any) => l.mouvement_stock_id === mvt.mouvement_id)
      const produit = ligne?.produits as
        | { sku: string; designation: string; compte_vente: string | null; compte_stock: string | null; compte_variation_stock: string | null; gere_en_stock: boolean; seuil_alerte: number | null; stock_mini: number | null; stock_maxi: number | null }
        | undefined
      const cogs = await createEcrituresForMouvementStock(
        supabase,
        {
          id: String(mvt.mouvement_id),
          societe_id,
          type_mouvement: 'sortie_vente',
          valeur_mouvement: Number(mvt.valeur_mouvement) || 0,
          date_mouvement: dateVente.slice(0, 10),
          quantite: Number(mvt.quantite) || 0,
        },
        produit
          ? { designation: produit.designation, sku: produit.sku, compte_stock: produit.compte_stock, compte_variation_stock: produit.compte_variation_stock }
          : { designation: '?', sku: '?' },
      )
      cogsEntries += cogs.nb_entries
      if (produit && venteDb?.depot_id) {
        await syncAlerte(
          supabase,
          societe_id,
          { id: String(mvt.produit_id), seuil_alerte: produit.seuil_alerte, stock_mini: produit.stock_mini, stock_maxi: produit.stock_maxi },
          venteDb.depot_id,
          Number(mvt.quantite_apres) || 0,
        )
      }
    }

    return NextResponse.json(
      {
        ...rpcResult,
        ecritures: {
          vente: { ok: ecrituresVente.ok, nb_entries: ecrituresVente.nb_entries, error: ecrituresVente.error },
          cogs_nb_entries: cogsEntries,
        },
      },
      { status: 201 },
    )
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
