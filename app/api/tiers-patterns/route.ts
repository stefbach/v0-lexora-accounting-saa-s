import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ---------------------------------------------------------------------------
// GET /api/tiers-patterns — Lire les patterns pour une société
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')
    const search = searchParams.get('search')

    let query = supabase
      .from('tiers_patterns')
      .select('id, societe_id, pattern, tiers_identifie, compte_comptable, nb_utilisations, created_at')
      .order('nb_utilisations', { ascending: false })

    if (societeId) {
      query = query.eq('societe_id', societeId)
    }

    if (search) {
      query = query.ilike('pattern', `%${search}%`)
    }

    const { data: patterns, error } = await query.limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ patterns: patterns || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/tiers-patterns — Créer ou mettre à jour un pattern
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, pattern, tiers_identifie, compte_comptable } = body

    if (!pattern) {
      return NextResponse.json({ error: 'Le champ pattern est obligatoire' }, { status: 400 })
    }

    // Upsert: if pattern already exists for this société, increment usage count
    const { data: existing } = await supabase
      .from('tiers_patterns')
      .select('id, nb_utilisations, tiers_identifie, compte_comptable')
      .eq('pattern', pattern)
      .eq('societe_id', societe_id || null)
      .maybeSingle()

    if (existing) {
      // Update existing pattern
      const { data: updated, error: updateError } = await supabase
        .from('tiers_patterns')
        .update({
          tiers_identifie: tiers_identifie || existing.tiers_identifie,
          compte_comptable: compte_comptable || existing.compte_comptable,
          nb_utilisations: (existing.nb_utilisations || 1) + 1,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      return NextResponse.json({ pattern: updated, created: false })
    }

    // Create new pattern
    const { data: created, error: insertError } = await supabase
      .from('tiers_patterns')
      .insert({
        societe_id: societe_id || null,
        pattern,
        tiers_identifie: tiers_identifie || null,
        compte_comptable: compte_comptable || null,
        nb_utilisations: 1,
        cree_par: user.id,
      })
      .select()
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    return NextResponse.json({ pattern: created, created: true }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/tiers-patterns — Supprimer un pattern
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 })

    // Only admins/comptables can delete
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'comptable', 'comptable_dedie'].includes(profile?.role || '')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const { error } = await supabase.from('tiers_patterns').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
