/**
 * /api/client/jobs/[id]/consommation
 *
 * POST : consomme du stock (lib inventaire du socle) et l'impute au job via la
 *        RPC atomique consommer_stock_job (mig 492) — sortie valorisée au CUMP,
 *        dépense achat_materiel créée, cumul cout_depenses_reel mis à jour.
 *        Génère l'écriture de destockage équilibrée taggée job_id (D 6037 / C 3701).
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
import { validateConsommationStockPayload } from '@/lib/jobcosting/depenses'
import { createEcrituresForConsommationJob } from '@/lib/jobcosting/ecritures'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Dépôt cible : celui fourni, sinon le dépôt par défaut de la société. */
async function resolveDepot(supabase: any, societeId: string, depotId: string | null): Promise<string> {
  if (depotId) {
    const { data } = await supabase
      .from('depots')
      .select('id')
      .eq('id', depotId)
      .eq('societe_id', societeId)
      .maybeSingle()
    if (!data) throw new Error('DEPOT_INTROUVABLE: dépôt inconnu pour cette société')
    return data.id
  }
  const { data: defaut } = await supabase
    .from('depots')
    .select('id')
    .eq('societe_id', societeId)
    .eq('actif', true)
    .order('est_defaut', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!defaut) throw new Error('DEPOT_INTROUVABLE: aucun dépôt actif pour cette société')
  return defaut.id
}

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
      .select('id, societe_id, dossier_id')
      .eq('id', id)
      .maybeSingle()
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
    if (!job) throw new ResourceNotFoundError('Job introuvable')
    await assertSocieteAccess(supabase, user.id, job.societe_id)

    const validated = validateConsommationStockPayload(body)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const c = validated.data

    const depotId = await resolveDepot(supabase, job.societe_id, c.depot_id)

    const { data: rpcResult, error: rpcError } = await supabase.rpc('consommer_stock_job', {
      p_societe_id: job.societe_id,
      p_job_id: id,
      p_produit_id: c.produit_id,
      p_depot_id: depotId,
      p_quantite: c.quantite,
      p_date: c.date_mouvement,
      p_facturable: c.facturable,
      p_marge_pct: c.marge_refacturation_pct,
      p_motif: c.motif,
      p_cree_par: user.id,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      if (msg.includes('STOCK_INSUFFISANT')) return NextResponse.json({ error: msg }, { status: 409 })
      if (msg.includes('PERIOD_LOCKED')) return NextResponse.json({ error: msg }, { status: 423 })
      if (msg.includes('INTROUVABLE')) return NextResponse.json({ error: msg }, { status: 404 })
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { data: produit } = await supabase
      .from('produits')
      .select('sku, designation, compte_stock, compte_variation_stock')
      .eq('id', c.produit_id)
      .single()

    const ecritures = await createEcrituresForConsommationJob(supabase, {
      mouvement_id: String(rpcResult?.mouvement_id || ''),
      societe_id: job.societe_id,
      dossier_id: job.dossier_id,
      job_id: id,
      valeur_mouvement: Number(rpcResult?.valeur_mouvement) || 0,
      date_mouvement: c.date_mouvement,
      quantite: c.quantite,
      designation: produit?.designation || '?',
      sku: produit?.sku || '?',
      compte_stock: produit?.compte_stock,
      compte_variation_stock: produit?.compte_variation_stock,
    })

    return NextResponse.json(
      { ...rpcResult, ecritures: { ok: ecritures.ok, nb_entries: ecritures.nb_entries, error: ecritures.error } },
      { status: 201 },
    )
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    const msg = e?.message || 'Erreur'
    return NextResponse.json({ error: msg }, { status: String(msg).includes('DEPOT_INTROUVABLE') ? 404 : 500 })
  }
}
