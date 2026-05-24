import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { upsertTiersManual } from '@/lib/tiers-annuaire'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

// POST /api/client/tiers-offshore
// Body: { tiers: string, societe_id: string, est_offshore: boolean }
//
// 1. Updates all factures for this tiers + societe_id with the new client_offshore value
// 2. Upserts tiers_annuaire with verifie=true, source='manuel'
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { tiers, societe_id, est_offshore, type_tiers } = body
    if (!tiers || !societe_id || typeof est_offshore !== 'boolean') {
      return NextResponse.json({ error: 'tiers, societe_id et est_offshore requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Tenant isolation: vérifier l'accès du caller à la société AVANT toute mutation
    await assertSocieteAccess(supabase, user.id, societe_id)

    // 1. Update all factures for this tiers + societe_id
    const { error: factureErr, count } = await supabase
      .from('factures')
      .update({ client_offshore: est_offshore }, { count: 'exact' })
      .eq('societe_id', societe_id)
      .eq('tiers', tiers)
    if (factureErr) {
      console.error('[tiers-offshore] facture update error:', factureErr.message)
      return NextResponse.json({ error: factureErr.message }, { status: 500 })
    }

    // 2. Upsert tiers_annuaire
    const tiersRecord = await upsertTiersManual(supabase, {
      nom: tiers,
      est_offshore,
      type_tiers: type_tiers || 'fournisseur',
      verified_by: user.id,
    })

    return NextResponse.json({
      success: true,
      factures_updated: count ?? 0,
      tiers_annuaire: tiersRecord,
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('[tiers-offshore] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
