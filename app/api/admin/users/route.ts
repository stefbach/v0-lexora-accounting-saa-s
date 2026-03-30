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
      const { data, error } = await supabase
        .from('user_societes')
        .select('societe_id')
        .eq('user_id', userId)
      if (error) {
        console.error('[GET user societes] error:', error.message)
        // Table might not exist — return empty
        return NextResponse.json({ societe_ids: [] })
      }
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

    const userId = authData.user.id
    const primarySocieteId = societe_id || (societe_ids && societe_ids[0]) || null

    // Upsert profil — base fields only (safe)
    const baseProfile: Record<string, unknown> = {
      id: userId,
      email,
      full_name,
      role,
      phone: phone || null,
      societe_id: primarySocieteId,
      comptable_id: comptable_id || null,
    }

    // Try with modules_utilisateur first, then without
    let profileError = null
    if (modules_utilisateur) {
      const res1 = await supabase.from('profiles').upsert({ ...baseProfile, modules_utilisateur }, { onConflict: 'id' })
      if (res1.error) {
        console.warn('[POST] upsert with modules_utilisateur failed:', res1.error.message)
        const res2 = await supabase.from('profiles').upsert(baseProfile, { onConflict: 'id' })
        profileError = res2.error
      }
    } else {
      const res = await supabase.from('profiles').upsert(baseProfile, { onConflict: 'id' })
      profileError = res.error
    }

    if (profileError) {
      console.error('[POST] Profile upsert error:', profileError.message)
      return NextResponse.json({ error: `Erreur profil: ${profileError.message}` }, { status: 500 })
    }

    // Multi-société assignments in user_societes
    const allSocieteIds = societe_ids && societe_ids.length > 0
      ? societe_ids
      : societe_id ? [societe_id] : []

    for (const sid of allSocieteIds) {
      const { error: usError } = await supabase.from('user_societes').upsert({
        user_id: userId,
        societe_id: sid,
        role,
        actif: true
      }, { onConflict: 'user_id,societe_id' })
      if (usError) console.error('[POST] user_societes error:', usError.message)
    }

    return NextResponse.json({ user: { id: userId, email, full_name, role } })
  } catch (e: unknown) {
    console.error('[POST] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, full_name, email, phone, role, societe_id, societe_ids, actif, modules_utilisateur } = body
    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Build safe update object — only include fields that are provided
    const updates: Record<string, unknown> = {}
    if (full_name !== undefined) updates.full_name = full_name
    if (email !== undefined) updates.email = email
    if (phone !== undefined) updates.phone = phone || null
    if (role !== undefined) updates.role = role
    if (actif !== undefined) updates.actif = actif

    // Handle societe_id — set the primary société on profile
    if (societe_ids && Array.isArray(societe_ids) && societe_ids.length > 0) {
      updates.societe_id = societe_ids[0]
    } else if (societe_id !== undefined) {
      updates.societe_id = societe_id || null
    }

    // Step 1: Update profile (without modules_utilisateur first for safety)
    let profileError = null
    if (modules_utilisateur !== undefined) {
      const res1 = await supabase.from('profiles').update({ ...updates, modules_utilisateur }).eq('id', user_id)
      if (res1.error) {
        console.warn('[PATCH] update with modules failed:', res1.error.message, '→ retrying without')
        const res2 = await supabase.from('profiles').update(updates).eq('id', user_id)
        profileError = res2.error
      }
    } else {
      const res = await supabase.from('profiles').update(updates).eq('id', user_id)
      profileError = res.error
    }

    if (profileError) {
      console.error('[PATCH] Profile update error:', profileError.message)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Step 2: Update user_societes
    if (societe_ids && Array.isArray(societe_ids) && societe_ids.length > 0) {
      // Delete old, insert new
      const delRes = await supabase.from('user_societes').delete().eq('user_id', user_id)
      if (delRes.error) console.warn('[PATCH] delete user_societes:', delRes.error.message)

      for (const sid of societe_ids) {
        const { error: insErr } = await supabase.from('user_societes').insert({
          user_id,
          societe_id: sid,
          role: role || 'client_user',
          actif: true,
        })
        if (insErr) console.error('[PATCH] insert user_societes:', insErr.message)
      }
    } else if (societe_id) {
      await supabase.from('user_societes').upsert({
        user_id,
        societe_id,
        role: role || 'client_user',
        actif: true,
      }, { onConflict: 'user_id,societe_id' })
    }

    // Step 3: Update auth email if changed
    if (email) {
      try { await supabase.auth.admin.updateUserById(user_id, { email }) } catch {}
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    console.error('[PATCH] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
