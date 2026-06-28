/**
 * POST /api/rh/eoy-bonus/[id]/generer-bulletin-75 — sprint G11 Phase 2.
 *
 * Génère un bulletin spécial EOY 75% pour le calcul eoy_bonus_calculs[id].
 * Auth : admin / rh.
 *
 * Blocage période : génération autorisée seulement entre 1er nov et
 * 31 déc — sauf si admin force via body.force = true.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { genererBulletinEoy, dansPeriodeGeneration } from '@/lib/rh/eoy-bonus-bulletin'
import { userHasAccessToSociete } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return apiError('hr_admin_only', 403)
    }

    const body = await request.json().catch(() => ({} as any))
    const force = body?.force === true && role === 'admin'
    if (!force && !dansPeriodeGeneration('75pct')) {
      return NextResponse.json(
        { error: 'Période de génération 75% : novembre-décembre. Utilisez force=true (admin) pour bypass.' },
        { status: 409 },
      )
    }

    const params = await (Promise.resolve(context.params) as Promise<Record<string, string>>)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Multi-tenant guard avant génération de bulletin
    const { data: calcul } = await supabase
      .from('eoy_bonus_calculs')
      .select('id, societe_id')
      .eq('id', id)
      .maybeSingle()
    if (!calcul) return NextResponse.json({ error: 'Calcul introuvable' }, { status: 404 })
    const hasAccess = await userHasAccessToSociete(user.id, String((calcul as { societe_id: string }).societe_id))
    if (!hasAccess) return apiError('access_denied', 403)

    const result = await genererBulletinEoy(supabase, id, '75pct', user.id)
    if (!result.ok) {
      return NextResponse.json({ error: result.erreur, code: result.code }, { status: result.status || 500 })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
