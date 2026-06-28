import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import { sendCredentialsEmail } from '@/lib/email/sendCredentials'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rh/employes/[id]/reset-credentials
 * Body : { password: string }
 *
 * Met à jour le mot de passe Supabase Auth de l'employé (admin
 * redéfinit) et renvoie un email avec les nouveaux credentials.
 *
 * Pré-requis : l'employé doit déjà avoir un compte Auth (auth_user_id
 * non null). Sinon → 404. Pour créer un compte, utiliser
 * /create-account.
 *
 * Sécurité : identique à /create-account.
 */

const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'client_admin',
]

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: employeId } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('not_authenticated', 401)

    const supabase = getAdminClient()

    const { data: profileCaller } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profileCaller?.role || ''
    if (!ALLOWED_ROLES.includes(role)) {
      return apiError('access_denied', 403)
    }

    const hasAccess = await userHasAccessToEmploye(user.id, employeId)
    if (!hasAccess) {
      return apiError('access_denied_employee', 403)
    }

    let body: unknown
    try { body = await req.json() } catch {
      return apiError('invalid_request_format', 400)
    }
    const { password } = (body || {}) as { password?: unknown }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe min 8 caractères requis' }, { status: 400 })
    }

    const { data: emp } = await supabase
      .from('employes')
      .select('id, email, prenom, nom, auth_user_id')
      .eq('id', employeId)
      .maybeSingle()
    if (!emp) {
      return apiError('employee_not_found_alt', 404)
    }
    if (!emp.auth_user_id) {
      return NextResponse.json({
        error: 'Pas de compte Auth pour cet employé. Utiliser "Créer compte" plutôt que "Renvoyer credentials".',
      }, { status: 404 })
    }
    if (!emp.email) {
      return NextResponse.json({ error: 'Email employé manquant — impossible d\'envoyer les credentials' }, { status: 400 })
    }

    // Update password via Supabase Auth admin API.
    const { error: updateErr } = await supabase.auth.admin.updateUserById(
      emp.auth_user_id,
      { password },
    )
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Envoi email.
    const loginUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://lexora.app').replace(/\/+$/, '') + '/auth/login'
    const mail = await sendCredentialsEmail({
      to: emp.email,
      password,
      loginUrl,
      prenom: emp.prenom || undefined,
      nom: emp.nom || undefined,
    })

    console.warn(
      `[reset-credentials] OK employe=${emp.id} email=${emp.email} `
      + `auth_user_id=${emp.auth_user_id} email_sent=${mail.ok} by=${user.id}`,
    )

    return NextResponse.json({
      success: true,
      email_sent: mail.ok,
      email_error: mail.ok ? undefined : mail.error,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[reset-credentials] CRASH:', msg)
    return NextResponse.json({ error: 'Erreur lors du reset des credentials' }, { status: 500 })
  }
}
