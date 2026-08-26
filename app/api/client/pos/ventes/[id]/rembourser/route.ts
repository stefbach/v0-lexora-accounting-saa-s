/**
 * /api/client/pos/ventes/[id]/rembourser
 *
 * POST : rembourse (retour marchandise + argent) ou annule un ticket VALIDÉ.
 *        Appelle la RPC atomique rembourser_vente_pos (ré-entrée de stock +
 *        bascule de statut), puis poste la contrepassation comptable :
 *          - COGS inversé (via le socle inventaire, sur les mouvements retour) ;
 *          - encaissement inversé (D ventes + D TVA / C encaissement).
 *
 * Corps : { societe_id, statut?: 'remboursee' | 'annulee' }
 * Tenant isolation : assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { createEcrituresForMouvementStock } from '@/lib/inventaire/ecritures'
import { createEcrituresForRemboursementPos } from '@/lib/pos/ecritures'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: venteId } = await params
    const body = await request.json().catch(() => ({}))
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const statut: 'remboursee' | 'annulee' = body?.statut === 'annulee' ? 'annulee' : 'remboursee'

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    // Vente + lignes (avec comptes produit) + paiements — avant bascule de statut.
    const { data: vente } = await supabase
      .from('ventes_pos')
      .select('id, societe_id, numero_ticket, date_vente, montant_tva, statut, depot_id')
      .eq('id', venteId).eq('societe_id', societe_id).maybeSingle()
    if (!vente) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })
    if (vente.statut !== 'validee') {
      return NextResponse.json({ error: `Ticket déjà en statut ${vente.statut}` }, { status: 409 })
    }

    const { data: lignes } = await supabase
      .from('lignes_vente_pos')
      .select('montant_ht, produit_id, produits(compte_vente, compte_stock, compte_variation_stock, designation, sku)')
      .eq('vente_pos_id', venteId).eq('societe_id', societe_id)
    const { data: paiements } = await supabase
      .from('paiements_pos')
      .select('compte_comptable, montant')
      .eq('vente_pos_id', venteId).eq('societe_id', societe_id)

    // Ré-entrée de stock + statut (atomique en base).
    const { data: rpc, error: rpcError } = await supabase.rpc('rembourser_vente_pos', {
      p_societe_id: societe_id,
      p_vente_id: venteId,
      p_statut: statut,
      p_date: null,
      p_cree_par: user.id,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      const code = msg.includes('NON_REMBOURSABLE') ? 409 : msg.includes('INTROUVABLE') ? 404 : 400
      return NextResponse.json({ error: msg }, { status: code })
    }

    const dateRemb = String(rpc?.date || new Date().toISOString().slice(0, 10))
    const produitById = new Map<string, any>()
    for (const l of lignes || []) if (l.produit_id) produitById.set(l.produit_id, (l as any).produits)

    // COGS inversé — une écriture par mouvement de retour.
    for (const m of (rpc?.mouvements || []) as any[]) {
      const prod = produitById.get(m.produit_id) || { designation: '?', sku: '?' }
      await createEcrituresForMouvementStock(
        supabase,
        {
          id: String(m.mouvement_id || ''),
          societe_id,
          type_mouvement: 'retour_client',
          valeur_mouvement: Number(m.valeur_mouvement) || 0,
          date_mouvement: dateRemb,
          quantite: Number(m.quantite) || 0,
        },
        prod,
      )
    }

    // Encaissement inversé (idempotent par ref_folio POS-<id>-REMB).
    const ecr = await createEcrituresForRemboursementPos(
      supabase,
      {
        id: vente.id,
        societe_id,
        numero_ticket: vente.numero_ticket,
        date_vente: dateRemb,
        montant_tva: Number(vente.montant_tva) || 0,
      },
      (lignes || []).map((l) => ({ montant_ht: Number(l.montant_ht) || 0, compte_vente: (l as any).produits?.compte_vente || null })),
      (paiements || []).map((p) => ({ compte_comptable: p.compte_comptable, montant: Number(p.montant) || 0 })),
      statut,
    )

    return NextResponse.json({ ok: true, statut, numero_ticket: vente.numero_ticket, ecritures: ecr.nb_entries })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
