import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

const VALID_ROLES = ['admin', 'super_admin', 'client_admin', 'client_user', 'client_assistant', 'comptable', 'comptable_dedie', 'rh', 'rh_manager', 'juridique', 'employe', 'manager', 'direction', 'salarie']

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const action = searchParams.get('action')

    // Fetch societe_ids for a specific user
    if (userId && action === 'societes') {
      const { data } = await supabase
        .from('user_societes')
        .select('societe_id')
        .eq('user_id', userId)
        .eq('actif', true)
      return NextResponse.json({ societe_ids: (data || []).map(r => r.societe_id) })
    }

    // Default: list all users
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
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
    const { email, password, full_name, role, phone, societe_id, societe_ids, comptable_id, modules_utilisateur } = body

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
    const primarySocieteId = societe_id || (societe_ids && societe_ids[0]) || null
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      email,
      full_name,
      role,
      phone: phone || null,
      societe_id: primarySocieteId,
      comptable_id: comptable_id || null,
    }
    if (modules_utilisateur) profileData.modules_utilisateur = modules_utilisateur

    let { error: profileError } = await supabase.from('profiles').upsert(profileData, { onConflict: 'id' })
    // If modules_utilisateur column doesn't exist yet, retry without it
    if (profileError && modules_utilisateur) {
      const { modules_utilisateur: _, ...safeData } = profileData
      const retry = await supabase.from('profiles').upsert(safeData, { onConflict: 'id' })
      profileError = retry.error
    }

    if (profileError) {
      console.error('[admin/users] Profile upsert error:', profileError.message)
      return NextResponse.json({ error: `Erreur profil: ${profileError.message}` }, { status: 500 })
    }

    // Multi-société assignments
    const allSocieteIds = societe_ids && societe_ids.length > 0
      ? societe_ids
      : societe_id ? [societe_id] : []

    for (const sid of allSocieteIds) {
      const { error: usError } = await supabase.from('user_societes').upsert({
        user_id: authData.user.id,
        societe_id: sid,
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
    const body = await request.json()
    const { user_id, full_name, email, phone, role, societe_id, societe_ids, actif, modules_utilisateur } = body
    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const updates: Record<string, unknown> = {}
    if (full_name !== undefined) updates.full_name = full_name
    if (email !== undefined) updates.email = email
    if (phone !== undefined) updates.phone = phone || null
    if (role !== undefined) updates.role = role
    if (societe_id !== undefined) updates.societe_id = societe_id || null
    if (actif !== undefined) updates.actif = actif
    if (modules_utilisateur !== undefined) updates.modules_utilisateur = modules_utilisateur

    // Try update with all fields; if modules_utilisateur column doesn't exist, retry without it
    let { error } = await supabase.from('profiles').update(updates).eq('id', user_id)
    if (error && modules_utilisateur !== undefined) {
      const { modules_utilisateur: _, ...safeUpdates } = updates
      const retry = await supabase.from('profiles').update(safeUpdates).eq('id', user_id)
      error = retry.error
    }
    if (error) throw error

    // Update user_societes if societe_ids provided (multi-société)
    if (societe_ids && Array.isArray(societe_ids) && societe_ids.length > 0) {
      // Remove old assignments
      await supabase.from('user_societes').delete().eq('user_id', user_id)
      // Insert new ones
      for (const sid of societe_ids) {
        await supabase.from('user_societes').upsert({
          user_id,
          societe_id: sid,
          role: role || body.role,
          actif: true,
        }, { onConflict: 'user_id,societe_id' })
      }
    } else if (societe_id) {
      // Single société assignment
      await supabase.from('user_societes').upsert({
        user_id,
        societe_id,
        role: role || body.role,
        actif: true,
      }, { onConflict: 'user_id,societe_id' })
    }

    // Update email in auth if changed (ignore errors if email unchanged)
    if (email) {
      try { await supabase.auth.admin.updateUserById(user_id, { email }) } catch {}
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    console.error('[admin/users PATCH]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
