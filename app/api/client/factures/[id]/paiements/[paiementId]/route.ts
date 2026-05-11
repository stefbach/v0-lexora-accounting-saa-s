/**
 * /api/client/factures/[id]/paiements/[paiementId]
 *
 * DELETE : annule un paiement (supprime la ligne + les écritures BNQ
 *          associées). Le trigger SQL recompute le solde/statut.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'
import { annulerPaiement } from '@/lib/accounting/paiements-factures'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; paiementId: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, paiementId } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: paiement, error } = await supabase
      .from('factures_paiements')
      .select('id, facture_id, societe_id')
      .eq('id', paiementId)
      .eq('facture_id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!paiement) {
      throw new ResourceNotFoundError('Paiement introuvable')
    }

    await assertSocieteAccess(supabase, user.id, paiement.societe_id)

    const res = await annulerPaiement(supabase, paiementId)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })

    const { data: facture } = await supabase
      .from('factures')
      .select('id, statut, solde_non_paye')
      .eq('id', id)
      .maybeSingle()

    return NextResponse.json({ ok: true, facture })
  } catch (e: any) {
    if (e instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
