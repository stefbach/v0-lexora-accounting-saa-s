// app/api/rh/bureaux/route.ts
//
// CRUD pour le référentiel des bureaux / sites RH par société.
// Remplace les anciennes données localStorage `rh_offices`.
//
// GET   ?societe_id=<uuid>             → liste des bureaux actifs
// POST  { action: 'creer'|'modifier'|'supprimer', ... }

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
      .from('bureaux_rh')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('code')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ bureaux: data || [] })
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
      const {
        societe_id, code, nom, adresse,
        latitude, longitude, rayon_pointage_m,
      } = body
      if (!societe_id || !code || !nom) {
        return NextResponse.json(
          { error: 'societe_id, code et nom requis' },
          { status: 400 }
        )
      }
      const insertRow: Record<string, unknown> = {
        societe_id,
        code: String(code).trim(),
        nom: String(nom).trim(),
        adresse: adresse || null,
      }
      if (latitude !== undefined && latitude !== null && latitude !== '') {
        insertRow.latitude = Number(latitude)
      }
      if (longitude !== undefined && longitude !== null && longitude !== '') {
        insertRow.longitude = Number(longitude)
      }
      if (rayon_pointage_m !== undefined && rayon_pointage_m !== null && rayon_pointage_m !== '') {
        insertRow.rayon_pointage_m = Number(rayon_pointage_m)
      }

      const { data, error } = await supabase
        .from('bureaux_rh')
        .insert(insertRow)
        .select()
        .single()
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Un bureau avec ce code existe déjà pour cette société' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, bureau: data })
    }

    if (action === 'modifier') {
      const {
        id, code, nom, adresse,
        latitude, longitude, rayon_pointage_m,
      } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (code !== undefined) updates.code = String(code).trim()
      if (nom !== undefined) updates.nom = String(nom).trim()
      if (adresse !== undefined) updates.adresse = adresse || null
      if (latitude !== undefined) updates.latitude = latitude === '' || latitude === null ? null : Number(latitude)
      if (longitude !== undefined) updates.longitude = longitude === '' || longitude === null ? null : Number(longitude)
      if (rayon_pointage_m !== undefined) updates.rayon_pointage_m = rayon_pointage_m === '' || rayon_pointage_m === null ? null : Number(rayon_pointage_m)

      const { data, error } = await supabase
        .from('bureaux_rh')
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
      return NextResponse.json({ success: true, bureau: data })
    }

    if (action === 'supprimer') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const { error } = await supabase
        .from('bureaux_rh')
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
