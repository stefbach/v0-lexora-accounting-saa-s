import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

const VALID_ROLES = ['admin', 'super_admin', 'client_admin', 'client_user', 'client_assistant', 'comptable', 'comptable_dedie', 'rh', 'rh_manager', 'juridique', 'employe', 'salarie', 'manager', 'team_leader', 'direction']

export async function GET(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const action = searchParams.get('action')

    if (userId && action === 'societes') {
      const { data } = await supabase.from('user_societes').select('societe_id').eq('user_id', userId)
      return NextResponse.json({ societe_ids: (data || []).map(r => r.societe_id) })
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error

    // Enrich with société names
    const societeIds = [...new Set((data || []).map(u => u.societe_id).filter(Boolean))]
    let societeMap: Record<string, string> = {}
    if (societeIds.length > 0) {
      const { data: societes } = await supabase.from('societes').select('id, nom').in('id', societeIds)
      ;(societes || []).forEach(s => { societeMap[s.id] = s.nom })
    }

    const users = (data || []).map(u => ({
      ...u,
      actif: u.is_active !== false,
      societe_nom: u.societe_id ? societeMap[u.societe_id] || null : null,
    }))

    return NextResponse.json({ users })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { email, password, full_name, role, phone, societe_id, comptable_id, modules_utilisateur } = body

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
      modules_utilisateur: modules_utilisateur || null,
    }, { onConflict: 'id' })

    if (profileError) {
      console.error('[admin/users] Profile upsert error:', profileError.message)
      return NextResponse.json({ error: `Erreur profil: ${profileError.message}` }, { status: 500 })
    }

    // Si société(s) associée(s) → insérer dans user_societes + dossiers
    const societeIds = body.societe_ids && Array.isArray(body.societe_ids) && body.societe_ids.length > 0
      ? body.societe_ids
      : societe_id ? [societe_id] : []

    for (const sid of societeIds) {
      // user_societes link
      await supabase.from('user_societes').upsert({
        user_id: authData.user.id, societe_id: sid, role, actif: true
      }, { onConflict: 'user_id,societe_id' })

      // Pour les clients/assistants → créer un dossier
      if (['client_admin', 'client_user', 'client_assistant'].includes(role)) {
        // Check if dossier already exists
        const { data: existingDossier } = await supabase.from('dossiers')
          .select('id').eq('client_id', authData.user.id).eq('societe_id', sid).maybeSingle()
        if (!existingDossier) {
          await supabase.from('dossiers').insert({
            client_id: authData.user.id,
            societe_id: sid,
            comptable_id: comptable_id || null,
            statut: 'actif',
          })
        }
      }

      // Pour les comptables → assigner à la société
      if (['comptable', 'comptable_dedie'].includes(role)) {
        await supabase.from('societes')
          .update({ comptable_id: authData.user.id })
          .eq('id', sid)
          .is('comptable_id', null) // only if no comptable already assigned
      }
    }

    return NextResponse.json({ user: { id: authData.user.id, email, full_name, role } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { user_id, role, actif, full_name, email, phone, societe_id, societe_ids, modules_utilisateur } = body
    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const updates: Record<string, unknown> = {}
    if (role) updates.role = role
    if (actif !== undefined) updates.is_active = actif
    if (full_name !== undefined) updates.full_name = full_name
    if (email !== undefined) updates.email = email
    if (phone !== undefined) updates.phone = phone
    if (modules_utilisateur !== undefined) updates.modules_utilisateur = modules_utilisateur

    // Set primary societe_id
    if (societe_ids && Array.isArray(societe_ids) && societe_ids.length > 0) {
      updates.societe_id = societe_ids[0]
    } else if (societe_id !== undefined) {
      updates.societe_id = societe_id || null
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', user_id)
    if (error) {
      console.error('[PATCH] profile update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update user_societes for multi-société
    if (societe_ids && Array.isArray(societe_ids) && societe_ids.length > 0) {
      await supabase.from('user_societes').delete().eq('user_id', user_id)
      for (const sid of societe_ids) {
        await supabase.from('user_societes').insert({
          user_id, societe_id: sid, role: role || 'client_user', actif: true,
        })
      }
    } else if (societe_id) {
      await supabase.from('user_societes').upsert({
        user_id, societe_id, role: role || 'client_user', actif: true,
      }, { onConflict: 'user_id,societe_id' })
    }

    if (email) {
      try { await supabase.auth.admin.updateUserById(user_id, { email }) } catch {}
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    console.error('[PATCH]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
