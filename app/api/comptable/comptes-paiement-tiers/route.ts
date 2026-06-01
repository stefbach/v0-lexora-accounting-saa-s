/**
 * CRUD comptes_paiement_tiers — whitelist des comptes tiers autorisés pour
 * les règlements hors banque (associés, sociétés liées, exploitant...).
 *
 * GET    ?societe_id=...&actif=true|false  → liste
 * POST   { societe_id, code_compte, nom_compte, type?, notes? }
 * PATCH  { id, actif?, nom_compte?, notes? }
 * DELETE { id }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabase } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TYPES_VALIDES = ['associe', 'societe_liee', 'exploitant', 'tiers']

export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const actifParam = searchParams.get('actif')

    const supabase = getAdminClient()
    let q = supabase.from('comptes_paiement_tiers')
      .select('id, code_compte, nom_compte, type, actif, notes, created_at, updated_at')
      .eq('societe_id', societe_id)
      .order('nom_compte', { ascending: true })
    if (actifParam === 'true') q = q.eq('actif', true)
    else if (actifParam === 'false') q = q.eq('actif', false)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ comptes: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, code_compte, nom_compte, type, notes } = body

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!code_compte || !/^[0-9]{3,8}$/.test(String(code_compte))) {
      return NextResponse.json({ error: 'code_compte invalide (3 à 8 chiffres)' }, { status: 400 })
    }
    if (!nom_compte || String(nom_compte).trim().length === 0) {
      return NextResponse.json({ error: 'nom_compte requis' }, { status: 400 })
    }
    const typeFinal = TYPES_VALIDES.includes(type) ? type : 'tiers'

    const supabase = getAdminClient()
    const { data, error } = await supabase.from('comptes_paiement_tiers').insert({
      societe_id,
      code_compte: String(code_compte).trim(),
      nom_compte: String(nom_compte).trim(),
      type: typeFinal,
      notes: notes ? String(notes).trim() : null,
    }).select().single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({
          error: `Un compte ${code_compte} "${nom_compte}" existe déjà pour cette société.`,
        }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ compte: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { id, actif, nom_compte, notes, type } = body
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (typeof actif === 'boolean') patch.actif = actif
    if (typeof nom_compte === 'string' && nom_compte.trim().length > 0) patch.nom_compte = nom_compte.trim()
    if (typeof notes === 'string') patch.notes = notes.trim() || null
    if (typeof type === 'string' && TYPES_VALIDES.includes(type)) patch.type = type
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase.from('comptes_paiement_tiers')
      .update(patch).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ compte: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { error } = await supabase.from('comptes_paiement_tiers').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
