/**
 * POST /api/client/manufacturing/ordres/[id]/cloturer
 *
 * Clôture d'un OF : entrée en stock du produit fini au coût de revient
 * réel via la RPC `produire_ordre_fabrication` (mig 489, coût figé,
 * statut 'cloture' immuable), puis pièce comptable OF-<id>-PROD
 * (D compte stock produit fini / C 3300) au montant EXACT imputé à
 * l'en-cours — le 3300 de l'OF est soldé à zéro.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateProductionPayload } from '@/lib/manufacturing/ordres'
import { createEcrituresProductionOF } from '@/lib/manufacturing/ecritures'
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

    const validated = validateProductionPayload(body)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const { quantite_produite, date } = validated.data

    const { data: rpcResult, error: rpcError } = await supabase.rpc('produire_ordre_fabrication', {
      p_societe_id: ordre.societe_id,
      p_ordre_id: id,
      p_quantite: quantite_produite,
      p_date: date,
      p_cree_par: user.id,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      return NextResponse.json({ error: msg }, { status: statusForRpcError(msg) })
    }

    const produitFini = ordre.nomenclatures?.produits || {}
    const ecritures = await createEcrituresProductionOF(
      supabase,
      { id, societe_id: ordre.societe_id, numero_of: ordre.numero_of },
      {
        designation: produitFini.designation || '?',
        sku: produitFini.sku || '?',
        compte_stock: produitFini.compte_stock,
      },
      Number(rpcResult?.cout_total) || 0,
      quantite_produite,
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
