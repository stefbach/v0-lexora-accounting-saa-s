/**
 * /api/client/manufacturing/ordres/[id]
 *
 * GET   : détail d'un OF — BOM, consommations théoriques préremplies,
 *         consommations/productions réelles enregistrées.
 * PATCH : action 'annuler' (uniquement depuis 'planifie').
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { buildLignesConsommation } from '@/lib/manufacturing/ordres'
import { peutTransitionner, type StatutOF } from '@/lib/manufacturing/types'
import { loadOrdreAndAssertAccess } from '../shared'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const ordre = await loadOrdreAndAssertAccess(supabase, user.id, id)

    const [consosRes, prodsRes] = await Promise.all([
      supabase
        .from('consommations_of')
        .select('*, produits(sku, designation, unite_mesure)')
        .eq('ordre_fabrication_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('productions_of')
        .select('*, produits(sku, designation, unite_mesure)')
        .eq('ordre_fabrication_id', id)
        .order('created_at', { ascending: true }),
    ])
    if (consosRes.error) return NextResponse.json({ error: consosRes.error.message }, { status: 500 })
    if (prodsRes.error) return NextResponse.json({ error: prodsRes.error.message }, { status: 500 })

    const lignesBom = ordre.nomenclatures?.lignes_nomenclature || []
    const lignes_theoriques = buildLignesConsommation(
      lignesBom,
      Number(ordre.quantite_a_produire) || 1,
      Number(ordre.nomenclatures?.quantite_produite) || 1,
    )

    return NextResponse.json({
      item: ordre,
      consommations: consosRes.data || [],
      productions: prodsRes.data || [],
      lignes_theoriques,
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    if ((body as any)?.action !== 'annuler') {
      return NextResponse.json({ error: "action doit être 'annuler'" }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const ordre = await loadOrdreAndAssertAccess(supabase, user.id, id)
    if (!peutTransitionner(ordre.statut as StatutOF, 'annule')) {
      return NextResponse.json(
        { error: `OF_STATUT_INVALIDE: annulation impossible depuis '${ordre.statut}'` },
        { status: 409 },
      )
    }

    const { data, error } = await supabase
      .from('ordres_fabrication')
      .update({ statut: 'annule' })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
