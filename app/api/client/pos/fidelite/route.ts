/**
 * /api/client/pos/fidelite
 * GET : solde de points d'un client + derniers mouvements.
 *   ?societe_id=…&client_id=…
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { soldeFidelite } from '@/lib/pos/fidelite'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const client_id = searchParams.get('client_id')
    if (!societe_id || !client_id) {
      return NextResponse.json({ error: 'societe_id et client_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data, error } = await supabase
      .from('pos_fidelite_mouvements')
      .select('id, points, type, motif, vente_pos_id, created_at')
      .eq('societe_id', societe_id)
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const mouvements = data || []
    return NextResponse.json({ solde: soldeFidelite(mouvements), mouvements })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
