import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Sprint 12 FEATURE 1 + 3 — Création d'un compte Lexora (auth.users) lié à
 * un employé existant.
 *
 * Contrairement à POST /api/admin/users qui crée des utilisateurs clients
 * avec dossiers/user_societes, cet endpoint est spécifique au cas RH :
 *   1. Crée le auth.user (email + password, email_confirm=true).
 *   2. UPSERT profiles avec role='employe' + employe_id=employes.id.
 *   3. UPDATE employes.auth_user_id.
 *
 * Les triggers mig 108/131 couvrent normalement 2+3 dès que auth_user_id
 * est set — on force quand même explicitement pour garantir l'état en
 * cas de trigger absent dans l'env.
 *
 * Supporte deux modes :
 *   - Single : body { employe_id, password, email? (override) }
 *   - Bulk   : body { bulk: true, employes: [{ employe_id, password, email? }, ...] }
 *     → retourne { results: [{employe_id, status, user_id?, error?}, ...] }
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
  const allowed = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']
  if (!profile || !allowed.includes(profile.role)) return null
  return user
}

type SingleInput = { employe_id: string; password: string; email?: string }
type BulkInput = { bulk: true; employes: SingleInput[]; default_password?: string }

interface Result {
  employe_id: string
  status: 'created' | 'already_linked' | 'error'
  user_id?: string
  email?: string
  error?: string
}

async function createOne(
  supabase: ReturnType<typeof getAdminClient>,
  input: SingleInput,
  defaultPassword?: string,
): Promise<Result> {
  try {
    // Fetch employe
    const { data: emp, error: empErr } = await supabase
      .from('employes')
      .select('id, nom, prenom, email, societe_id, auth_user_id, date_depart')
      .eq('id', input.employe_id)
      .maybeSingle()
    if (empErr || !emp) {
      return { employe_id: input.employe_id, status: 'error', error: empErr?.message || 'Employé introuvable' }
    }
    if (emp.date_depart) {
      return { employe_id: input.employe_id, status: 'error', error: 'Employé parti (date_depart renseignée) — création interdite' }
    }
    if (emp.auth_user_id) {
      return { employe_id: input.employe_id, status: 'already_linked', user_id: emp.auth_user_id, email: emp.email }
    }

    const email = (input.email || emp.email || '').trim().toLowerCase()
    if (!email) {
      return { employe_id: input.employe_id, status: 'error', error: 'Email manquant sur l\'employé — renseignez-le avant création' }
    }
    const password = input.password || defaultPassword
    if (!password || password.length < 6) {
      return { employe_id: input.employe_id, status: 'error', error: 'Mot de passe requis (min 6 caractères)' }
    }

    const fullName = `${emp.prenom || ''} ${emp.nom || ''}`.trim() || email

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'employe', full_name: fullName },
    })
    if (authError || !authData?.user) {
      return { employe_id: input.employe_id, status: 'error', error: authError?.message || 'Échec création auth' }
    }
    const userId = authData.user.id

    // 2. UPSERT profile — le trigger handle_new_user a pu déjà l'amorcer.
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName,
      role: 'employe',
      employe_id: emp.id,
      societe_id: emp.societe_id || null,
    }, { onConflict: 'id' })
    if (profileErr) {
      // Tentative de rollback auth — best effort.
      try { await supabase.auth.admin.deleteUser(userId) } catch {}
      return { employe_id: input.employe_id, status: 'error', error: `Erreur profil : ${profileErr.message}` }
    }

    // 3. UPDATE employes.auth_user_id (déclenche trigger mig 108/131 qui
    // renforce la sync profiles.employe_id + profiles.role='employe').
    const { error: empUpdErr } = await supabase
      .from('employes')
      .update({ auth_user_id: userId })
      .eq('id', emp.id)
    if (empUpdErr) {
      console.warn('[create-user-employee] employes.auth_user_id update failed (trigger peut compenser):', empUpdErr.message)
    }

    return { employe_id: input.employe_id, status: 'created', user_id: userId, email }
  } catch (e: any) {
    return { employe_id: input.employe_id, status: 'error', error: e?.message || 'Erreur interne' }
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const supabase = getAdminClient()

    // Bulk mode
    if (body.bulk === true && Array.isArray(body.employes)) {
      const bulk = body as BulkInput
      const results: Result[] = []
      for (const emp of bulk.employes) {
        const r = await createOne(supabase, emp, bulk.default_password)
        results.push(r)
      }
      const summary = {
        total: results.length,
        created: results.filter(r => r.status === 'created').length,
        already_linked: results.filter(r => r.status === 'already_linked').length,
        errors: results.filter(r => r.status === 'error').length,
      }
      return NextResponse.json({ results, summary })
    }

    // Single mode
    if (!body.employe_id) {
      return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    }
    const result = await createOne(supabase, body as SingleInput)
    if (result.status === 'error') {
      return NextResponse.json({ error: result.error, result }, { status: 400 })
    }
    return NextResponse.json({ success: true, result })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
