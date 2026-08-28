/**
 * /api/client/inventaire/produits/import
 *
 * POST : import en masse de produits depuis un fichier CSV/Excel déjà parsé
 *        et mappé côté client (lib/import/products-import.ts).
 *
 * Corps : { societe_id, depot_id?, rows: [{ sku, designation, prix_vente_ht?,
 *           taux_tva?, categorie?, unite_mesure?, code_barre?, stock_mini?,
 *           stock_maxi?, seuil_alerte?, compte_*?, stock_initial?,
 *           cout_unitaire_initial? }, ...] }
 *
 * Pour chaque ligne : validation (validateProduitPayload), insert produit, puis
 * — si stock_initial > 0 et produit géré en stock — écriture d'un mouvement
 * `entree_achat` via la RPC atomique appliquer_mouvement_stock (qui met à jour
 * le CUMP et le niveau), suivie de l'écriture comptable équilibrée. Les erreurs
 * sont collectées ligne par ligne ; l'import est « best-effort » (une ligne en
 * échec n'annule pas les autres). Tenant isolation : assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateProduitPayload } from '@/lib/inventaire/produits'
import { createEcritureStockInitial } from '@/lib/inventaire/ecritures'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 1000

/**
 * Date d'ouverture d'exercice pour dater les à-nouveaux (stock initial).
 * Priorité : exercice en cours (exercices_fiscaux) → date_debut_exercice de la
 * société → 1er janvier de l'année courante en dernier recours.
 */
async function resolveDateOuverture(supabase: any, societeId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: ex } = await supabase
    .from('exercices_fiscaux')
    .select('date_debut, date_fin')
    .eq('societe_id', societeId)
    .lte('date_debut', today)
    .order('date_debut', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ex?.date_debut) return ex.date_debut

  const { data: soc } = await supabase
    .from('societes')
    .select('date_debut_exercice')
    .eq('id', societeId)
    .maybeSingle()
  if (soc?.date_debut_exercice) return soc.date_debut_exercice

  return `${today.slice(0, 4)}-01-01`
}

async function resolveDepot(supabase: any, societeId: string, depotId: string | null): Promise<string> {
  if (depotId) {
    const { data } = await supabase
      .from('depots').select('id').eq('id', depotId).eq('societe_id', societeId).maybeSingle()
    if (!data) throw new Error('DEPOT_INTROUVABLE: dépôt inconnu pour cette société')
    return data.id
  }
  const { data: defaut } = await supabase
    .from('depots').select('id').eq('societe_id', societeId).eq('actif', true)
    .order('est_defaut', { ascending: false }).limit(1).maybeSingle()
  if (defaut) return defaut.id
  const { data: created, error } = await supabase
    .from('depots')
    .insert({ societe_id: societeId, nom: 'Dépôt principal', type: 'entrepot', est_defaut: true })
    .select('id').single()
  if (error) throw new Error(`Création dépôt par défaut: ${error.message}`)
  return created.id
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const societe_id = String(body.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const rows: unknown[] = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) return NextResponse.json({ error: 'Aucune ligne à importer' }, { status: 400 })
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Trop de lignes (max ${MAX_ROWS} par import)` }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    // Date d'ouverture d'exercice — le stock initial est un à-nouveau, il
    // doit être daté à l'ouverture de l'exercice (pas à la date d'import) et
    // imputé au report à nouveau, pas à une charge de la classe 6.
    const dateOuverture = await resolveDateOuverture(supabase, societe_id)

    let depotId: string
    try {
      depotId = await resolveDepot(supabase, societe_id, body.depot_id ? String(body.depot_id) : null)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Dépôt introuvable' }, { status: 400 })
    }

    const errors: Array<{ ligne: number; sku?: string; error: string }> = []
    let created = 0
    let stockSeeded = 0
    const today = new Date().toISOString().slice(0, 10)

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] as Record<string, unknown>
      const ligne = i + 1
      const validated = validateProduitPayload(raw)
      if (!validated.ok) {
        errors.push({ ligne, sku: raw?.sku ? String(raw.sku) : undefined, error: validated.error })
        continue
      }
      const payload = validated.data

      const { data: prod, error: insErr } = await supabase
        .from('produits')
        .insert({ ...payload, societe_id })
        .select('id, sku, designation, compte_stock, compte_variation_stock, gere_en_stock, seuil_alerte, stock_mini, stock_maxi')
        .single()
      if (insErr) {
        errors.push({
          ligne,
          sku: payload.sku,
          error: insErr.code === '23505' ? `SKU déjà utilisé (${payload.sku})` : insErr.message,
        })
        continue
      }
      created++

      // Stock initial → mouvement entree_achat (met à jour CUMP + niveau) + écriture.
      const stockInitial = Number((raw as any).stock_initial) || 0
      const coutUnitaire = Number((raw as any).cout_unitaire_initial) || 0
      if (stockInitial > 0 && prod.gere_en_stock) {
        const { data: rpcResult, error: rpcError } = await supabase.rpc('appliquer_mouvement_stock', {
          p_societe_id: societe_id,
          p_produit_id: prod.id,
          p_depot_id: depotId,
          p_type_mouvement: 'entree_achat',
          p_quantite: stockInitial,
          p_cout_unitaire: coutUnitaire,
          p_date_mouvement: today,
          p_motif: 'Stock initial (import)',
          p_reference_type: 'manuel',
          p_reference_id: null,
          p_cree_par: user.id,
        })
        if (rpcError) {
          errors.push({ ligne, sku: payload.sku, error: `Stock initial: ${rpcError.message}` })
        } else {
          stockSeeded++
          await createEcritureStockInitial(
            supabase,
            {
              id: String(rpcResult?.mouvement_id || ''),
              societe_id,
              type_mouvement: 'entree_achat',
              valeur_mouvement: Number(rpcResult?.valeur_mouvement) || 0,
              date_mouvement: today,
              quantite: stockInitial,
            },
            prod,
            { dateOuverture },
          )
        }
      }
    }

    return NextResponse.json({
      created,
      stock_seeded: stockSeeded,
      failed: errors.length,
      total: rows.length,
      errors: errors.slice(0, 200),
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
