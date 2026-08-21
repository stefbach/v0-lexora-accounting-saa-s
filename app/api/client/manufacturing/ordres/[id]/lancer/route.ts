/**
 * POST /api/client/manufacturing/ordres/[id]/lancer
 *
 * Lancement d'un OF : consommation ATOMIQUE des composants via la RPC
 * `consommer_ordre_fabrication` (mig 489 — verrou, CUMP, stock négatif,
 * R5, tout-ou-rien), puis pièce comptable équilibrée OF-<id>-CONSO
 * (D 3300 théorique / C stocks composants réel / écart 6586).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateLancementPayload } from '@/lib/manufacturing/ordres'
import {
  createEcrituresConsommationOF,
  type ConsommationPourEcritures,
} from '@/lib/manufacturing/ecritures'
import { loadOrdreAndAssertAccess, statusForRpcError } from '../../shared'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const ordre = await loadOrdreAndAssertAccess(supabase, user.id, id)

    const validated = validateLancementPayload(body)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const { lignes, date } = validated.data

    const { data: rpcResult, error: rpcError } = await supabase.rpc('consommer_ordre_fabrication', {
      p_societe_id: ordre.societe_id,
      p_ordre_id: id,
      p_lignes: lignes,
      p_date: date,
      p_cree_par: user.id,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      return NextResponse.json({ error: msg }, { status: statusForRpcError(msg) })
    }

    // Comptes de stock des composants pour la pièce comptable.
    const produitIds = lignes.map((l) => l.produit_id)
    const { data: produits } = await supabase
      .from('produits')
      .select('id, sku, designation, compte_stock')
      .in('id', produitIds)
    const parId = new Map<string, any>((produits || []).map((p: any) => [p.id, p]))

    const consommations: ConsommationPourEcritures[] = (
      (rpcResult?.consommations as any[]) || []
    ).map((c) => {
      const p = parId.get(String(c.produit_id))
      return {
        compte_stock: p?.compte_stock || '3701',
        designation: p?.designation || '?',
        sku: p?.sku || '?',
        valeur_theorique: Number(c.valeur_theorique) || 0,
        valeur_reelle: Number(c.valeur_reelle) || 0,
      }
    })

    const ecritures = await createEcrituresConsommationOF(
      supabase,
      { id, societe_id: ordre.societe_id, numero_of: ordre.numero_of },
      consommations,
      date,
    )

    return NextResponse.json({
      ...rpcResult,
      ecritures: { ok: ecritures.ok, nb_entries: ecritures.nb_entries, error: ecritures.error },
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
