/**
 * GET /api/rh/eoy-bonus?societe_id=xxx&annee=2026 — sprint G11 Phase 1.
 *
 * Lit les calculs déjà sauvegardés dans eoy_bonus_calculs + calcule
 * le récap (totaux, splits 75/25, dates paiement).
 *
 * Auth : admin / rh uniquement.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculerRecapSociete, getCalculsExistants } from '@/lib/rh/eoy-bonus'

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
    ((data || []) as any[])
      .filter(r => !r.travail_autorise)
      .map(r => String(r.date).slice(0, 10)),
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const url = new URL(request.url)
    const societeId = url.searchParams.get('societe_id')
    const anneeRaw = url.searchParams.get('annee')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const annee = anneeRaw ? parseInt(anneeRaw, 10) : new Date().getFullYear()
    if (!Number.isFinite(annee)) {
      return NextResponse.json({ error: 'annee invalide' }, { status: 400 })
    }

    const calculs = await getCalculsExistants(supabase, societeId, annee)

    // Override dates 75/25 si la société en a configurées.
    const { data: soc } = await supabase
      .from('societes')
      .select('eoy_bonus_date_paiement_75pct, eoy_bonus_date_paiement_25pct')
      .eq('id', societeId)
      .maybeSingle()

    const joursFeries = await loadJoursFeries(supabase, annee)
    const recap = calculerRecapSociete(
      societeId,
      annee,
      calculs,
      joursFeries,
      (soc as any)?.eoy_bonus_date_paiement_75pct || null,
      (soc as any)?.eoy_bonus_date_paiement_25pct || null,
    )

    return NextResponse.json({ calculs, recap, saved: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
