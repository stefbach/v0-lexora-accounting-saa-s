/**
 * POST /api/rh/eoy-bonus/preview — sprint G11 Phase 1.
 *
 * Body : { societe_id: string, annee: number }
 * Auth : admin / rh.
 *
 * Comme /calculer mais NE SAUVEGARDE PAS dans eoy_bonus_calculs.
 * Utile pour valider visuellement avant de persister.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  calculerEoyBonusSociete,
  calculerRecapSociete,
} from '@/lib/rh/eoy-bonus'

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
    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const societeId: string = body?.societe_id
    const annee = Number(body?.annee) || new Date().getFullYear()
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const calculs = await calculerEoyBonusSociete(supabase, societeId, annee)

    const { data: soc } = await supabase
      .from('societes')
      .select('eoy_bonus_date_paiement_75pct, eoy_bonus_date_paiement_25pct')
      .eq('id', societeId)
      .maybeSingle()
    const { data: feries } = await supabase
      .from('jours_feries').select('date, travail_autorise')
      .gte('date', `${annee}-01-01`).lte('date', `${annee}-12-31`)
    const joursFeries = new Set(
      ((feries || []) as any[]).filter(r => !r.travail_autorise).map(r => String(r.date).slice(0, 10)),
    )
    const recap = calculerRecapSociete(
      societeId, annee, calculs, joursFeries,
      (soc as any)?.eoy_bonus_date_paiement_75pct || null,
      (soc as any)?.eoy_bonus_date_paiement_25pct || null,
    )

    return NextResponse.json({ calculs, recap, saved: false, preview: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
