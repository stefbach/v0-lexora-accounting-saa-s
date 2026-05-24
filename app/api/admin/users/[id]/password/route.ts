import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAccessibleSocieteIds } from '@/lib/supabase/assert-societe-access'

/**
 * Sprint 12 FEATURE 2 — PATCH /api/admin/users/[id]/password
 *
 * Permet à un admin/super_admin/client_admin/rh/rh_manager/direction de
 * changer le mot de passe d'un utilisateur auth via l'API admin Supabase.
 *
 * Body : { password: string } (min 8 chars)
 *
 * SEC-001 (CRITIQUE 10/10) — Hotfix :
 *   - hiérarchie ROLE_LEVEL : un caller ne peut JAMAIS reset un compte
 *     avec un rôle ≥ le sien
 *   - société match obligatoire pour les rôles non-Lexora (client_admin,
 *     rh, rh_manager, direction)
 *   - super_admin ne peut pas reset un autre super_admin (4-eyes)
 *   - admin ne peut pas reset admin/super_admin
 *   - interdiction du self-reset via cette route (passer par la page profil)
 *   - audit log WORM dans `password_reset_audit`
 *
 * Ne renvoie JAMAIS le mot de passe dans la réponse (sécurité logs).
 */

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Hierarchie de privilèges. Un caller ne peut JAMAIS reset le mdp d'un
 * compte avec un rôle ≥ le sien.
 */
const ROLE_LEVEL: Record<string, number> = {
  employe: 10, salarie: 10,
  manager: 30, team_leader: 30,
  client_user: 30, client_assistant: 30,
  rh: 50, rh_manager: 50,
  comptable: 50, comptable_dedie: 50, juridique: 50,
  direction: 70, client_admin: 70,
  admin: 90,
  super_admin: 100,
}

async function requireCaller() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabaseAuth
    .from('profiles').select('role').eq('id', user.id).single()
  // Liste des rôles qui peuvent invoquer cette route. La vérif fine
  // (rôle cible, société cible) est faite plus bas.
  const allowed = ['admin', 'super_admin', 'client_admin', 'rh', 'rh_manager', 'direction']
  if (!profile || !allowed.includes(profile.role)) return null
  return { user, role: profile.role as string }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireCaller()
    if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'user_id manquant' }, { status: 400 })

    // Empêche les self-resets via cette route (l'user a un endpoint dédié
    // de changement de mot de passe et doit fournir l'ancien)
    if (id === caller.user.id) {
      return NextResponse.json({
        error: 'Utilisez la page profil pour changer votre propre mot de passe',
      }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe requis (min 8 caractères)' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Récupère la cible : rôle, société, email
    const { data: targetProfile } = await supabase
      .from('profiles').select('id, email, role, societe_id').eq('id', id).maybeSingle()
    if (!targetProfile) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    const callerLevel = ROLE_LEVEL[caller.role] ?? 0
    const targetLevel = ROLE_LEVEL[targetProfile.role] ?? 100

    // Règle 1 : un super_admin peut tout reset SAUF un autre super_admin
    //           (peer-to-peer interdit, doit passer par un autre super_admin
    //            via 4-eyes ou par recovery email)
    // Règle 2 : un admin Lexora peut reset n'importe qui SAUF admin/super_admin
    // Règle 3 : tout autre caller (client_admin, rh, rh_manager, direction)
    //           ne peut reset QUE des comptes dans SA société et de rôle
    //           strictement inférieur.
    if (caller.role === 'super_admin') {
      if (targetProfile.role === 'super_admin' && targetProfile.id !== caller.user.id) {
        return NextResponse.json({
          error: 'Reset d\'un autre super_admin interdit (procédure 4-eyes requise)',
        }, { status: 403 })
      }
    } else if (caller.role === 'admin') {
      if (['admin', 'super_admin'].includes(targetProfile.role)) {
        return NextResponse.json({
          error: 'Seul un super_admin peut reset le mdp d\'un admin',
        }, { status: 403 })
      }
    } else {
      // client_admin / rh / rh_manager / direction
      // Doit être strictement supérieur au target, et target doit appartenir
      // à une société accessible au caller.
      if (targetLevel >= callerLevel) {
        return NextResponse.json({
          error: 'Privilège insuffisant pour reset ce compte (rôle cible ≥ rôle caller)',
        }, { status: 403 })
      }
      const targetForbidden = ['admin', 'super_admin', 'client_admin', 'direction']
      if (targetForbidden.includes(targetProfile.role)) {
        return NextResponse.json({
          error: `Reset d'un compte ${targetProfile.role} interdit pour un ${caller.role}`,
        }, { status: 403 })
      }
      // Société match : la cible doit être dans une société accessible au caller
      const accessibleSocietes = await getAccessibleSocieteIds(supabase, caller.user.id)
      if (!targetProfile.societe_id || !accessibleSocietes.includes(targetProfile.societe_id)) {
        return NextResponse.json({
          error: 'Cet utilisateur n\'appartient pas à une de vos sociétés',
        }, { status: 403 })
      }
    }

    const { error } = await supabase.auth.admin.updateUserById(id, { password })
    if (error) {
      console.error('[admin/users/[id]/password] updateUserById error:', error.message)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour du mot de passe' }, { status: 500 })
    }

    // Audit log structuré (SEC-001 remédiation)
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null
    const ua = request.headers.get('user-agent') || null
    await supabase.from('password_reset_audit').insert({
      actor_id: caller.user.id,
      actor_role: caller.role,
      target_id: id,
      target_role: targetProfile.role,
      target_email: targetProfile.email,
      target_societe_id: targetProfile.societe_id,
      ip,
      user_agent: ua,
      created_at: new Date().toISOString(),
    }).then(() => {}, (e) => console.error('[password_reset_audit insert]', e?.message))

    return NextResponse.json({ success: true, user_id: id, email: targetProfile.email })
  } catch (e: unknown) {
    console.error('[admin/users/[id]/password]', e)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
