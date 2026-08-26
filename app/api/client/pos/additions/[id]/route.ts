/**
 * /api/client/pos/additions/[id]
 * GET  : détail d'une addition (lignes + totaux).
 * POST : action = add_ligne | update_ligne | remove_ligne | encaisser | annuler.
 *
 * Encaisser réutilise la RPC atomique valider_vente_pos (ticket + stock +
 * écritures dans une transaction) : l'addition devient un ticket POS.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateAdditionLignePayload, additionTotaux, additionLignesToVente } from '@/lib/pos/restaurant'
import { isElectronique, providerParDefaut } from '@/lib/pos/payments'

export const dynamic = 'force-dynamic'

async function ctx() {
  const supabase = getAdminClient()
  const authClient = await createClient()
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) throw { _http: 401, msg: 'unauthorized' }
  return { supabase, user }
}

async function loadAddition(supabase: any, societe_id: string, id: string) {
  const { data } = await supabase
    .from('additions')
    .select('*, additions_lignes(*, produits(sku, designation)), tables_restaurant(code, nom)')
    .eq('id', id).eq('societe_id', societe_id).maybeSingle()
  return data
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const societe_id = String(new URL(request.url).searchParams.get('societe_id') || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const { supabase, user } = await ctx()
    await assertSocieteAccess(supabase, user.id, societe_id)
    const addition = await loadAddition(supabase, societe_id, id)
    if (!addition) return NextResponse.json({ error: 'Addition introuvable' }, { status: 404 })
    const totaux = additionTotaux(addition.additions_lignes || [])
    return NextResponse.json({ addition, totaux })
  } catch (e: any) {
    if (e?._http) return NextResponse.json({ error: e.msg }, { status: e._http })
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const societe_id = String(body?.societe_id || '')
    const action = String(body?.action || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const { supabase, user } = await ctx()
    await assertSocieteAccess(supabase, user.id, societe_id)

    const addition = await loadAddition(supabase, societe_id, id)
    if (!addition) return NextResponse.json({ error: 'Addition introuvable' }, { status: 404 })
    if (addition.statut !== 'ouverte') return NextResponse.json({ error: `Addition ${addition.statut}` }, { status: 409 })

    // ── Ajouter une ligne ──────────────────────────────────────────────────
    if (action === 'add_ligne') {
      const { data: prod } = await supabase
        .from('produits').select('id, prix_vente_ht, taux_tva, actif').eq('id', String(body.produit_id || '')).eq('societe_id', societe_id).maybeSingle()
      if (!prod || !prod.actif) return NextResponse.json({ error: 'Produit introuvable ou inactif' }, { status: 400 })
      const v = validateAdditionLignePayload(body, Number(prod.prix_vente_ht) || 0, Number(prod.taux_tva) || 15)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      const { data, error } = await supabase
        .from('additions_lignes')
        .insert({ ...v.data, societe_id, addition_id: id, created_by: user.id })
        .select('*, produits(sku, designation)').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ligne: data }, { status: 201 })
    }

    // ── Modifier une ligne (quantité) ──────────────────────────────────────
    if (action === 'update_ligne') {
      const ligne_id = String(body.ligne_id || '')
      const q = Number(body.quantite)
      if (!ligne_id || !Number.isFinite(q) || q <= 0) return NextResponse.json({ error: 'ligne_id et quantité > 0 requis' }, { status: 400 })
      const { error } = await supabase
        .from('additions_lignes').update({ quantite: q }).eq('id', ligne_id).eq('addition_id', id).eq('societe_id', societe_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Retirer une ligne ──────────────────────────────────────────────────
    if (action === 'remove_ligne') {
      const ligne_id = String(body.ligne_id || '')
      if (!ligne_id) return NextResponse.json({ error: 'ligne_id requis' }, { status: 400 })
      const { error } = await supabase
        .from('additions_lignes').delete().eq('id', ligne_id).eq('addition_id', id).eq('societe_id', societe_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Annuler l'addition ─────────────────────────────────────────────────
    if (action === 'annuler') {
      await supabase.from('additions').update({ statut: 'annulee', closed_at: new Date().toISOString() }).eq('id', id).eq('societe_id', societe_id)
      if (addition.table_id) await supabase.from('tables_restaurant').update({ statut: 'libre' }).eq('id', addition.table_id).eq('societe_id', societe_id)
      return NextResponse.json({ ok: true, statut: 'annulee' })
    }

    // ── Encaisser (→ ticket via valider_vente_pos) ─────────────────────────
    if (action === 'encaisser') {
      const session_id = String(body.session_id || addition.session_caisse_id || '')
      if (!session_id) return NextResponse.json({ error: 'Session de caisse requise pour encaisser' }, { status: 400 })
      const lignes = addition.additions_lignes || []
      if (lignes.length === 0) return NextResponse.json({ error: 'Addition vide' }, { status: 400 })
      const paiements = Array.isArray(body.paiements) ? body.paiements : []
      if (paiements.length === 0) return NextResponse.json({ error: 'Au moins un paiement requis' }, { status: 400 })

      const { data: rpc, error: rpcError } = await supabase.rpc('valider_vente_pos', {
        p_societe_id: societe_id,
        p_session_id: session_id,
        p_lignes: additionLignesToVente(lignes),
        p_paiements: paiements.map((p: any) => ({ moyen_paiement: p.moyen_paiement, montant: Number(p.montant) || 0, reference: p.reference || null })),
        p_client_id: null,
        p_date_vente: new Date().toISOString(),
        p_cree_par: user.id,
      })
      if (rpcError) {
        const msg = String(rpcError.message || '')
        const code = msg.includes('STOCK_INSUFFISANT') || msg.includes('SESSION_FERMEE') || msg.includes('DESEQUILIBRE') ? 409
          : msg.includes('PERIOD_LOCKED') ? 423 : msg.includes('INTROUVABLE') ? 404 : 400
        return NextResponse.json({ error: msg }, { status: code })
      }

      const venteId = String(rpc?.vente_id || '')
      // Provider sur paiements électroniques (métadonnée, mig 505).
      const moyensElec = Array.from(new Set(paiements.map((p: any) => p.moyen_paiement).filter((m: any) => isElectronique(m))))
      for (const m of moyensElec) {
        await supabase.from('paiements_pos').update({ provider: providerParDefaut(m as any) }).eq('vente_pos_id', venteId).eq('moyen_paiement', m)
      }

      await supabase.from('additions').update({ statut: 'encaissee', vente_pos_id: venteId, closed_at: new Date().toISOString() }).eq('id', id).eq('societe_id', societe_id)
      if (addition.table_id) await supabase.from('tables_restaurant').update({ statut: 'libre' }).eq('id', addition.table_id).eq('societe_id', societe_id)

      return NextResponse.json({ ok: true, vente: rpc })
    }

    return NextResponse.json({ error: 'action inconnue' }, { status: 400 })
  } catch (e: any) {
    if (e?._http) return NextResponse.json({ error: e.msg }, { status: e._http })
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
