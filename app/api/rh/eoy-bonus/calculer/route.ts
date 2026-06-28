/**
 * POST /api/rh/eoy-bonus/calculer — sprint G11 Phase 1.
 *
 * Body : { societe_id: string, annee: number }
 * Auth : admin / rh.
 *
 * 1. Appelle la RPC calculer_eoy_bonus_societe.
 * 2. UPSERT chaque résultat dans eoy_bonus_calculs.
 * 3. Retourne { calculs, recap, saved }.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  calculerEoyBonusSociete,
  calculerRecapSociete,
  sauvegarderCalculsSociete,
} from '@/lib/rh/eoy-bonus'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function loadJoursFeries(
  supabase: ReturnType<typeof getAdminClient>,
  annee: number,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('jours_feries')
    .select('date, travail_autorise')
    .gte('date', `${annee}-01-01`)
    .lte('date', `${annee}-12-31`)
  return new Set(
    ((data || []) as any[]).filter(r => !r.travail_autorise).map(r => String(r.date).slice(0, 10)),
  )
}

export async function POST(request: Request) {
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
    const societeId: string = body?.societe_id
    const annee = Number(body?.annee) || new Date().getFullYear()
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const calculs = await calculerEoyBonusSociete(supabase, societeId, annee)

    const { saved, errors } = await sauvegarderCalculsSociete(
      supabase, societeId, annee, calculs, user.id,
    )

    const { data: soc } = await supabase
      .from('societes')
      .select('eoy_bonus_date_paiement_75pct, eoy_bonus_date_paiement_25pct')
      .eq('id', societeId)
      .maybeSingle()
    const joursFeries = await loadJoursFeries(supabase, annee)
    const recap = calculerRecapSociete(
      societeId, annee, calculs, joursFeries,
      (soc as { eoy_bonus_date_paiement_75pct?: string | null } | null)?.eoy_bonus_date_paiement_75pct || null,
      (soc as { eoy_bonus_date_paiement_25pct?: string | null } | null)?.eoy_bonus_date_paiement_25pct || null,
    )

    return NextResponse.json({ calculs, recap, saved, errors })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
