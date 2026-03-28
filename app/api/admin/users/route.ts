import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

const VALID_ROLES = ['admin', 'super_admin', 'client_admin', 'client_user', 'comptable', 'comptable_dedie', 'rh', 'juridique', 'employe']

export async function GET() {
  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*, societes(nom)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ users: data || [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, full_name, role, phone, societe_id, comptable_id } = body

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Email, mot de passe, nom et rôle requis' }, { status: 400 })
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Rôle invalide: ${role}` }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Créer dans Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    if (!authData.user) return NextResponse.json({ error: 'Échec création' }, { status: 500 })

    // Upsert profil
    await supabase.from('profiles').upsert({
      id: authData.user.id,
      email,
      full_name,
      role,
      phone: phone || null,
      societe_id: societe_id || null,
      comptable_id: comptable_id || null,
    })

    // Si société associée → insérer dans user_societes
    if (societe_id) {
      await supabase.from('user_societes').upsert({
        user_id: authData.user.id,
        societe_id,
        role,
        actif: true
      })
    }

    return NextResponse.json({ user: { id: authData.user.id, email, full_name, role } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user_id, role, actif } = await request.json()
    const supabase = getAdminClient()
    const updates: Record<string, unknown> = {}
    if (role) updates.role = role
    if (actif !== undefined) updates.actif = actif
    const { error } = await supabase.from('profiles').update(updates).eq('id', user_id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
