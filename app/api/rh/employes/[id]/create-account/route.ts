import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import { sendCredentialsEmail } from '@/lib/email/sendCredentials'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rh/employes/[id]/create-account
 * Body : { password: string }
 *
 * Crée un compte Supabase Auth pour l'employé avec le password
 * fourni par l'admin, crée la ligne profiles avec role='employe',
 * lie employes.auth_user_id au nouveau user, et envoie un email
 * avec les credentials (Gmail SMTP, helper sendCredentialsEmail).
 *
 * Sécurité :
 *   - SUPABASE_SERVICE_ROLE_KEY utilisée uniquement côté serveur
 *   - GMAIL_APP_PASSWORD utilisée uniquement côté serveur
 *   - Auth gate : admin/super_admin/rh/rh_manager/client_admin
 *     uniquement (pas manager — décision RH structurelle)
 *
 * Idempotence : si l'email Auth existe déjà, retourne 409 (pas de
 * recréation silencieuse). Pour reset le password d'un compte
 * existant, utiliser /reset-credentials.
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
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()

    // Auth gate role.
    const { data: profileCaller } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profileCaller?.role || ''
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Multi-tenant : l'admin doit avoir accès à cet employé.
    const hasAccess = await userHasAccessToEmploye(user.id, employeId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })
    }

    // Body validation.
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Format de la requête invalide' }, { status: 400 })
    }
    const { password } = (body || {}) as { password?: unknown }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe min 8 caractères requis' }, { status: 400 })
    }

    // Charger l'employé et son email.
    const { data: emp } = await supabase
      .from('employes')
      .select('id, email, prenom, nom, auth_user_id, societe_id')
      .eq('id', employeId)
      .maybeSingle()
    if (!emp) {
      return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 })
    }
    if (!emp.email) {
      return NextResponse.json({ error: 'Email employé manquant — renseigner avant création de compte' }, { status: 400 })
    }
    if (emp.auth_user_id) {
      return NextResponse.json({
        error: 'Compte Auth déjà existant pour cet employé. Utiliser le bouton "Renvoyer credentials" pour redéfinir le mot de passe.',
      }, { status: 409 })
    }

    // Création du compte Auth (email_confirm: true → login direct).
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: emp.email,
      password,
      email_confirm: true,
      user_metadata: {
        prenom: emp.prenom || '',
        nom: emp.nom || '',
        societe_id: emp.societe_id || null,
      },
    })
    if (createErr || !created?.user) {
      const msg = createErr?.message || 'Erreur création compte Auth'
      // Conflict explicite si email existe déjà côté Auth.
      const isConflict = /already registered|already.*exists|duplicate/i.test(msg)
      return NextResponse.json(
        { error: isConflict ? 'Un compte existe déjà pour cet email' : msg },
        { status: isConflict ? 409 : 500 },
      )
    }
    const newUserId = created.user.id

    // Créer la ligne profiles avec role='employe'.
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert({
        id: newUserId,
        email: emp.email,
        role: 'employe',
        employe_id: emp.id,
        societe_id: emp.societe_id || null,
      }, { onConflict: 'id' })
    if (profileErr) {
      // Compte Auth créé mais profile en échec : on log et continue.
      // L'admin peut corriger via SQL si besoin. Pas de rollback Auth
      // pour ne pas masquer l'incident côté monitoring.
      console.error(`[create-account] profile upsert failed pour ${newUserId}: ${profileErr.message}`)
    }

    // Lier employes.auth_user_id.
    const { error: linkErr } = await supabase
      .from('employes')
      .update({ auth_user_id: newUserId })
      .eq('id', emp.id)
    if (linkErr) {
      console.error(`[create-account] lien employes.auth_user_id failed pour ${emp.id}: ${linkErr.message}`)
    }

    // Envoi email — non bloquant (si SMTP plante, on garde le compte
    // créé ; l'admin peut renvoyer via /reset-credentials).
    const loginUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://lexora.app').replace(/\/+$/, '') + '/auth/login'
    const mail = await sendCredentialsEmail({
      to: emp.email,
      password,
      loginUrl,
      prenom: emp.prenom || undefined,
      nom: emp.nom || undefined,
    })

    // Audit log (jamais le password en clair).
    console.log(
      `[create-account] OK employe=${emp.id} email=${emp.email} `
      + `auth_user_id=${newUserId} email_sent=${mail.ok} by=${user.id}`,
    )

    return NextResponse.json({
      success: true,
      auth_user_id: newUserId,
      email_sent: mail.ok,
      email_error: mail.ok ? undefined : mail.error,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[create-account] CRASH:', msg)
    return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 })
  }
}
