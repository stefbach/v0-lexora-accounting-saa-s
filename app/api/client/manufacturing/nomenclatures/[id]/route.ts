/**
 * /api/client/manufacturing/nomenclatures/[id]
 *
 * PATCH : changer le statut d'une BOM ('active' | 'obsolete').
 *         L'activation rend obsolète l'ancienne version active du produit.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    const statut = String((body as any)?.statut || '')
    if (statut !== 'active' && statut !== 'obsolete') {
      return NextResponse.json({ error: "statut doit être 'active' ou 'obsolete'" }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const { data: bom, error: lookupError } = await supabase
      .from('nomenclatures')
      .select('id, societe_id, produit_fini_id, statut')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    if (!bom) throw new ResourceNotFoundError('Nomenclature introuvable')

    await assertSocieteAccess(supabase, user.id, bom.societe_id)

    if (statut === 'active' && bom.statut !== 'active') {
      await supabase
        .from('nomenclatures')
        .update({ statut: 'obsolete' })
        .eq('produit_fini_id', bom.produit_fini_id)
        .eq('statut', 'active')
    }

    const { data, error } = await supabase
      .from('nomenclatures')
      .update({ statut })
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      const msg = String(error.message || '')
      const status = msg.includes('BOM_') ? 409 : 500
      return NextResponse.json({ error: msg }, { status })
    }
    return NextResponse.json({ item: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
