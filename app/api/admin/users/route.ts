import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

const VALID_ROLES = ['admin', 'super_admin', 'client_admin', 'client_user', 'comptable', 'comptable_dedie', 'rh', 'juridique', 'employe', 'manager', 'direction']

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

    // Upsert profil — le trigger handle_new_user peut déjà l'avoir créé
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: authData.user.id,
      email,
      full_name,
      role,
      phone: phone || null,
      societe_id: societe_id || null,
      comptable_id: comptable_id || null,
    }, { onConflict: 'id' })

    if (profileError) {
      console.error('[admin/users] Profile upsert error:', profileError.message)
      return NextResponse.json({ error: `Erreur profil: ${profileError.message}` }, { status: 500 })
    }

    // Si société associée → insérer dans user_societes
    if (societe_id) {
      const { error: usError } = await supabase.from('user_societes').upsert({
        user_id: authData.user.id,
        societe_id,
        role,
        actif: true
      }, { onConflict: 'user_id,societe_id' })

      if (usError) {
        console.error('[admin/users] user_societes upsert error:', usError.message)
      }
    }

    return NextResponse.json({ user: { id: authData.user.id, email, full_name, role } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user_id, role, actif, full_name, email, phone, societe_id } = await request.json()
    const supabase = getAdminClient()
    const updates: Record<string, unknown> = {}
    if (role) updates.role = role
    if (actif !== undefined) updates.actif = actif
    if (full_name !== undefined) updates.full_name = full_name
    if (email !== undefined) updates.email = email
    if (phone !== undefined) updates.phone = phone
    if (societe_id !== undefined) updates.societe_id = societe_id || null
    const { error } = await supabase.from('profiles').update(updates).eq('id', user_id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
