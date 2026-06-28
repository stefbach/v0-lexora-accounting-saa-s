/**
 * GET /api/societes/{societe_id}/mra/vat-return?date_debut=&date_fin=
 *
 * Génère la déclaration TVA MRA (format EBS) pour une période : Output Tax,
 * Input Tax, Net VAT à payer ou crédit. Lecture seule.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { generateMRAVatReturn } from '@/lib/pcm/mra-ebs'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { searchParams } = new URL(request.url)
    const dateDebut = searchParams.get('date_debut')
    const dateFin = searchParams.get('date_fin')
    if (!dateDebut || !dateFin) {
      return NextResponse.json({ error: 'date_debut et date_fin requis (YYYY-MM-DD)' }, { status: 400 })
    }

    const vatReturn = await generateMRAVatReturn(admin, societe_id, dateDebut, dateFin)
    return NextResponse.json(vatReturn)
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
