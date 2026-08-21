/**
 * /api/client/manufacturing/ordres
 *
 * GET  : liste des ordres de fabrication (filtres statut/nomenclature)
 * POST : crée un OF en statut 'planifie' à partir de la BOM active —
 *        retourne l'OF et les consommations théoriques préremplies.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { buildLignesConsommation, numeroOF, validateOrdrePayload } from '@/lib/manufacturing/ordres'

export const dynamic = 'force-dynamic'

const SELECT_OF =
  '*, nomenclatures(version, libelle, quantite_produite, produit_fini_id, ' +
  'produits(sku, designation, unite_mesure)), depots(nom)'

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
      .from('ordres_fabrication')
      .select(SELECT_OF)
      .eq('societe_id', societe_id)
      .order('created_at', { ascending: false })
      .limit(300)

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

    const validated = validateOrdrePayload(body)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const payload = validated.data

    const { data: bomData, error: bomError } = await supabase
      .from('nomenclatures')
      .select('id, societe_id, statut, quantite_produite, produit_fini_id, ' +
        'lignes_nomenclature(produit_composant_id, quantite, taux_perte_pct)')
      .eq('id', payload.nomenclature_id)
      .eq('societe_id', societe_id)
      .maybeSingle()
    if (bomError) return NextResponse.json({ error: bomError.message }, { status: 500 })
    const bom = bomData as any
    if (!bom) return NextResponse.json({ error: 'Nomenclature introuvable' }, { status: 404 })
    if (bom.statut !== 'active') {
      return NextResponse.json({ error: 'Seule une nomenclature active peut lancer un OF' }, { status: 409 })
    }
    const lignesBom = bom.lignes_nomenclature || []
    if (lignesBom.length === 0) {
      return NextResponse.json({ error: 'Nomenclature sans composant' }, { status: 409 })
    }

    const depotId = await resolveDepot(supabase, societe_id, payload.depot_id)

    const annee = new Date().getFullYear()
    // Séquence par année ; collision concurrente couverte par UNIQUE + retry.
    let insert: any = null
    for (let essai = 0; essai < 2 && !insert; essai++) {
      const { count } = await supabase
        .from('ordres_fabrication')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', societe_id)
        .like('numero_of', `OF-${annee}-%`)
      const numero = numeroOF(annee, (Number(count) || 0) + 1 + essai)
      const { data, error } = await supabase
        .from('ordres_fabrication')
        .insert({
          societe_id,
          depot_id: depotId,
          nomenclature_id: bom.id,
          numero_of: numero,
          quantite_a_produire: payload.quantite_a_produire,
          date_planifiee: payload.date_planifiee,
          notes: payload.notes,
          responsable_id: user.id,
        })
        .select(SELECT_OF)
        .single()
      if (error) {
        if (essai === 0 && String(error.message || '').includes('duplicate')) continue
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      insert = data
    }
    if (!insert) return NextResponse.json({ error: 'Numérotation OF en conflit — réessayer' }, { status: 409 })

    const lignes_theoriques = buildLignesConsommation(
      lignesBom,
      payload.quantite_a_produire,
      Number(bom.quantite_produite) || 1,
    )

    return NextResponse.json({ item: insert, lignes_theoriques }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    const msg = e?.message || 'Erreur'
    const status = String(msg).includes('DEPOT_INTROUVABLE') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
