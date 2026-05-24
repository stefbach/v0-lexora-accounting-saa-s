/**
 * POST /api/rh/eoy-bonus/[id]/annuler-bulletin?portion=75|25
 *
 * Sprint G11 Phase 2 — supprime un bulletin EOY déjà généré et nullifie
 * la liaison dans eoy_bonus_calculs.
 *
 * Auth : admin UNIQUEMENT (action sensible, pas rh).
 *
 * Séquentialité : si portion=75 et que le 25% existe, on refuse
 * (il faut annuler le 25% d'abord).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { annulerBulletinEoy, type EoyPortion } from '@/lib/rh/eoy-bonus-bulletin'

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
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Annulation réservée admin' }, { status: 403 })
    }

    const url = new URL(request.url)
    const portionRaw = url.searchParams.get('portion') || ''
    const portion: EoyPortion = portionRaw === '25' ? '25pct' : portionRaw === '75' ? '75pct' : (portionRaw === '25pct' || portionRaw === '75pct' ? portionRaw as EoyPortion : '75pct')
    if (!['25pct', '75pct'].includes(portion)) {
      return NextResponse.json({ error: 'portion invalide (75 ou 25)' }, { status: 400 })
    }

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const result = await annulerBulletinEoy(supabase, id, portion)
    if (!('ok' in result) || !result.ok) {
      return NextResponse.json({ error: (result as any).erreur }, { status: (result as any).status || 500 })
    }
    return NextResponse.json({ success: true, portion })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
