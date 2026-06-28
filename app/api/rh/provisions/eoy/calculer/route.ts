/**
 * POST /api/rh/provisions/eoy/calculer — sprint G8 Phase 2.
 *
 * Aperçu de la provision EOY Bonus mensualisée (sans sauvegarde).
 * Auth : admin + rh. Mois 12 rejeté.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculerProvisionEoySociete } from '@/lib/rh/ias19-eoy-provisions'

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
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return apiError('hr_admin_only', 403)
    }

    const body = await request.json().catch(() => ({}))
    const societeId = String(body.societe_id || '').trim()
    const annee = Number(body.annee)
    const mois = Number(body.mois)
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!Number.isFinite(annee) || annee < 2020 || annee > 2100) {
      return NextResponse.json({ error: 'annee invalide' }, { status: 400 })
    }
    if (!Number.isFinite(mois) || mois < 1 || mois > 12) {
      return NextResponse.json({ error: 'mois invalide (1-12)' }, { status: 400 })
    }
    if (mois === 12) {
      return NextResponse.json({
        error: 'Pas de provision en décembre : paiement réel via G11 (EOY Bonus)',
      }, { status: 400 })
    }

    const snapshot = await calculerProvisionEoySociete(supabase, societeId, annee, mois)
    return NextResponse.json({ snapshot })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
