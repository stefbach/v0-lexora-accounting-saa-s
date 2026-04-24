/**
 * POST /api/rh/declarations-mra/valider-paiement — sprint G13.
 * Paiement groupé à la MRA : marque payées + 3 paires d'écritures.
 * Auth : admin uniquement.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { marquerPayeMra } from '@/lib/rh/declarations-mra'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Paiement réservé admin' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const societeId = String(body.societe_id || '').trim()
    const payeId = String(body.declaration_paye_id || '').trim()
    const csgId = String(body.declaration_csg_id || '').trim()
    const datePaiement = String(body.date_paiement || '').trim()
    const ref = String(body.reference_bancaire || '').trim()
    if (!societeId || !payeId || !csgId || !datePaiement) {
      return NextResponse.json({
        error: 'societe_id, declaration_paye_id, declaration_csg_id et date_paiement requis',
      }, { status: 400 })
    }

    const r = await marquerPayeMra(supabase, {
      societeId, declarationPayeId: payeId, declarationCsgId: csgId,
      datePaiement, referenceBancaire: ref || 'N/A',
    })
    if (!r.ok) return NextResponse.json({ error: r.erreur || 'Erreur paiement' }, { status: 500 })

    return NextResponse.json({
      success: true,
      ecritures: r.ecritures,
      declaration_paye_id: r.declaration_paye_id,
      declaration_csg_id: r.declaration_csg_id,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
