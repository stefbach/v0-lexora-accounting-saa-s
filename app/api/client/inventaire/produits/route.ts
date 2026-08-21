/**
 * /api/client/inventaire/produits
 *
 * GET  : liste les produits d'une société (avec niveaux de stock agrégés)
 * POST : crée un produit
 *
 * Tenant isolation : assertSocieteAccess sur societe_id.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateProduitPayload } from '@/lib/inventaire/produits'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const includeInactifs = searchParams.get('include_inactifs') === '1'
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    let query = supabase
      .from('produits')
      .select('*, stock_niveaux(depot_id, quantite, valeur_stock)')
      .eq('societe_id', societe_id)
      .order('designation', { ascending: true })
    if (!includeInactifs) query = query.eq('actif', true)

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
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const societe_id = String(body.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const validated = validateProduitPayload(body)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('produits')
      .insert({ ...validated.data, societe_id })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `SKU déjà utilisé (${validated.data.sku})` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
