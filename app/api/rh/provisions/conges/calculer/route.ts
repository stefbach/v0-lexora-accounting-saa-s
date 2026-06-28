/**
 * POST /api/rh/provisions/conges/calculer — sprint G8 Phase 1.
 *
 * Calcule la provision IAS 19 congés payés pour une société à une date
 * donnée (fin de mois par défaut) SANS sauvegarder ni comptabiliser.
 *
 * Auth : admin ou rh.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculerProvisionSociete, finDeMois } from '@/lib/rh/ias19-provisions'

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
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const dateSnapshot = body.date_snapshot
      ? finDeMois(String(body.date_snapshot).slice(0, 10))
      : undefined

    const snapshot = await calculerProvisionSociete(supabase, societeId, dateSnapshot)
    return NextResponse.json({ snapshot })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
