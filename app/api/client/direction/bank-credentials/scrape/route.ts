import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { scrapeBankAccount, detectAnomalies } from '@/lib/banks/scraper'

/**
 * POST /api/client/direction/bank-credentials/scrape?compte_id=Y
 * Trigger manuel d'un scrape bancaire depuis l'UI.
 * Accès : direction / admin uniquement.
 */
export const maxDuration = 120 // Playwright peut être lent

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('not_authenticated', 401)

  const compteId = req.nextUrl.searchParams.get('compte_id')
  if (!compteId) return NextResponse.json({ error: 'compte_id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: compte } = await admin
    .from('comptes_bancaires').select('id, societe_id').eq('id', compteId).maybeSingle()
  if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

  await assertSocieteAccess(supabase, user.id, compte.societe_id)
  const { data: us } = await supabase
    .from('user_societes').select('role')
    .eq('user_id', user.id).eq('societe_id', compte.societe_id).maybeSingle()
  if (!['direction', 'client_admin', 'admin', 'super_admin'].includes(us?.role || '')) {
    return apiError('management_only', 403)
  }

  const result = await scrapeBankAccount({
    compte_bancaire_id: compteId,
    societe_id: compte.societe_id,
    trigger_source: 'manual',
  })
  if (result.status === 'success') {
    await detectAnomalies(compteId, result)
  }
  return NextResponse.json(result)
}
