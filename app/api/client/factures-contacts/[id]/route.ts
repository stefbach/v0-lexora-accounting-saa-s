/**
 * /api/client/factures-contacts/[id]
 *
 * PATCH  : modifier un contact
 * DELETE : supprimer (hard delete — préférer actif=false si factures historiques)
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
import { validateContactPayload } from '@/lib/contacts/validate'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const SELECT_COLS =
  'id, nom, entreprise, adresse, code_postal, ville, pays, email, telephone, mobile, fax, vat_number, brn, kbis, site_web, devise, conditions_paiement, offshore, actif, created_at, updated_at'

async function loadAndAssert(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase
    .from('factures_contacts')
    .select('id, societe_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Lookup contact: ${error.message}`)
  if (!data) throw new ResourceNotFoundError('Contact introuvable')
  await assertSocieteAccess(supabase, userId, data.societe_id)
  return data
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await loadAndAssert(supabase, user.id, id)

    const v = validateContactPayload(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const { data, error } = await supabase
      .from('factures_contacts')
      .update(v.data)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ item: data })
  } catch (e: any) {
    if (e instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await loadAndAssert(supabase, user.id, id)

    // Vérifie si des factures référencent ce contact → propose archivage si oui
    const { count } = await supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', id)

    if ((count || 0) > 0) {
      return NextResponse.json(
        {
          error: `Contact lié à ${count} facture(s). Archivez-le (actif=false) pour préserver l'historique.`,
          can_archive: true,
        },
        { status: 409 },
      )
    }

    const { error } = await supabase
      .from('factures_contacts')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
