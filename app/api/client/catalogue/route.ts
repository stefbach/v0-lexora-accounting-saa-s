/**
 * /api/client/catalogue
 *
 * GET    : liste les articles d'un catalogue société (filtre actif facultatif)
 * POST   : crée un nouvel article
 *
 * Tenant isolation : assertSocieteAccess sur societe_id.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateCataloguePayload } from '@/lib/catalogue/validate'

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
      .from('factures_catalogue')
      .select('id, description, prix_unitaire, devise, tva_applicable, categorie, unite, actif, created_at, updated_at')
      .eq('societe_id', societe_id)
      .order('description', { ascending: true })
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

    // Mode bulk : { items: [...] } pour import localStorage → DB
    if (Array.isArray(body.items)) {
      const itemsRaw = body.items as any[]
      if (itemsRaw.length === 0) {
        return NextResponse.json({ inserted: 0 })
      }
      if (itemsRaw.length > 500) {
        return NextResponse.json({ error: 'Maximum 500 items par import' }, { status: 400 })
      }
      const toInsert: any[] = []
      const errors: string[] = []
      itemsRaw.forEach((it, i) => {
        const v = validateCataloguePayload(it)
        if (!v.ok) {
          errors.push(`Ligne ${i + 1}: ${v.error}`)
          return
        }
        toInsert.push({ ...v.data, societe_id })
      })
      if (errors.length > 0 && toInsert.length === 0) {
        return NextResponse.json({ error: errors.join(' · ') }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('factures_catalogue')
        .insert(toInsert)
        .select('id, description')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({
        inserted: data?.length || 0,
        skipped: errors.length,
        errors,
      })
    }

    const v = validateCataloguePayload(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const { data, error } = await supabase
      .from('factures_catalogue')
      .insert({ ...v.data, societe_id })
      .select('id, description, prix_unitaire, devise, tva_applicable, categorie, unite, actif, created_at, updated_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ item: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
