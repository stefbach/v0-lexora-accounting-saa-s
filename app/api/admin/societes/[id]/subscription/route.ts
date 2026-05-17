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

  // Calcul : tente d'abord la fonction SQL (mig 284), fallback JS sinon.
  let prixMensuel = 0
  let prixPeriode = 0
  let modulesInclus: Record<string, boolean> = {}

  const { data: comp, error: cErr } = await admin.rpc('compute_subscription', {
    p_plan_id: plan_id, p_addon_codes: addons, p_periodicite: period,
  })
  if (!cErr && comp) {
    const row = Array.isArray(comp) ? comp[0] : comp
    prixMensuel = Number(row?.prix_mensuel || 0)
    prixPeriode = Number(row?.prix_periode || 0)
    modulesInclus = row?.modules_inclus || {}
  } else {
    // Fallback JS si la fonction SQL n'est pas (encore) déployée.
    const { data: planRow } = await admin.from('plans').select('*').eq('id', plan_id).maybeSingle()
    if (!planRow) return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
    let addonRows: any[] = []
    if (addons.length > 0) {
      const { data } = await admin.from('plans').select('*').in('code', addons)
      addonRows = data || []
    }
    prixMensuel = Number(planRow.prix_mensuel_mur || 0)
    prixPeriode = period === 'annuelle'
      ? Number(planRow.prix_annuel_mur ?? planRow.prix_mensuel_mur * 12 ?? 0)
      : prixMensuel
    modulesInclus = { ...(planRow.modules_inclus || {}) }
    for (const a of addonRows) {
      prixMensuel += Number(a.prix_mensuel_mur || 0)
      prixPeriode += period === 'annuelle'
        ? Number(a.prix_annuel_mur ?? a.prix_mensuel_mur * 12 ?? 0)
        : Number(a.prix_mensuel_mur || 0)
      for (const [k, v] of Object.entries(a.modules_inclus || {})) {
        if (v) modulesInclus[k] = true
      }
    }
  }

  // Persiste sur la société. Si certaines colonnes n'existent pas (mig 284
  // pas appliquée), on retombe sur l'écriture minimale.
  const fullPayload = {
    plan_id,
    addons_actifs: addons,
    periodicite: period,
    prix_mensuel_effectif: prixMensuel,
    prix_periode_effectif: prixPeriode,
    modules_actifs: modulesInclus,
  }
  const { error: uErr } = await admin.from('societes').update(fullPayload).eq('id', id)
  if (uErr) {
    // Tente une update partielle : seulement les colonnes qui existaient
    // avant la mig 284 (plan_id, modules_actifs).
    const fb = await admin.from('societes')
      .update({ plan_id, modules_actifs: modulesInclus })
      .eq('id', id)
    if (fb.error) return NextResponse.json({
      error: `Échec persistance : ${uErr.message}. La migration 284 doit être appliquée pour persister addons + prix.`,
    }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    prix_mensuel: prixMensuel,
    prix_periode: prixPeriode,
    modules_inclus: modulesInclus,
  })
}
