/**
 * POST /api/rh/eoy-bonus/[id]/generer-bulletin-25 — sprint G11 Phase 2.
 *
 * Génère le bulletin EOY 25% (après que le 75% ait été généré).
 * Auth : admin / rh.
 *
 * Blocage période : 15 décembre -> 31 janvier (bypass admin via force=true).
 */
import { NextResponse } from 'next/server'
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
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const force = body?.force === true && role === 'admin'
    if (!force && !dansPeriodeGeneration('25pct')) {
      return NextResponse.json(
        { error: 'Période de génération 25% : 15/12 → 31/01. Utilisez force=true (admin) pour bypass.' },
        { status: 409 },
      )
    }

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Multi-tenant guard avant génération de bulletin
    const { data: calcul } = await supabase
      .from('eoy_bonus_calculs')
      .select('id, societe_id')
      .eq('id', id)
      .maybeSingle()
    if (!calcul) return NextResponse.json({ error: 'Calcul introuvable' }, { status: 404 })
    const hasAccess = await userHasAccessToSociete(user.id, String((calcul as any).societe_id))
    if (!hasAccess) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const result = await genererBulletinEoy(supabase, id, '25pct', user.id)
    if (!result.ok) {
      return NextResponse.json({ error: result.erreur, code: result.code }, { status: result.status || 500 })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
