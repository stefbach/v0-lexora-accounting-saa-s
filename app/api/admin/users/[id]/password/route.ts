import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Sprint 12 FEATURE 2 — PATCH /api/admin/users/[id]/password
 *
 * Permet à un admin/super_admin/client_admin/rh/rh_manager de changer le
 * mot de passe d'un utilisateur auth via l'API admin Supabase.
 *
 * Body : { password: string } (min 6 chars)
 *
 * Ne renvoie JAMAIS le mot de passe dans la réponse (sécurité logs).
 */

export const dynamic = 'force-dynamic'

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
  const allowed = ['admin', 'super_admin', 'client_admin', 'rh', 'rh_manager']
  if (!profile || !allowed.includes(profile.role)) return null
  return user
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'user_id manquant' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Mot de passe requis (min 6 caractères)' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Sécurité : vérifier que la cible existe (évite les surprises silencieuses
    // de updateUserById qui peut renvoyer OK même sur un id inconnu selon les
    // versions du SDK).
    const { data: targetProfile } = await supabase
      .from('profiles').select('id, email, role').eq('id', id).maybeSingle()
    if (!targetProfile) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    const { error } = await supabase.auth.admin.updateUserById(id, { password })
    if (error) {
      console.error('[admin/users/[id]/password] updateUserById error:', error.message)
      return NextResponse.json({ error: `Erreur MAJ mot de passe : ${error.message}` }, { status: 500 })
    }

    // Log audit-ish (sans le password)
    console.log(`[admin/users/password] ${adminUser.id} a réinitialisé le mot de passe de ${id} (${targetProfile.email})`)

    return NextResponse.json({ success: true, user_id: id, email: targetProfile.email })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
