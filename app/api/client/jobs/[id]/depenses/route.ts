/**
 * /api/client/jobs/[id]/depenses
 *
 * POST : ajoute une dépense non-salariale à un job et met à jour les cumuls
 *        (cout_depenses_reel, montant_facturable). Les dépenses issues d'une
 *        consommation de stock passent par /consommation (RPC dédiée).
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
import { validateDepensePayload } from '@/lib/jobcosting/depenses'
import { montantRefacturableDepense } from '@/lib/jobcosting/couts'
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
      .select('id, societe_id, cout_depenses_reel, montant_facturable')
      .eq('id', id)
      .maybeSingle()
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
    if (!job) throw new ResourceNotFoundError('Job introuvable')
    await assertSocieteAccess(supabase, user.id, job.societe_id)

    const validated = validateDepensePayload(body)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const dep = validated.data

    const { data: inserted, error } = await supabase
      .from('depenses_job')
      .insert({ ...dep, job_id: id, societe_id: job.societe_id, cree_par: user.id })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const facturable = montantRefacturableDepense(dep.montant_ht, dep.marge_refacturation_pct, dep.facturable)
    const { error: updErr } = await supabase
      .from('jobs')
      .update({
        cout_depenses_reel: money(job.cout_depenses_reel).plus(money(dep.montant_ht)).toNumber(),
        montant_facturable: money(job.montant_facturable).plus(money(facturable)).toNumber(),
      })
      .eq('id', id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ item: inserted, montant_facturable: facturable }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
