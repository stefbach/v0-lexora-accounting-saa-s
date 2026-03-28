import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ROLES_DISPONIBLES = [
  { value: 'admin', label: 'Administrateur plateforme' },
  { value: 'direction', label: 'Direction / PDG' },
  { value: 'comptable', label: 'Comptable (multi-clients)' },
  { value: 'comptable_dedie', label: 'Comptable dédié (interne)' },
  { value: 'rh_manager', label: 'Responsable RH & Paie' },
  { value: 'juridique', label: 'Juriste' },
  { value: 'client_admin', label: 'Dirigeant client' },
  { value: 'client_user', label: 'Collaborateur client' },
  { value: 'salarie', label: 'Employé (portail salarié)' },
]

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès admin requis' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const q = searchParams.get('q')

    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (role) query = query.eq('role', role)
    if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)

    const { data, error } = await query.limit(100)
    if (error) throw error

    // Stats par rôle
    const stats: Record<string, number> = {}
    for (const u of data || []) {
      stats[u.role] = (stats[u.role] || 0) + 1
    }

    return NextResponse.json({ users: data, total: data?.length, stats, roles: ROLES_DISPONIBLES })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès admin requis' }, { status: 403 })

    const body = await request.json()
    const { user_id, role, full_name, module_acces, societe_ids, permissions } = body

    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (role) updates.role = role
    if (full_name) updates.full_name = full_name
    if (module_acces) updates.module_acces = module_acces
    if (societe_ids) updates.societe_ids = societe_ids
    if (permissions) updates.permissions = permissions

    const { data, error } = await supabase
      .from('profiles').update(updates).eq('id', user_id).select().single()
    if (error) throw error

    return NextResponse.json({ user: data, message: 'Profil mis à jour' })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
