import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/rh/employes/debug-link
 * Shows debug info about the current user's employee link.
 * Only accessible to admin/super_admin/rh/client_admin roles.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdmin()

    // Get profile
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, societe_id, client_id, employe_id, full_name, email')
      .eq('id', user.id)
      .maybeSingle()

    // Check if profile role allows debug
    if (!profile || !['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'comptable'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès réservé admin/RH' }, { status: 403 })
    }

    // Get all auth users
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers()

    // Get all active employees
    const { data: employes } = await admin
      .from('employes')
      .select('id, nom, prenom, email, auth_user_id, societe_id, code, poste')
      .is('date_depart', null)
      .order('nom')

    // Build link status
    const linkStatus = (employes || []).map((emp: any) => {
      const authUser = (authUsers || []).find((u: any) => u.id === emp.auth_user_id)
      const authByEmail = (authUsers || []).find((u: any) => u.email?.toLowerCase() === emp.email?.toLowerCase())
      return {
        employe_id: emp.id,
        code: emp.code,
        nom: `${emp.prenom} ${emp.nom}`,
        email_employe: emp.email,
        auth_user_id: emp.auth_user_id,
        auth_user_email: authUser?.email || null,
        auth_match_by_email: authByEmail ? { id: authByEmail.id, email: authByEmail.email } : null,
        status: emp.auth_user_id
          ? (authUser ? '✅ Lié' : '⚠️ auth_user_id invalide')
          : (authByEmail ? '🔗 Email match trouvé — non lié' : '❌ Non lié — aucun compte auth'),
        fix: !emp.auth_user_id && authByEmail ? `UPDATE employes SET auth_user_id = '${authByEmail.id}' WHERE id = '${emp.id}';` : null,
      }
    })

    // Profile ↔ employe links
    const profileLinks = (authUsers || []).map((u: any) => {
      const linkedEmp = (employes || []).find((e: any) => e.auth_user_id === u.id)
      return {
        auth_user_id: u.id,
        auth_email: u.email,
        linked_employe: linkedEmp ? `${linkedEmp.prenom} ${linkedEmp.nom} (${linkedEmp.code})` : null,
      }
    }).filter((p: any) => p.linked_employe || (employes || []).some((e: any) => e.email?.toLowerCase() === p.auth_email?.toLowerCase()))

    return NextResponse.json({
      current_user: {
        auth_id: user.id,
        auth_email: user.email,
        profile_role: profile?.role,
        profile_employe_id: profile?.employe_id,
      },
      link_status: linkStatus,
      profile_links: profileLinks,
      summary: {
        total_employes: (employes || []).length,
        linked: linkStatus.filter((l: any) => l.status === '✅ Lié').length,
        unlinked_with_match: linkStatus.filter((l: any) => l.status.includes('non lié')).length,
        unlinked_no_match: linkStatus.filter((l: any) => l.status.includes('aucun compte')).length,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

/**
 * POST /api/rh/employes/debug-link
 * Force-link an employee to an auth user.
 * Body: { employe_id: string, auth_user_id: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdmin()

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!profile || !['admin', 'super_admin', 'rh', 'client_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès réservé admin/RH' }, { status: 403 })
    }

    const body = await request.json()
    const { employe_id, auth_user_id } = body

    if (!employe_id || !auth_user_id) {
      return NextResponse.json({ error: 'employe_id et auth_user_id requis' }, { status: 400 })
    }

    // Clear any existing link to this auth_user_id (prevent duplicates)
    await admin.from('employes').update({ auth_user_id: null }).eq('auth_user_id', auth_user_id)

    // Set the new link
    const { error: empError } = await admin.from('employes').update({ auth_user_id }).eq('id', employe_id)
    if (empError) return NextResponse.json({ error: empError.message }, { status: 500 })

    // Also update profiles.employe_id
    await admin.from('profiles').update({ employe_id }).eq('id', auth_user_id)

    return NextResponse.json({ success: true, message: `Employé ${employe_id} lié à auth ${auth_user_id}` })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
