/**
 * /api/client/catalogue/[id]
 *
 * PATCH  : modifier un article
 * DELETE : supprimer (hard delete — l'archivage logique passe par actif=false)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const DEVISES_OK = ['MUR', 'EUR', 'USD', 'GBP'] as const

async function loadItemAndAssertAccess(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase
    .from('factures_catalogue')
    .select('id, societe_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Lookup catalogue: ${error.message}`)
  if (!data) throw new ResourceNotFoundError('Article introuvable')
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
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await loadItemAndAssertAccess(supabase, user.id, id)

    const patch: Record<string, any> = {}
    if (typeof body.description === 'string') {
      const d = body.description.trim()
      if (!d) return NextResponse.json({ error: 'description vide' }, { status: 400 })
      if (d.length > 500) return NextResponse.json({ error: 'description trop longue' }, { status: 400 })
      patch.description = d
    }
    if (body.prix_unitaire !== undefined) {
      const n = Number(body.prix_unitaire)
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'prix_unitaire invalide' }, { status: 400 })
      patch.prix_unitaire = n
    }
    if (typeof body.devise === 'string') {
      const d = body.devise.toUpperCase()
      if (!DEVISES_OK.includes(d as any)) return NextResponse.json({ error: 'devise invalide' }, { status: 400 })
      patch.devise = d
    }
    if (typeof body.tva_applicable === 'boolean') patch.tva_applicable = body.tva_applicable
    if (body.categorie !== undefined) {
      patch.categorie = body.categorie ? String(body.categorie).trim().slice(0, 100) : null
    }
    if (typeof body.unite === 'string') patch.unite = body.unite.trim().slice(0, 50)
    if (typeof body.actif === 'boolean') patch.actif = body.actif

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('factures_catalogue')
      .update(patch)
      .eq('id', id)
      .select('id, description, prix_unitaire, devise, tva_applicable, categorie, unite, actif, created_at, updated_at')
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
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await loadItemAndAssertAccess(supabase, user.id, id)

    const { error } = await supabase
      .from('factures_catalogue')
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
