/**
 * /api/client/manufacturing/nomenclatures
 *
 * GET  : liste des BOM (lignes + produit fini + coût estimé)
 * POST : crée une BOM ACTIVE (l'ancienne version active du même produit
 *        passe en obsolete). Bascule les comptes de stock par convention
 *        production propre (§1.4 spec) : produit fini → 3500/7131,
 *        composants → 3100/6031 — uniquement s'ils sont encore aux
 *        défauts marchandises (3701/6037) du socle Inventaire.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateNomenclaturePayload, coutMatieresEstime } from '@/lib/manufacturing/nomenclatures'
import {
  COMPTE_MATIERES_PREMIERES,
  COMPTE_PRODUCTION_STOCKEE,
  COMPTE_PRODUITS_FINIS,
  COMPTE_VARIATION_MATIERES,
} from '@/lib/manufacturing/types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    let query = supabase
      .from('nomenclatures')
      .select(
        '*, produits(sku, designation, unite_mesure, cout_unitaire_moyen), ' +
        'lignes_nomenclature(id, produit_composant_id, quantite, unite, taux_perte_pct, ordre, ' +
        'produits(sku, designation, unite_mesure, cout_unitaire_moyen))',
      )
      .eq('societe_id', societe_id)
      .order('created_at', { ascending: false })
      .limit(200)

    const statut = searchParams.get('statut')
    if (statut) query = query.eq('statut', statut)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

/** Bascule les comptes marchandises (défauts socle) vers les comptes production. */
async function basculerComptesProduction(
  supabase: any,
  produitFiniId: string,
  composantIds: string[],
) {
  await supabase
    .from('produits')
    .update({ compte_stock: COMPTE_PRODUITS_FINIS, compte_variation_stock: COMPTE_PRODUCTION_STOCKEE })
    .eq('id', produitFiniId)
    .eq('compte_stock', '3701')
    .eq('compte_variation_stock', '6037')

  if (composantIds.length > 0) {
    await supabase
      .from('produits')
      .update({ compte_stock: COMPTE_MATIERES_PREMIERES, compte_variation_stock: COMPTE_VARIATION_MATIERES })
      .in('id', composantIds)
      .eq('compte_stock', '3701')
      .eq('compte_variation_stock', '6037')
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const societe_id = String((body as any)?.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const validated = validateNomenclaturePayload(body)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const payload = validated.data

    // Produit fini + composants : doivent exister pour cette société.
    const ids = [payload.produit_fini_id, ...payload.lignes.map((l) => l.produit_composant_id)]
    const { data: produits, error: prodError } = await supabase
      .from('produits')
      .select('id, sku, cout_unitaire_moyen, gere_en_stock')
      .eq('societe_id', societe_id)
      .in('id', ids)
    if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })
    const connus = new Set((produits || []).map((p: any) => p.id))
    const manquant = ids.find((id) => !connus.has(id))
    if (manquant) {
      return NextResponse.json({ error: `Produit ${manquant} introuvable pour cette société` }, { status: 404 })
    }

    // Anti multi-niveau (v1) : aucun composant ne doit avoir de BOM active.
    const { data: bomsComposants } = await supabase
      .from('nomenclatures')
      .select('produit_fini_id')
      .in('produit_fini_id', payload.lignes.map((l) => l.produit_composant_id))
      .eq('statut', 'active')
    if (bomsComposants && bomsComposants.length > 0) {
      return NextResponse.json(
        { error: 'BOM_MULTINIVEAU: un composant a lui-même une nomenclature active (multi-niveaux hors périmètre v1)' },
        { status: 409 },
      )
    }

    // Une seule version active par produit fini : l'ancienne passe en obsolete.
    await supabase
      .from('nomenclatures')
      .update({ statut: 'obsolete' })
      .eq('produit_fini_id', payload.produit_fini_id)
      .eq('statut', 'active')

    const cumpParProduit: Record<string, number> = {}
    for (const p of produits || []) cumpParProduit[p.id] = Number(p.cout_unitaire_moyen) || 0

    const { data: nomenclature, error: insertError } = await supabase
      .from('nomenclatures')
      .insert({
        societe_id,
        produit_fini_id: payload.produit_fini_id,
        version: payload.version,
        libelle: payload.libelle,
        quantite_produite: payload.quantite_produite,
        statut: 'active',
        cout_matieres_estime: coutMatieresEstime(payload.lignes, cumpParProduit, payload.quantite_produite),
        cree_par: user.id,
      })
      .select('*')
      .single()
    if (insertError) {
      const msg = String(insertError.message || '')
      const status = msg.includes('uq_nomenclatures_active') || msg.includes('duplicate') ? 409 : 500
      return NextResponse.json({ error: msg }, { status })
    }

    const { error: lignesError } = await supabase.from('lignes_nomenclature').insert(
      payload.lignes.map((l, i) => ({
        societe_id,
        nomenclature_id: nomenclature.id,
        produit_composant_id: l.produit_composant_id,
        quantite: l.quantite,
        unite: l.unite,
        taux_perte_pct: l.taux_perte_pct,
        ordre: i,
      })),
    )
    if (lignesError) {
      // BOM sans lignes inutilisable — nettoyage avant de remonter l'erreur.
      await supabase.from('nomenclatures').delete().eq('id', nomenclature.id)
      const msg = String(lignesError.message || '')
      const status = msg.includes('BOM_') ? 409 : 500
      return NextResponse.json({ error: msg }, { status })
    }

    await basculerComptesProduction(
      supabase,
      payload.produit_fini_id,
      payload.lignes.map((l) => l.produit_composant_id),
    )

    return NextResponse.json({ item: nomenclature }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
