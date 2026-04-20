import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Sprint salarie V3.5 — lightweight summary used by the sidebar to show
// small badges without having to fetch the full contracts/bulletins
// lists just for a count. Read-only, lives under /api/salarie/*.

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveSelfEmployeId(userId: string, email: string | undefined, admin: ReturnType<typeof getAdminClient>) {
  const { data: byAuth } = await admin
    .from('employes').select('id')
    .eq('auth_user_id', userId).is('date_depart', null).maybeSingle()
  if (byAuth) return byAuth.id

  const { data: profile } = await admin
    .from('profiles').select('employe_id').eq('id', userId).maybeSingle()
  if (profile?.employe_id) {
    const { data: byProfile } = await admin
      .from('employes').select('id').eq('id', profile.employe_id).is('date_depart', null).maybeSingle()
    if (byProfile) return byProfile.id
  }

  if (email) {
    const lower = email.toLowerCase().trim()
    const { data: candidates } = await admin
      .from('employes').select('id, email')
      .is('date_depart', null).is('auth_user_id', null)
    const match = (candidates || []).filter(e => e.email && e.email.toLowerCase().trim() === lower)
    if (match.length === 1) return match[0].id
  }
  return null
}

export async function GET() {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    const employeId = await resolveSelfEmployeId(user.id, user.email, admin)
    if (!employeId) {
      return NextResponse.json({ contrats_a_signer: 0, bulletins_non_lus: 0 })
    }

    // Contrats en brouillon (à signer par l'employé)
    const { count: contratsCount } = await admin
      .from('contrats_employes')
      .select('id', { count: 'exact', head: true })
      .eq('employe_id', employeId)
      .eq('statut', 'brouillon')

    // Bulletins publiés (valide / paye / declare_mra) jamais ouverts
    // Colonne lu_le : présente depuis la mig V19+, absente sur certains
    // environnements legacy → try/catch silencieux.
    let bulletinsCount = 0
    try {
      const { count } = await admin
        .from('bulletins_paie')
        .select('id', { count: 'exact', head: true })
        .eq('employe_id', employeId)
        .in('statut', ['valide', 'paye', 'declare_mra'])
        .is('lu_le', null)
      bulletinsCount = count || 0
    } catch {
      bulletinsCount = 0
    }

    return NextResponse.json({
      contrats_a_signer: contratsCount || 0,
      bulletins_non_lus: bulletinsCount,
    })
  } catch (e: unknown) {
    console.error('[/api/salarie/notifications] error:', e)
    return NextResponse.json({ contrats_a_signer: 0, bulletins_non_lus: 0 })
  }
}
