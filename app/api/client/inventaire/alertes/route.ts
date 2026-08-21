/**
 * /api/client/inventaire/alertes
 *
 * GET   : liste des alertes de stock (par défaut actives)
 * PATCH : changer le statut d'une alerte (resolue / ignoree / active)
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

const STATUTS_OK = ['active', 'resolue', 'ignoree'] as const

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
      .from('alertes_stock')
      .select('*, produits(sku, designation), depots(nom)')
      .eq('societe_id', societe_id)
      .order('declenchee_at', { ascending: false })
      .limit(200)
    const statut = searchParams.get('statut') || 'active'
    if (statut !== 'toutes') query = query.eq('statut', statut)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const id = String(body.id || '')
    const statut = String(body.statut || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
    if (!STATUTS_OK.includes(statut as (typeof STATUTS_OK)[number])) {
      return NextResponse.json({ error: `statut invalide (${STATUTS_OK.join(', ')})` }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const { data: alerte, error: lookupError } = await supabase
      .from('alertes_stock')
      .select('id, societe_id')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    if (!alerte) return NextResponse.json({ error: 'Alerte introuvable' }, { status: 404 })

    await assertSocieteAccess(supabase, user.id, alerte.societe_id)

    const { data, error } = await supabase
      .from('alertes_stock')
      .update({
        statut,
        resolue_at: statut === 'active' ? null : new Date().toISOString(),
      })
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
