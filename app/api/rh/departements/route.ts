// app/api/rh/departements/route.ts
//
// CRUD pour le référentiel des départements RH par société.
// Remplace les anciennes données localStorage `rh_departments`.
// Pattern modelé sur app/api/rh/jours-feries/route.ts.
//
// GET   ?societe_id=<uuid>             → liste des départements actifs
// POST  { action: 'creer'|'modifier'|'supprimer', ... }
//
// Soft-delete via `actif=false` pour préserver les références employés.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED_ROLES = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('departements_rh')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('code')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ departements: data || [] })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'creer') {
      const { societe_id, code, nom, description, manager_id } = body
      if (!societe_id || !code || !nom) {
        return NextResponse.json(
          { error: 'societe_id, code et nom requis' },
          { status: 400 }
        )
      }
      const { data, error } = await supabase
        .from('departements_rh')
        .insert({
          societe_id,
          code: String(code).trim(),
          nom: String(nom).trim(),
          description: description || null,
          manager_id: manager_id || null,
        })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Un département avec ce code existe déjà pour cette société' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, departement: data })
    }

    if (action === 'modifier') {
      const { id, code, nom, description, manager_id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (code !== undefined) updates.code = String(code).trim()
      if (nom !== undefined) updates.nom = String(nom).trim()
      if (description !== undefined) updates.description = description || null
      if (manager_id !== undefined) updates.manager_id = manager_id || null

      const { data, error } = await supabase
        .from('departements_rh')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle()
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Code déjà utilisé pour cette société' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, departement: data })
    }

    if (action === 'supprimer') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      // Soft delete pour préserver les références éventuelles côté employés.
      const { error } = await supabase
        .from('departements_rh')
        .update({ actif: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}
