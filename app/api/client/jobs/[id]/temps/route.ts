/**
 * /api/client/jobs/[id]/temps
 *
 * POST : impute du temps sur un job via la RPC atomique imputer_temps_job
 *        (mig 492) — snapshot du coût horaire chargé, contrôle R5, cumul du
 *        coût du job. Contrôle applicatif §1.5 : heures imputées ≤ heures
 *        pointées (si un pointage source est fourni), avec tolérance.
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
import {
  validateImputationPayload,
  heuresPointage,
  controleHeuresJournee,
} from '@/lib/jobcosting/imputations'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
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

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, societe_id')
      .eq('id', id)
      .maybeSingle()
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
    if (!job) throw new ResourceNotFoundError('Job introuvable')
    await assertSocieteAccess(supabase, user.id, job.societe_id)

    const validated = validateImputationPayload({ ...body, job_id: id, ordre_fabrication_id: null })
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const imp = validated.data

    // Contrôle §1.5 — heures imputées ≤ heures pointées ce jour (best-effort).
    const toleranceHeures = Number(body.tolerance_heures) || 0
    const { data: dejaImput } = await supabase
      .from('imputations_temps')
      .select('heures')
      .eq('employe_id', imp.employe_id)
      .eq('date_prestation', imp.date_prestation)
    const heuresDeja = (dejaImput || []).reduce(
      (s: number, l: any) => money(s).plus(money(l.heures)).toNumber(),
      0,
    )
    let heuresPointees: number | null = null
    if (imp.pointage_id) {
      const { data: p } = await supabase
        .from('pointages')
        .select('heure_entree, heure_sortie, heure_pause_debut, heure_pause_fin')
        .eq('id', imp.pointage_id)
        .maybeSingle()
      if (p) heuresPointees = heuresPointage(p)
    }
    const controle = controleHeuresJournee(heuresDeja, imp.heures, heuresPointees, toleranceHeures)
    if (!controle.ok && body.force !== true) {
      return NextResponse.json(
        {
          error: `Heures imputées (${controle.heures_totales}h) dépassent les heures pointées (${controle.heures_pointees}h) de ${controle.depassement}h`,
          controle,
        },
        { status: 409 },
      )
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('imputer_temps_job', {
      p_societe_id: job.societe_id,
      p_employe_id: imp.employe_id,
      p_date: imp.date_prestation,
      p_heures: imp.heures,
      p_job_id: id,
      p_ordre_id: null,
      p_type_heures: imp.type_heures,
      p_facturable: imp.facturable,
      p_taux_horaire_facture: imp.taux_horaire_facture,
      p_cout_horaire_charge: imp.cout_horaire_charge,
      p_tache: imp.tache,
      p_description: imp.description,
      p_pointage_id: imp.pointage_id,
      p_saisi_par: user.id,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      if (msg.includes('PERIOD_LOCKED')) return NextResponse.json({ error: msg }, { status: 423 })
      if (msg.includes('COUT_HORAIRE_REQUIS')) return NextResponse.json({ error: msg }, { status: 422 })
      if (msg.includes('INTROUVABLE')) return NextResponse.json({ error: msg }, { status: 404 })
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({ ...rpcResult, controle }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
