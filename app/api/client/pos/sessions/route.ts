/**
 * /api/client/pos/sessions
 *
 * GET  : sessions de caisse (filtre statut), la plus récente en premier
 * POST : ouverture d'une session (fond de caisse initial) — une seule
 *        session ouverte par caissier et par société (index unique 484).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateOuverturePayload } from '@/lib/pos/session'

export const dynamic = 'force-dynamic'

/** Dépôt de la caisse : fourni, sinon point de vente actif, sinon défaut, sinon créé. */
async function resolveDepotPos(
  supabase: any,
  societeId: string,
  depotId: string | null,
): Promise<string> {
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
  const { data: pdv } = await supabase
    .from('depots')
    .select('id')
    .eq('societe_id', societeId)
    .eq('actif', true)
    .eq('type', 'point_de_vente')
    .limit(1)
    .maybeSingle()
  if (pdv) return pdv.id
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
    .insert({ societe_id: societeId, nom: 'Point de vente', type: 'point_de_vente', est_defaut: false })
    .select('id')
    .single()
  if (error) throw new Error(`Création dépôt point de vente: ${error.message}`)
  return created.id
}

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

    let query = supabase
      .from('sessions_caisse')
      .select('*, depots(nom, type)')
      .eq('societe_id', societe_id)
      .order('ouverte_at', { ascending: false })
      .limit(100)
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const validated = validateOuverturePayload(body)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const depotId = await resolveDepotPos(supabase, societe_id, validated.data.depot_id)

    const { data: session, error } = await supabase
      .from('sessions_caisse')
      .insert({
        societe_id,
        depot_id: depotId,
        caissier_id: user.id,
        statut: 'ouverte',
        fond_ouverture: validated.data.fond_ouverture,
        notes: validated.data.notes,
      })
      .select('*')
      .single()
    if (error) {
      const status = String(error.code) === '23505' ? 409 : 500
      const msg = status === 409 ? 'Une session de caisse est déjà ouverte pour ce caissier' : error.message
      return NextResponse.json({ error: msg }, { status })
    }
    return NextResponse.json({ session }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    const msg = e?.message || 'Erreur'
    const status = String(msg).includes('DEPOT_INTROUVABLE') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
