/**
 * /api/client/relances/historique
 *
 * GET : historique des relances (filtrage par société + option facture_id).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const facture_id = searchParams.get('facture_id')
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || '100') | 0, 1), 500)
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    let query = supabase
      .from('factures_relances')
      .select('id, facture_id, niveau, canal, statut, destinataire, sujet, error, dry_run, source, date_envoi, created_by')
      .eq('societe_id', societe_id)
      .order('date_envoi', { ascending: false })
      .limit(limit)
    if (facture_id) query = query.eq('facture_id', facture_id)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ historique: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
