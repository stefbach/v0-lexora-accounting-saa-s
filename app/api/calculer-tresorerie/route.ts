import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getTauxChange } from '@/lib/taux-change'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getAdminClient()

  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Multi-tenant guard : l'utilisateur doit pouvoir accéder à cette société
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (err) {
      if (err instanceof SocieteAccessError) {
        return apiError('access_denied_company', 403)
      }
      throw err
    }

    const rates = await getTauxChange()

    // Get all active comptes bancaires
    const { data: comptes, error: comptesError } = await supabase
      .from('comptes_bancaires')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)

    if (comptesError) throw comptesError

    // Convert to MUR
    let totalMur = 0
    const parCompte = (comptes || []).map((c: any) => {
      const taux = rates[c.devise] || 1
      const soldeMur = (c.solde_actuel || 0) * taux
      totalMur += soldeMur
      return {
        id: c.id,
        banque: c.banque,
        numero_compte: c.numero_compte,
        devise: c.devise,
        solde_actuel: c.solde_actuel,
        taux_applique: taux,
        solde_mur: Math.round(soldeMur * 100) / 100,
      }
    })

    return NextResponse.json({
      societe_id,
      total_mur: Math.round(totalMur * 100) / 100,
      par_compte: parCompte,
      taux_change: rates,
      nb_comptes: parCompte.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
