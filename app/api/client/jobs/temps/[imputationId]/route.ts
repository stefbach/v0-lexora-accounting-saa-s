/**
 * /api/client/jobs/temps/[imputationId]
 *
 * PATCH  : fait évoluer le statut de validation d'une imputation
 *          (brouillon → soumis → valide/rejete). Transitions gardées.
 *          Une imputation 'facture' est immuable (trigger mig 490).
 * DELETE : supprime une imputation NON facturée et décrémente le cumul du job.
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
  peutTransitionnerValidation,
  type StatutValidation,
} from '@/lib/jobcosting/types'
import { montantFacturableTemps } from '@/lib/jobcosting/couts'
import { money } from '@/lib/money'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ imputationId: string }> }

async function loadImputation(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase.from('imputations_temps').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Lookup imputation: ${error.message}`)
  if (!data) throw new ResourceNotFoundError('Imputation introuvable')
  await assertSocieteAccess(supabase, userId, data.societe_id)
  return data
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { imputationId } = await params
    const body = await request.json().catch(() => null)
    const vers = body && typeof body.statut_validation === 'string' ? (body.statut_validation as StatutValidation) : null
    if (!vers) return NextResponse.json({ error: 'statut_validation requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const imp = await loadImputation(supabase, user.id, imputationId)

    if (!peutTransitionnerValidation(imp.statut_validation as StatutValidation, vers)) {
      return NextResponse.json(
        { error: `Transition ${imp.statut_validation} → ${vers} interdite` },
        { status: 409 },
      )
    }

    const patch: Record<string, unknown> = { statut_validation: vers }
    if (vers === 'valide') {
      patch.valide_par = user.id
      patch.valide_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('imputations_temps')
      .update(patch)
      .eq('id', imputationId)
      .select('*')
      .single()
    if (error) {
      if (String(error.message).includes('IMPUTATION_IMMUABLE')) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
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
    const { imputationId } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const imp = await loadImputation(supabase, user.id, imputationId)
    if (imp.statut_validation === 'facture') {
      return NextResponse.json({ error: 'Imputation facturée — immuable' }, { status: 409 })
    }

    const { error } = await supabase.from('imputations_temps').delete().eq('id', imputationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Décrément du cumul du job (les OF sont gérés par le module Manufacturing).
    if (imp.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('cout_temps_reel, montant_facturable')
        .eq('id', imp.job_id)
        .maybeSingle()
      if (job) {
        const facturable = montantFacturableTemps(imp.heures, imp.taux_horaire_facture, imp.facturable)
        await supabase
          .from('jobs')
          .update({
            cout_temps_reel: money(job.cout_temps_reel).minus(money(imp.cout_total)).toNumber(),
            montant_facturable: money(job.montant_facturable).minus(money(facturable)).toNumber(),
          })
          .eq('id', imp.job_id)
      }
    }
    return NextResponse.json({ ok: true, supprime: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
