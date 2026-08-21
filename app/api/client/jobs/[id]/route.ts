/**
 * /api/client/jobs/[id]
 *
 * GET    : fiche job — en-tête + imputations de temps + dépenses + rentabilité
 *          calculée (coût de revient, marge, avancement budget).
 * PATCH  : modifier l'en-tête ou faire évoluer le statut (transitions gardées).
 * DELETE : annulation logique (statut='annule') — pas de hard delete.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'
import { validateJobPayload } from '@/lib/jobcosting/jobs'
import { peutTransitionnerJob, type StatutJob } from '@/lib/jobcosting/types'
import { rentabiliteJob } from '@/lib/jobcosting/couts'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

async function loadJob(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Lookup job: ${error.message}`)
  if (!data) throw new ResourceNotFoundError('Job introuvable')
  await assertSocieteAccess(supabase, userId, data.societe_id)
  return data
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const job = await loadJob(supabase, user.id, id)

    const [tempsRes, depensesRes] = await Promise.all([
      supabase
        .from('imputations_temps')
        .select('*, employes(nom, prenom, code)')
        .eq('job_id', id)
        .order('date_prestation', { ascending: false }),
      supabase
        .from('depenses_job')
        .select('*')
        .eq('job_id', id)
        .order('date_depense', { ascending: false }),
    ])
    if (tempsRes.error) return NextResponse.json({ error: tempsRes.error.message }, { status: 500 })
    if (depensesRes.error) return NextResponse.json({ error: depensesRes.error.message }, { status: 500 })

    const heuresImputees = (tempsRes.data || []).reduce(
      (s: any, l: any) => money(s).plus(money(l.heures)).toNumber(),
      0,
    )

    const rentabilite = rentabiliteJob({
      cout_temps_reel: job.cout_temps_reel,
      cout_depenses_reel: job.cout_depenses_reel,
      montant_facturable: job.montant_facturable,
      montant_facture: job.montant_facture,
      budget_montant: job.budget_montant,
      budget_heures: job.budget_heures,
      heures_imputees: heuresImputees,
    })

    return NextResponse.json({
      item: job,
      temps: tempsRes.data || [],
      depenses: depensesRes.data || [],
      heures_imputees: heuresImputees,
      rentabilite,
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const job = await loadJob(supabase, user.id, id)

    const patch: Record<string, unknown> = {}

    // Transition de statut (gardée) séparée de l'édition d'en-tête.
    if (typeof body.statut === 'string' && body.statut !== job.statut) {
      if (!peutTransitionnerJob(job.statut as StatutJob, body.statut as StatutJob)) {
        return NextResponse.json(
          { error: `Transition ${job.statut} → ${body.statut} interdite` },
          { status: 409 },
        )
      }
      patch.statut = body.statut
      if (body.statut === 'cloture') patch.date_cloture = new Date().toISOString().slice(0, 10)
    }

    // Édition d'en-tête : revalidée sur l'état fusionné.
    if (Object.keys(body).some((k) => k !== 'statut' && k !== 'societe_id')) {
      const validated = validateJobPayload({ ...job, ...body })
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
      Object.assign(patch, validated.data)
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ item: job })
    }

    const { data, error } = await supabase.from('jobs').update(patch).eq('id', id).select('*').single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Code job déjà utilisé' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await loadJob(supabase, user.id, id)

    const { error } = await supabase.from('jobs').update({ statut: 'annule' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, annule: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
