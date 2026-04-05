import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — list announcements (for employee portal or RH management)
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const all = searchParams.get('all') // include expired/unpublished (for RH management)

    // Get accessible sociétés
    let societeIds: string[]
    if (societe_id) {
      societeIds = [societe_id]
    } else {
      societeIds = await getUserSocieteIds(user.id)
      // Fallback: find employee's société
      if (societeIds.length === 0) {
        const { data: selfEmp } = await supabase.from('employes').select('societe_id')
          .or(`auth_user_id.eq.${user.id},email.eq.${user.email || 'NONE'}`)
          .is('date_depart', null).maybeSingle()
        if (selfEmp?.societe_id) societeIds = [selfEmp.societe_id]
      }
    }

    if (societeIds.length === 0) return NextResponse.json({ annonces: [] })

    let query = supabase
      .from('annonces')
      .select('*')
      .in('societe_id', societeIds)
      .order('priorite', { ascending: false })
      .order('created_at', { ascending: false })

    if (!all) {
      // Employee view: only published + active (not expired)
      query = query.eq('publie', true)
        .lte('date_debut', new Date().toISOString().split('T')[0])
      // Can't easily filter date_fin IS NULL OR date_fin >= today in one query
    }

    const { data, error } = await query
    if (error) throw error

    // Filter expired annonces client-side
    const today = new Date().toISOString().split('T')[0]
    const filtered = all ? data : (data || []).filter((a: any) => !a.date_fin || a.date_fin >= today)

    return NextResponse.json({ annonces: filtered || [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — create, update, or delete announcement (RH/admin only)
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // Check role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!profile || !['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'direction'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès réservé RH/Direction' }, { status: 403 })
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })
      await supabase.from('annonces').delete().eq('id', id)
      return NextResponse.json({ success: true })
    }

    if (action === 'toggle') {
      const { id, publie } = body
      if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })
      const { data, error } = await supabase.from('annonces').update({ publie }).eq('id', id).select().single()
      if (error) throw error
      return NextResponse.json({ annonce: data })
    }

    // Create or update
    const { id, societe_id, titre, contenu, type, priorite, date_debut, date_fin } = body
    if (!societe_id || !titre || !contenu) {
      return NextResponse.json({ error: 'societe_id, titre et contenu requis' }, { status: 400 })
    }

    const record = {
      societe_id,
      titre,
      contenu,
      type: type || 'info',
      priorite: priorite || 0,
      date_debut: date_debut || new Date().toISOString().split('T')[0],
      date_fin: date_fin || null,
      publie: true,
      cree_par: user.id,
      updated_at: new Date().toISOString(),
    }

    if (id) {
      const { data, error } = await supabase.from('annonces').update(record).eq('id', id).select().single()
      if (error) throw error
      return NextResponse.json({ annonce: data })
    } else {
      const { data, error } = await supabase.from('annonces').insert(record).select().single()
      if (error) throw error
      return NextResponse.json({ annonce: data }, { status: 201 })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
