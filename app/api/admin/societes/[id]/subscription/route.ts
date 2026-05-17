/**
 * GET  /api/admin/societes/[id]/subscription
 *   → Retourne l'abonnement courant d'une société : plan choisi + add-ons +
 *     périodicité + prix mensuel/période effectifs + modules union.
 *
 * PUT  /api/admin/societes/[id]/subscription
 *   → Met à jour l'abonnement.
 *     Body : { plan_id, addon_codes: string[], periodicite }
 *     Calcule automatiquement prix + modules via la fonction SQL
 *     compute_subscription(), puis persiste tout sur la société.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

const VALID_PERIOD = new Set(['mensuelle', 'annuelle'])

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const admin = getAdminClient()

  const { data: soc, error } = await admin
    .from('societes')
    .select('id, nom, plan_id, addons_actifs, periodicite, prix_mensuel_effectif, prix_periode_effectif, modules_actifs')
    .eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!soc) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })

  let plan: any = null
  if (soc.plan_id) {
    const { data: p } = await admin.from('plans').select('*').eq('id', soc.plan_id).maybeSingle()
    plan = p
  }
  let addons: any[] = []
  if (Array.isArray(soc.addons_actifs) && soc.addons_actifs.length > 0) {
    const { data: a } = await admin.from('plans').select('*').in('code', soc.addons_actifs as string[])
    addons = a || []
  }

  return NextResponse.json({
    societe: { id: soc.id, nom: soc.nom },
    subscription: {
      plan_id: soc.plan_id, plan,
      addon_codes: soc.addons_actifs || [],
      addons,
      periodicite: soc.periodicite || 'mensuelle',
      prix_mensuel_effectif: soc.prix_mensuel_effectif,
      prix_periode_effectif: soc.prix_periode_effectif,
      modules_actifs: soc.modules_actifs,
    },
  })
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { plan_id, addon_codes, periodicite } = body
  if (!plan_id) return NextResponse.json({ error: 'plan_id requis' }, { status: 400 })
  const period = VALID_PERIOD.has(periodicite) ? periodicite : 'mensuelle'
  const addons: string[] = Array.isArray(addon_codes) ? addon_codes.filter(Boolean) : []

  const admin = getAdminClient()

  // Compute via la fonction SQL (cohérence avec d'autres usages)
  const { data: comp, error: cErr } = await admin.rpc('compute_subscription', {
    p_plan_id: plan_id, p_addon_codes: addons, p_periodicite: period,
  })
  if (cErr) return NextResponse.json({ error: `compute: ${cErr.message}` }, { status: 500 })
  const row = Array.isArray(comp) ? comp[0] : comp

  // Persiste sur la société : plan_id + addons + periodicite + prix cache +
  // modules_actifs (merge plan + add-ons)
  const { error: uErr } = await admin.from('societes').update({
    plan_id,
    addons_actifs: addons,
    periodicite: period,
    prix_mensuel_effectif: row?.prix_mensuel ?? null,
    prix_periode_effectif: row?.prix_periode ?? null,
    modules_actifs: row?.modules_inclus ?? {},
  }).eq('id', id)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    prix_mensuel: row?.prix_mensuel,
    prix_periode: row?.prix_periode,
    modules_inclus: row?.modules_inclus,
  })
}
