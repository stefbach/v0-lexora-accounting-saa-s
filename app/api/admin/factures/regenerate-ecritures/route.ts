/**
 * Batch regeneration of accounting entries for invoices that don't have any.
 *
 * Historical bug : certaines factures (client et fournisseur) n'ont jamais
 * généré d'écritures comptables, souvent quand elles ont été créées via
 * l'OCR (pipeline upload) au lieu du formulaire "nouvelle facture".
 *
 * Cet endpoint:
 *  - GET  : preview (combien de factures sans écritures, par société/type/devise)
 *  - POST : regénère via createEcrituresForFacture (réutilise la vraie logique)
 *
 * Admin/super_admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ALLOWED_ROLES = ['admin', 'super_admin']

async function assertAdmin(request: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  }
  const { data: profile } = await supa.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role as string | undefined
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin requis' }, { status: 403 }) }
  }
  return { ok: true, userId: user.id }
}

export async function GET(request: NextRequest) {
  const check = await assertAdmin(request)
  if (!check.ok) return check.response

  const admin = getAdminClient()

  // Récupère toutes les factures avec montant > 0 mais sans écritures liées
  const { data: factures, error } = await admin
    .from('factures')
    .select('id, numero_facture, type_facture, devise, statut, montant_ttc, montant_mur, montant_ht, montant_tva, date_facture, societe_id, tiers')
    .gt('montant_ttc', 0)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ids = (factures ?? []).map(f => f.id)
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, total: 0, sans_ecritures: 0, breakdown: [] })
  }

  const { data: ecrs } = await admin
    .from('ecritures_comptables_v2')
    .select('facture_id')
    .in('facture_id', ids)

  const facturesAvecEcritures = new Set((ecrs ?? []).map(e => e.facture_id))
  const sansEcritures = (factures ?? []).filter(f => !facturesAvecEcritures.has(f.id))

  // Breakdown par type/devise/statut
  const breakdown: Record<string, { count: number; total_mur: number }> = {}
  for (const f of sansEcritures) {
    const key = `${f.type_facture}/${f.devise}/${f.statut}`
    if (!breakdown[key]) breakdown[key] = { count: 0, total_mur: 0 }
    breakdown[key].count++
    breakdown[key].total_mur += Number(f.montant_mur ?? f.montant_ttc ?? 0)
  }

  return NextResponse.json({
    ok: true,
    total: factures?.length ?? 0,
    sans_ecritures: sansEcritures.length,
    breakdown,
    sample: sansEcritures.slice(0, 10).map(f => ({
      id: f.id, numero_facture: f.numero_facture, type: f.type_facture,
      devise: f.devise, statut: f.statut, montant_ttc: f.montant_ttc, montant_mur: f.montant_mur,
    })),
  })
}

export async function POST(request: NextRequest) {
  const check = await assertAdmin(request)
  if (!check.ok) return check.response

  const body = await request.json().catch(() => ({})) as {
    dry_run?: boolean
    societe_id?: string
    type_facture?: 'client' | 'fournisseur'
    devise?: string
    limit?: number
  }

  const dryRun = body.dry_run === true
  const limit = Math.min(body.limit ?? 500, 500)

  const admin = getAdminClient()

  // Base query
  let query = admin
    .from('factures')
    .select('id, numero_facture, type_facture, devise, statut, montant_ttc, montant_mur, montant_ht, montant_tva, date_facture, societe_id, tiers, dossier_id')
    .gt('montant_ttc', 0)
    .order('date_facture', { ascending: true })
    .limit(limit)

  if (body.societe_id) query = query.eq('societe_id', body.societe_id)
  if (body.type_facture) query = query.eq('type_facture', body.type_facture)
  if (body.devise) query = query.eq('devise', body.devise)

  const { data: factures, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (factures ?? []).map(f => f.id)
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, succeeded: 0, failed: 0, dry_run: dryRun })
  }

  const { data: ecrs } = await admin
    .from('ecritures_comptables_v2')
    .select('facture_id')
    .in('facture_id', ids)

  const facturesAvecEcritures = new Set((ecrs ?? []).map(e => e.facture_id))
  const aTraiter = (factures ?? []).filter(f => !facturesAvecEcritures.has(f.id))

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      would_process: aTraiter.length,
      sample: aTraiter.slice(0, 20).map(f => ({
        id: f.id, numero_facture: f.numero_facture, type: f.type_facture,
        devise: f.devise, montant_ttc: f.montant_ttc, montant_mur: f.montant_mur,
      })),
    })
  }

  // Processing réel
  const results = { processed: 0, succeeded: 0, failed: 0, errors: [] as { id: string; error: string }[] }

  for (const f of aTraiter) {
    results.processed++
    try {
      // Utilise montant_mur pour les factures étrangères (déjà converti en MUR)
      const montantHtMur = f.devise === 'MUR' ? Number(f.montant_ht || 0) : Number(f.montant_ht || 0) * (Number(f.montant_mur || 0) / Math.max(Number(f.montant_ttc || 1), 1))
      const montantTvaMur = f.devise === 'MUR' ? Number(f.montant_tva || 0) : Number(f.montant_tva || 0) * (Number(f.montant_mur || 0) / Math.max(Number(f.montant_ttc || 1), 1))
      const montantTtcMur = Number(f.montant_mur || f.montant_ttc || 0)

      await createEcrituresForFacture(admin, {
        id: f.id,
        societe_id: f.societe_id,
        numero_facture: f.numero_facture,
        tiers: f.tiers || 'Tiers inconnu',
        date_facture: f.date_facture,
        montant_ht: montantHtMur,
        montant_tva: montantTvaMur,
        montant_ttc: montantTtcMur,
        type_facture: f.type_facture as 'client' | 'fournisseur',
      })
      results.succeeded++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[regenerate-ecritures] failed for ${f.id}:`, msg)
      results.failed++
      results.errors.push({ id: f.id, error: msg })
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: false,
    ...results,
    processed_ids: aTraiter.slice(0, 10).map(f => ({ id: f.id, numero: f.numero_facture })),
  })
}
