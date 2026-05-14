import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['admin', 'super_admin', 'client_admin', 'client_user', 'client_assistant', 'comptable', 'comptable_dedie', 'rh', 'juridique', 'employe', 'manager', 'team_leader', 'direction']

/**
 * Détecte si la migration 261 (rôle team_leader) n'a pas été appliquée
 * et tente de la rejouer via la fonction RPC `exec_sql` (admin-only).
 * Retourne true si le constraint a été mis à jour, false sinon.
 *
 * Filet de sécurité : évite que la création d'un team_leader échoue
 * silencieusement quand la migration n'a pas été lancée en prod.
 */
async function tryAutoFixRoleConstraint(supabase: ReturnType<typeof getAdminClient>): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
          CHECK (role IN (
            'admin','super_admin','client_admin','client_user','client_assistant',
            'comptable','comptable_dedie','rh','rh_manager','juridique',
            'employe','manager','team_leader','direction','salarie'
          ));
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='user_societes' AND column_name='role'
          ) THEN
            ALTER TABLE public.user_societes DROP CONSTRAINT IF EXISTS user_societes_role_check;
            ALTER TABLE public.user_societes ADD CONSTRAINT user_societes_role_check
              CHECK (role IN (
                'admin','super_admin','client_admin','client_user','client_assistant',
                'comptable','comptable_dedie','rh','rh_manager','juridique',
                'employe','manager','team_leader','direction','salarie'
              ));
          END IF;
        END $$;
      `,
    })
    if (error) {
      console.warn('[tryAutoFixRoleConstraint] exec_sql RPC failed:', error.message)
      return false
    }
    console.log('[tryAutoFixRoleConstraint] role constraint updated (team_leader incl.)')
    return true
  } catch (e: any) {
    console.warn('[tryAutoFixRoleConstraint] exception:', e?.message || e)
    return false
  }
}

async function getAuthUser() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error } = await supabaseAuth.auth.getUser()
  if (!user || error) return null
  const admin = getAdminClient()
  const { data: profile } = await admin.from('profiles').select('role, societe_id').eq('id', user.id).single()
  return { ...user, role: profile?.role || 'client_user', societe_id: profile?.societe_id }
}

async function getUserSocieteIds(userId: string): Promise<string[]> {
  const admin = getAdminClient()
  const ids = new Set<string>()

  // From profiles.societe_id
  const { data: profile } = await admin.from('profiles').select('societe_id').eq('id', userId).single()
  if (profile?.societe_id) ids.add(profile.societe_id)

  // From user_societes
  const { data: links } = await admin.from('user_societes').select('societe_id').eq('user_id', userId)
  for (const l of links || []) if (l.societe_id) ids.add(l.societe_id)

  // From dossiers
  const { data: dossiers } = await admin.from('dossiers').select('societe_id').eq('client_id', userId)
  for (const d of dossiers || []) if (d.societe_id) ids.add(d.societe_id)

  // From owned societes
  const { data: owned } = await admin.from('societes').select('id').eq('created_by', userId)
  for (const s of owned || []) ids.add(s.id)

  return [...ids]
}

// GET — List users visible to the caller
// admin/super_admin → all users (same as /api/admin/users)
// client_admin → users linked to caller's sociétés only
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const action = searchParams.get('action')
    const requestedSocieteId = searchParams.get('societe_id')

    // Sub-action: get societe_ids for a specific user
    if (userId && action === 'societes') {
      const { data } = await supabase.from('user_societes').select('societe_id').eq('user_id', userId)
      return NextResponse.json({ societe_ids: (data || []).map((r: any) => r.societe_id) })
    }

    const isGlobalAdmin = ['admin', 'super_admin'].includes(authUser.role)

    // Si un societe_id explicite est fourni, on scope aux users de CETTE société
    // (filet mono-société pour /client/utilisateurs). On vérifie l'accès du caller.
    if (requestedSocieteId) {
      if (!isGlobalAdmin) {
        await assertSocieteAccess(supabase, authUser.id, requestedSocieteId)
      }

      const linkedIds = new Set<string>()
      // Users liés via user_societes
      const { data: us } = await supabase
        .from('user_societes').select('user_id').eq('societe_id', requestedSocieteId)
      for (const l of us || []) if (l.user_id) linkedIds.add(l.user_id as string)
      // Users dont profiles.societe_id matche
      const { data: pu } = await supabase
        .from('profiles').select('id').eq('societe_id', requestedSocieteId)
      for (const p of pu || []) linkedIds.add(p.id)
      // Users qui ont créé cette société
      const { data: owners } = await supabase
        .from('societes').select('created_by').eq('id', requestedSocieteId).maybeSingle()
      if (owners?.created_by) linkedIds.add(owners.created_by as string)
      // Toujours inclure soi-même si on a accès à cette société
      linkedIds.add(authUser.id)

      if (linkedIds.size === 0) {
        return NextResponse.json({ users: [] })
      }
      const scopedIds = [...linkedIds]
      const { data, error } = await supabase
        .from('profiles').select('*').in('id', scopedIds).order('created_at', { ascending: false })
      if (error) throw error

      const societeIds = [...new Set((data || []).map((u: any) => u.societe_id).filter(Boolean))]
      const societeMap: Record<string, string> = {}
      if (societeIds.length > 0) {
        const { data: societes } = await supabase.from('societes').select('id, nom').in('id', societeIds)
        ;(societes || []).forEach((s: any) => { societeMap[s.id] = s.nom })
      }
      const users = (data || []).map((u: any) => ({
        ...u,
        actif: u.is_active !== false,
        societe_nom: u.societe_id ? societeMap[u.societe_id] || null : null,
      }))
      return NextResponse.json({ users })
    }

    let userIds: string[] | null = null // null = all users

    if (!isGlobalAdmin) {
      // Get caller's societes
      const mySocieteIds = await getUserSocieteIds(authUser.id)
      if (mySocieteIds.length === 0) {
        return NextResponse.json({ users: [] })
      }

      // Find all user_ids linked to those societes
      const { data: links } = await supabase
        .from('user_societes')
        .select('user_id')
        .in('societe_id', mySocieteIds)
      const linkedIds = new Set((links || []).map((l: any) => l.user_id as string))

      // Also include users whose profiles.societe_id is in our societes
      const { data: profileUsers } = await supabase
        .from('profiles')
        .select('id')
        .in('societe_id', mySocieteIds)
      for (const p of profileUsers || []) linkedIds.add(p.id)

      // Always include self
      linkedIds.add(authUser.id)

      userIds = [...linkedIds]
      if (userIds.length === 0) {
        return NextResponse.json({ users: [] })
      }
    }

    // Fetch profiles
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (userIds) {
      query = query.in('id', userIds)
    }
    const { data, error } = await query
    if (error) throw error

    // Enrich with société names — same shape as /api/admin/users
    const societeIds = [...new Set((data || []).map((u: any) => u.societe_id).filter(Boolean))]
    let societeMap: Record<string, string> = {}
    if (societeIds.length > 0) {
      const { data: societes } = await supabase.from('societes').select('id, nom').in('id', societeIds)
      ;(societes || []).forEach((s: any) => { societeMap[s.id] = s.nom })
    }

    const users = (data || []).map((u: any) => ({
      ...u,
      actif: u.is_active !== false,
      societe_nom: u.societe_id ? societeMap[u.societe_id] || null : null,
    }))

    return NextResponse.json({ users })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Create a new user (linked to caller's société)
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { email, password, full_name, role, phone, societe_id, comptable_id, modules_utilisateur } = body

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Email, mot de passe, nom et rôle requis' }, { status: 400 })
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Rôle invalide: ${role}` }, { status: 400 })
    }

    const isGlobalAdmin = ['admin', 'super_admin'].includes(authUser.role)

    // Non-admin users can only create users for their own societes
    if (!isGlobalAdmin) {
      const mySocieteIds = await getUserSocieteIds(authUser.id)
      const targetSocieteIds = body.societe_ids && Array.isArray(body.societe_ids) && body.societe_ids.length > 0
        ? body.societe_ids
        : societe_id ? [societe_id] : []

      for (const sid of targetSocieteIds) {
        if (!mySocieteIds.includes(sid)) {
          return NextResponse.json({ error: 'Vous ne pouvez créer des utilisateurs que pour vos sociétés' }, { status: 403 })
        }
      }

      // Non-admin cannot create admin/super_admin users
      if (['admin', 'super_admin'].includes(role)) {
        return NextResponse.json({ error: 'Seuls les admins peuvent créer des comptes admin' }, { status: 403 })
      }
    }

    const supabase = getAdminClient()

    // Create in Supabase Auth (requires service role)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    if (!authData.user) return NextResponse.json({ error: 'Échec création' }, { status: 500 })

    // Upsert profile
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
      console.error('[client/users] Profile upsert error:', profileError.message)
      // Détection check_constraint sur le rôle — migration 261 (team_leader)
      // probablement pas appliquée. Tentative d'auto-fix via exec_sql.
      if (/profiles_role_check|user_societes_role_check|violates check constraint/i.test(profileError.message)) {
        const fixed = await tryAutoFixRoleConstraint(supabase)
        if (fixed) {
          const { error: retryError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            email, full_name, role,
            phone: phone || null,
            societe_id: societe_id || null,
            comptable_id: comptable_id || null,
            modules_utilisateur: modules_utilisateur || null,
          }, { onConflict: 'id' })
          if (retryError) {
            return NextResponse.json({
              error: `Auto-fix tenté mais l'insert a encore échoué : ${retryError.message}`,
            }, { status: 500 })
          }
          console.log('[client/users] Auto-fix role constraint OK, profile créé après retry')
        } else {
          return NextResponse.json({
            error: `Le rôle "${role}" n'est pas autorisé par la base. Lance manuellement la migration supabase/migrations/261_team_leader_role.sql dans Supabase Studio (ou POST /api/admin/fix-db en admin).`,
          }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: `Erreur profil: ${profileError.message}` }, { status: 500 })
      }
    }

    // Link to sociétés + create dossiers
    const societeIds = body.societe_ids && Array.isArray(body.societe_ids) && body.societe_ids.length > 0
      ? body.societe_ids
      : societe_id ? [societe_id] : []

    for (const sid of societeIds) {
      await supabase.from('user_societes').upsert({
        user_id: authData.user.id, societe_id: sid, role, actif: true
      }, { onConflict: 'user_id,societe_id' })

      if (['client_admin', 'client_user', 'client_assistant'].includes(role)) {
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

      if (['comptable', 'comptable_dedie'].includes(role)) {
        await supabase.from('societes')
          .update({ comptable_id: authData.user.id })
          .eq('id', sid)
          .is('comptable_id', null)
      }
    }

    return NextResponse.json({ user: { id: authData.user.id, email, full_name, role } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// PATCH — Update a user
export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { user_id, role, actif, full_name, email, phone, societe_id, societe_ids, modules_utilisateur } = body
    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

    const isGlobalAdmin = ['admin', 'super_admin'].includes(authUser.role)

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Rôle invalide: ${role}` }, { status: 400 })
    }

    // Non-admin: verify target user is in caller's societes
    if (!isGlobalAdmin) {
      const mySocieteIds = await getUserSocieteIds(authUser.id)
      const { data: targetLinks } = await getAdminClient().from('user_societes').select('societe_id').eq('user_id', user_id)
      const targetSocietes = (targetLinks || []).map((l: any) => l.societe_id)
      const hasAccess = targetSocietes.some((sid: string) => mySocieteIds.includes(sid)) || user_id === authUser.id
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès non autorisé à cet utilisateur' }, { status: 403 })
      }

      if (role && ['admin', 'super_admin'].includes(role)) {
        return NextResponse.json({ error: 'Seuls les admins peuvent attribuer le rôle admin' }, { status: 403 })
      }
    }

    const supabase = getAdminClient()
    const updates: Record<string, unknown> = {}
    if (role) updates.role = role
    if (actif !== undefined) updates.is_active = actif
    if (full_name !== undefined) updates.full_name = full_name
    if (email !== undefined) updates.email = email
    if (phone !== undefined) updates.phone = phone
    if (modules_utilisateur !== undefined) updates.modules_utilisateur = modules_utilisateur

    if (societe_ids && Array.isArray(societe_ids) && societe_ids.length > 0) {
      updates.societe_id = societe_ids[0]
    } else if (societe_id !== undefined) {
      updates.societe_id = societe_id || null
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', user_id)
    if (error) {
      console.error('[PATCH] profile update error:', error.message)
      if (/profiles_role_check|user_societes_role_check|violates check constraint/i.test(error.message)) {
        return NextResponse.json({
          error: `Le rôle "${role}" n'est pas autorisé par la base de données. Si vous venez d'ajouter "team_leader", lancez la migration supabase/migrations/261_team_leader_role.sql dans Supabase Studio.`,
        }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

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
