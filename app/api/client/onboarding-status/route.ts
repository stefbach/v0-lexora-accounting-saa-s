/**
 * GET /api/client/onboarding-status?societe_id=
 *
 * Signaux de mise en route d'une société (profil, banque, 1er document, soldes
 * d'ouverture, salariés) → checklist guidée pour le dirigeant autonome.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { computeChecklist, type OnboardingSignals } from '@/lib/onboarding/checklist'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function count(supabase: any, table: string, build: (q: any) => any): Promise<number> {
  const { count } = await build(supabase.from(table).select('id', { count: 'exact', head: true }))
  return count || 0
}

export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (err) {
      if (err instanceof SocieteAccessError) return apiError('access_denied_company', 403)
      throw err
    }

    const { data: societe } = await supabase
      .from('societes').select('date_fin_exercice').eq('id', societe_id).maybeSingle()

    const [nbComptes, nbReleves, nbFactures, nbSoldes, nbEmployes] = await Promise.all([
      count(supabase, 'comptes_bancaires', q => q.eq('societe_id', societe_id)),
      count(supabase, 'releves_bancaires', q => q.eq('societe_id', societe_id)),
      count(supabase, 'factures', q => q.eq('societe_id', societe_id)),
      count(supabase, 'soldes_ouverture_saisie', q => q.eq('societe_id', societe_id)),
      count(supabase, 'employes', q => q.eq('societe_id', societe_id).eq('actif', true)),
    ])

    const signals: OnboardingSignals = {
      profil_complet: !!societe?.date_fin_exercice,
      banque_connectee: nbComptes > 0 || nbReleves > 0,
      a_document: nbFactures > 0,
      soldes_ouverture: nbSoldes > 0,
      a_salarie: nbEmployes > 0,
    }

    return NextResponse.json({ signals, checklist: computeChecklist(signals) })
  } catch (e: any) {
    console.error('[onboarding-status]', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
