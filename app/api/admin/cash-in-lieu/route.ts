/**
 * /api/admin/cash-in-lieu — Gestion des paiements compensatoires WRA S.45/S.47.
 *
 * Routes (toutes auth admin/super_admin):
 *   GET  ?jours_avance=30
 *     → liste cycles AL se fermant dans les N jours (RPC detect_cycles_a_clore)
 *   POST { action: 'generer', employe_id, cycle_debut, cycle_fin, periode_bulletin?, commentaire? }
 *     → crée 1 paiement en_attente
 *   POST { action: 'generer-tous', periode_bulletin, jours_avance?, dry_run?: bool }
 *     → batch sur tous les cycles à clore (idempotent via UNIQUE)
 *   POST { action: 'valider', paiement_id }
 *     → en_attente → valide
 *   DELETE ?id=...
 *     → annule un paiement en_attente
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  detectCyclesAClore,
  calculerMontantCashInLieu,
  genererPaiementCompensation,
  validerPaiementCompensation,
  annulerPaiementCompensation,
} from '@/lib/rh/cash-in-lieu'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function checkAdminAuth() {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { ok: false, error: 'Unauthorized', status: 401, user: null }
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Forbidden — admin/super_admin only', status: 403, user: null }
  }
  return { ok: true, error: null, status: 200, user }
}

export async function GET(request: Request) {
  const auth = await checkAdminAuth()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const joursAvance = Math.max(1, Math.min(180, parseInt(searchParams.get('jours_avance') || '30', 10)))

  const supabase = getAdminClient()
  const cycles = await detectCyclesAClore(supabase, joursAvance)

  // Historique des paiements (statut != en_attente uniquement, pour audit)
  const { data: historique } = await supabase
    .from('paiements_conges_compensation')
    .select(`
      id, employe_id, societe_id, type_conge, cycle_debut, cycle_fin,
      jours_payes_compensation, montant_total, statut, motif,
      bulletin_paie_id, periode_bulletin, cree_le, valide_le, paye_le
    `)
    .order('cree_le', { ascending: false })
    .limit(100)

  return NextResponse.json({
    cycles_a_clore: cycles,
    historique: historique || [],
    jours_avance: joursAvance,
  })
}

export async function POST(request: Request) {
  const auth = await checkAdminAuth()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const action = body.action as string

  const supabase = getAdminClient()

  // ── action: generer (1 employé) ─────────────────────────────────────
  if (action === 'generer') {
    const { employe_id, cycle_debut, cycle_fin, periode_bulletin, commentaire } = body
    if (!employe_id || !cycle_debut || !cycle_fin) {
      return NextResponse.json({ error: 'employe_id, cycle_debut, cycle_fin requis' }, { status: 400 })
    }
    const { data: emp } = await supabase
      .from('employes').select('id, societe_id, salaire_base').eq('id', employe_id).maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Employe non trouve' }, { status: 404 })

    const { data: solde } = await supabase
      .from('soldes_conges')
      .select('al_droit, al_pris, al_solde')
      .eq('employe_id', employe_id)
      .eq('periode_debut', cycle_debut)
      .eq('periode_fin', cycle_fin)
      .maybeSingle()
    if (!solde) return NextResponse.json({ error: 'Solde du cycle non trouve' }, { status: 404 })

    const jours = Number(solde.al_solde) || 0
    if (jours <= 0) {
      return NextResponse.json({ error: 'Aucun solde AL a payer pour ce cycle' }, { status: 400 })
    }
    const salaireBase = Number(emp.salaire_base) || 0
    const { montantParJour, montantTotal } = calculerMontantCashInLieu(salaireBase, jours)

    const result = await genererPaiementCompensation(supabase, {
      employe_id,
      societe_id: emp.societe_id,
      type_conge: 'AL',
      cycle_debut,
      cycle_fin,
      jours_droit: Number(solde.al_droit) || 0,
      jours_pris: Number(solde.al_pris) || 0,
      jours_payes_compensation: jours,
      montant_par_jour: montantParJour,
      montant_total: montantTotal,
      periode_bulletin: periode_bulletin || null,
      cree_par: auth.user!.id,
      commentaire: commentaire || null,
    })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json({
      paiement_id: result.id,
      already_exists: result.alreadyExists,
      montant_total: montantTotal,
    })
  }

  // ── action: generer-tous (batch sur tous les cycles a clore) ─────────
  if (action === 'generer-tous') {
    const periodeBulletin = body.periode_bulletin as string
    const joursAvance = Math.max(1, Math.min(180, parseInt(body.jours_avance || '30', 10)))
    const dryRun = body.dry_run === true
    if (!periodeBulletin) {
      return NextResponse.json({ error: 'periode_bulletin requis (YYYY-MM-DD)' }, { status: 400 })
    }
    const cycles = await detectCyclesAClore(supabase, joursAvance)
    const eligibles = cycles.filter(c => !c.deja_paye && c.al_solde_a_payer > 0)

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        nb_eligibles: eligibles.length,
        cycles: eligibles,
        montant_total_estime: eligibles.reduce((s, c) => s + c.montant_estime, 0),
      })
    }

    const created: Array<{ employe_id: string; paiement_id: string | null; montant: number; already: boolean }> = []
    const errors: Array<{ employe_id: string; error: string }> = []
    for (const c of eligibles) {
      const { montantParJour, montantTotal } = calculerMontantCashInLieu(c.salaire_base, c.al_solde_a_payer)
      const r = await genererPaiementCompensation(supabase, {
        employe_id: c.employe_id,
        societe_id: c.societe_id,
        type_conge: 'AL',
        cycle_debut: c.cycle_debut,
        cycle_fin: c.cycle_fin,
        jours_droit: c.al_droit,
        jours_pris: c.al_pris,
        jours_payes_compensation: c.al_solde_a_payer,
        montant_par_jour: montantParJour,
        montant_total: montantTotal,
        periode_bulletin: periodeBulletin,
        cree_par: auth.user!.id,
      })
      if (r.error) errors.push({ employe_id: c.employe_id, error: r.error })
      else created.push({ employe_id: c.employe_id, paiement_id: r.id, montant: montantTotal, already: r.alreadyExists })
    }
    return NextResponse.json({
      nb_traites: created.length,
      nb_erreurs: errors.length,
      created,
      errors,
      montant_total: created.reduce((s, c) => s + c.montant, 0),
    })
  }

  // ── action: valider ─────────────────────────────────────────────────
  if (action === 'valider') {
    const paiementId = body.paiement_id as string
    if (!paiementId) return NextResponse.json({ error: 'paiement_id requis' }, { status: 400 })
    const r = await validerPaiementCompensation(supabase, paiementId, auth.user!.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 })
}

export async function DELETE(request: Request) {
  const auth = await checkAdminAuth()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const paiementId = searchParams.get('id')
  const commentaire = searchParams.get('commentaire') || undefined
  if (!paiementId) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const supabase = getAdminClient()
  const r = await annulerPaiementCompensation(supabase, paiementId, commentaire)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
