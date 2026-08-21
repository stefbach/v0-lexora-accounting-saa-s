/**
 * /api/client/jobs/[id]/facturer
 *
 * POST : gèle montant_facture = montant_facturable, passe le job en 'facture'
 *        et fige les imputations facturables validées (RPC facturer_job, mig 492).
 *        Option reclassement=true : génère l'écriture analytique de main d'œuvre
 *        (D 6422 / C 6411, taggée job_id) sur cout_temps_reel.
 *        L'écriture de vente client reste produite par le module Facturation
 *        existant (lien facture_id optionnel).
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
import { createEcrituresForReclassementJob } from '@/lib/jobcosting/ecritures'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) || {}

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
    if (!job) throw new ResourceNotFoundError('Job introuvable')
    await assertSocieteAccess(supabase, user.id, job.societe_id)

    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10)

    const { data: rpcResult, error: rpcError } = await supabase.rpc('facturer_job', {
      p_societe_id: job.societe_id,
      p_job_id: id,
      p_date: date,
      p_facture_id: typeof body.facture_id === 'string' ? body.facture_id : null,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      if (msg.includes('JOB_STATUT_INVALIDE')) return NextResponse.json({ error: msg }, { status: 409 })
      if (msg.includes('INTROUVABLE')) return NextResponse.json({ error: msg }, { status: 404 })
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    let reclassement: { ok: boolean; nb_entries: number; error?: string } | null = null
    if (body.reclassement === true && Number(job.cout_temps_reel) > 0) {
      reclassement = await createEcrituresForReclassementJob(supabase, {
        job_id: id,
        societe_id: job.societe_id,
        dossier_id: job.dossier_id,
        code: job.code,
        montant: Number(job.cout_temps_reel),
        date_ecriture: date,
      })
    }

    return NextResponse.json({ ...rpcResult, reclassement }, { status: 200 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
