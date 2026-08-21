/**
 * /api/client/inventaire/stock
 *
 * GET : niveaux de stock courants (par produit × dépôt) + alertes actives.
 * Lecture seule — stock_niveaux est écrit exclusivement par la RPC
 * appliquer_mouvement_stock (migration 482).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

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

    const [niveauxRes, alertesRes, depotsRes] = await Promise.all([
      supabase
        .from('stock_niveaux')
        .select('id, produit_id, depot_id, quantite, valeur_stock, updated_at, produits(sku, designation, unite_mesure, cout_unitaire_moyen, seuil_alerte, stock_mini, actif), depots(nom, type)')
        .eq('societe_id', societe_id),
      supabase
        .from('alertes_stock')
        .select('id, produit_id, depot_id, type_alerte, seuil_reference, quantite_constatee, statut, declenchee_at, produits(sku, designation)')
        .eq('societe_id', societe_id)
        .eq('statut', 'active')
        .order('declenchee_at', { ascending: false }),
      supabase
        .from('depots')
        .select('id, nom, type, est_defaut, actif')
        .eq('societe_id', societe_id)
        .order('est_defaut', { ascending: false }),
    ])
    if (niveauxRes.error) return NextResponse.json({ error: niveauxRes.error.message }, { status: 500 })
    if (alertesRes.error) return NextResponse.json({ error: alertesRes.error.message }, { status: 500 })
    if (depotsRes.error) return NextResponse.json({ error: depotsRes.error.message }, { status: 500 })

    return NextResponse.json({
      niveaux: niveauxRes.data || [],
      alertes: alertesRes.data || [],
      depots: depotsRes.data || [],
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
