import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Sprint salarie V1.5 — read-only aggregation of documents visible to
// the connected employee: signed contracts and pay slips. This endpoint
// lives under /api/salarie to avoid touching /api/rh (owned by the
// concurrent RH security sprint).

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Resolve the employee linked to the connected Supabase user, using the
// same three-step strategy as /api/rh/employes/me (auth_user_id →
// profiles.employe_id → email match). Returns null when nothing matches.
async function resolveSelfEmploye(userId: string, email: string | undefined, admin: ReturnType<typeof getAdminClient>) {
  // 1) direct link
  const { data: byAuth } = await admin
    .from('employes')
    .select('id, societe_id, auth_user_id, email')
    .eq('auth_user_id', userId)
    .is('date_depart', null)
    .maybeSingle()
  if (byAuth) return byAuth

  // 2) via profiles.employe_id
  const { data: profile } = await admin
    .from('profiles')
    .select('employe_id')
    .eq('id', userId)
    .maybeSingle()
  if (profile?.employe_id) {
    const { data: byProfile } = await admin
      .from('employes')
      .select('id, societe_id, auth_user_id, email')
      .eq('id', profile.employe_id)
      .is('date_depart', null)
      .maybeSingle()
    if (byProfile) return byProfile
  }

  // 3) fallback by email (unlinked employees only)
  if (email) {
    const lower = email.toLowerCase().trim()
    const { data: candidates } = await admin
      .from('employes')
      .select('id, societe_id, auth_user_id, email')
      .is('date_depart', null)
      .is('auth_user_id', null)
    const match = (candidates || []).filter(e => e.email && e.email.toLowerCase().trim() === lower)
    if (match.length === 1) return match[0]
  }
  return null
}

export async function GET() {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const admin = getAdminClient()
    const emp = await resolveSelfEmploye(user.id, user.email, admin)
    if (!emp) return NextResponse.json({ documents: [], employe: null, message: "Aucun profil employé lié" })

    // Contrats signés ou en attente de contresignature
    const { data: contrats } = await admin
      .from('contrats_employes')
      .select('id, type_contrat, statut, date_debut, date_signature_employe, date_signature_dirigeant, created_at')
      .eq('employe_id', emp.id)
      .in('statut', ['signe', 'signe_employe'])
      .order('created_at', { ascending: false })

    // Bulletins de paie (statuts valide/paye/declare_mra visibles par l'employé)
    const { data: bulletins } = await admin
      .from('bulletins_paie')
      .select('id, periode, statut, salaire_net, date_validation, date_paiement, created_at')
      .eq('employe_id', emp.id)
      .in('statut', ['valide', 'paye', 'declare_mra'])
      .order('periode', { ascending: false })

    const documents = [
      ...(contrats || []).map((c: any) => ({
        id: `contrat_${c.id}`,
        source_id: c.id,
        categorie: 'contrat' as const,
        type: c.type_contrat,
        titre: `Contrat ${c.type_contrat}`,
        date: c.date_signature_dirigeant || c.date_signature_employe || c.created_at,
        statut: c.statut,
        url: `/api/rh/contrats/${c.id}/pdf`,
      })),
      ...(bulletins || []).map((b: any) => ({
        id: `bulletin_${b.id}`,
        source_id: b.id,
        categorie: 'bulletin' as const,
        type: 'Bulletin de paie',
        titre: `Bulletin ${b.periode}`,
        date: b.date_paiement || b.date_validation || b.created_at,
        statut: b.statut,
        periode: b.periode,
        salaire_net: b.salaire_net,
        // employe_id utilisé par /api/rh/paie/pdf pour vérifier isSelf
        url: `/api/rh/paie/pdf?employe_id=${emp.id}&periode=${b.periode}&bulletin_id=${b.id}`,
      })),
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

    return NextResponse.json({ documents, employe_id: emp.id })
  } catch (e: any) {
    console.error('[/api/salarie/documents] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}
