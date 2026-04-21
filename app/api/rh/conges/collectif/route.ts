/**
 * POST /api/rh/conges/collectif
 *
 * Create a company-imposed collective leave period. Fans out to one
 * demandes_conges row per targeted employee (statut='approuve',
 * impose_par_societe=true, conge_collectif_id=<id>) and re-syncs the
 * AL balances (al_pris / al_impose_societe / al_impose_employe).
 *
 * Body
 *   {
 *     titre: string                           // required
 *     date_debut: 'YYYY-MM-DD'                // required
 *     date_fin:   'YYYY-MM-DD'                // required, >= date_debut
 *     type_conge: string                      // 'AL' recommended (only AL has split columns)
 *     applique_a: 'all' | 'groupe'            // default 'all'
 *     groupe_id?: string                      // required when applique_a='groupe'
 *     societe_id: string                      // target société
 *     motif?: string
 *   }
 *
 * Returns
 *   {
 *     collectif: { id, titre, date_debut, date_fin, ... },
 *     nb_employes: number,
 *     total_jours_imposes: number,
 *     details: Array<{ employe_id, nom, prenom, nb_jours, demande_id }>,
 *     errors:  Array<{ employe_id, reason }>,
 *   }
 *
 * Access control
 *   admin / super_admin / client_admin / rh / rh_manager / direction
 *   AND the caller must have access to `societe_id` via getUserSocieteIds.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'
import {
  calculateWorkingDays,
  getWorkingDaysForEmploye,
  getMauritiusPublicHolidays,
} from '@/lib/rh/calculateWorkingDays'
import { recomputeSoldeCongesAll } from '@/lib/rh/soldes-conges'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Roles permitted to impose collective leave. */
const ALLOWED_ROLES = new Set([
  'admin', 'super_admin',
  'client_admin',
  'rh', 'rh_manager',
  'direction',
])

async function loadJoursFeriesForYears(
  supabase: ReturnType<typeof getAdminClient>,
  years: number[]
): Promise<Set<string>> {
  const set = new Set<string>()
  if (years.length === 0) return set
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  try {
    const { data } = await supabase.from('jours_feries')
      .select('date, travail_autorise')
      .gte('date', `${minYear}-01-01`)
      .lte('date', `${maxYear}-12-31`)
    // Sprint 4 — exclure les jours travail_autorise=true du set de fériés.
    for (const r of data || []) {
      if (!(r as any).travail_autorise) set.add(String((r as any).date).slice(0, 10))
    }
  } catch {}
  if (set.size === 0) {
    for (const y of years) for (const h of getMauritiusPublicHolidays(y)) set.add(h)
  }
  return set
}

// B.4 — recomputeALForEmploye() supprimé au profit de recomputeSoldeCongesAll
// (helper canonique période anniversaire, mig 154-157). L'ancien helper
// filtrait demandes par année civile + UPSERT soldes_conges par {annee},
// ce qui ne matche plus le schéma period-based depuis la mig 155.

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    // Role gate
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Accès refusé — réservé aux managers RH / direction / admin.' }, { status: 403 })
    }

    const body = await request.json()
    const {
      titre,
      date_debut,
      date_fin,
      type_conge = 'AL',
      applique_a = 'all',
      groupe_id = null,
      societe_id,
      motif = null,
    } = body || {}

    // Basic validation
    if (!titre || !date_debut || !date_fin || !societe_id) {
      return NextResponse.json({ error: 'titre, date_debut, date_fin et societe_id sont requis' }, { status: 400 })
    }
    if (String(date_fin) < String(date_debut)) {
      return NextResponse.json({ error: 'date_fin doit être ≥ date_debut' }, { status: 400 })
    }
    if (applique_a !== 'all' && applique_a !== 'groupe') {
      return NextResponse.json({ error: 'applique_a doit être "all" ou "groupe"' }, { status: 400 })
    }
    if (applique_a === 'groupe' && !groupe_id) {
      return NextResponse.json({ error: 'groupe_id requis lorsque applique_a = "groupe"' }, { status: 400 })
    }

    // Tenant isolation — confirm caller has access to this societe
    const accessibleIds = await getUserSocieteIds(user.id)
    if (!accessibleIds.includes(societe_id)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette société' }, { status: 403 })
    }

    // Type-level gate — "imposable_par_societe" must not be explicitly
    // disabled for this type on the société. If every matching
    // conges_employes row (for employees of this société / this type)
    // has imposable_par_societe=false, refuse. Defaults (no row yet)
    // fall through to allow.
    const { data: societeEmpIds } = await supabase
      .from('employes').select('id').eq('societe_id', societe_id)
    const societeEmpIdList = (societeEmpIds || []).map((e: any) => e.id)
    if (societeEmpIdList.length > 0) {
      const { data: typeCfgs } = await supabase
        .from('conges_employes')
        .select('imposable_par_societe')
        .eq('type_conge', type_conge)
        .in('employe_id', societeEmpIdList)
      const cfgRows = (typeCfgs || []) as Array<{ imposable_par_societe: boolean | null }>
      if (cfgRows.length > 0 && cfgRows.every(r => r.imposable_par_societe === false)) {
        return NextResponse.json({
          error: `Le type de congé "${type_conge}" n'est pas imposable par la société selon le paramétrage actuel.`,
        }, { status: 400 })
      }
    }

    // Pick the target employees: active (date_depart null), optionally
    // filtered to a groupe_id.
    let empQuery = supabase
      .from('employes')
      .select('id, nom, prenom, societe_id, working_days, date_depart, date_arrivee, groupe_id')
      .eq('societe_id', societe_id)
      .is('date_depart', null)
    if (applique_a === 'groupe') empQuery = empQuery.eq('groupe_id', groupe_id)
    const { data: employes, error: empErr } = await empQuery
    if (empErr) return NextResponse.json({ error: `Employes: ${empErr.message}` }, { status: 500 })
    if (!employes || employes.length === 0) {
      return NextResponse.json({ error: 'Aucun employé correspondant (société / groupe / actif)' }, { status: 400 })
    }

    // Pre-load holidays for the years the range spans.
    const startYear = parseInt(String(date_debut).slice(0, 4), 10)
    const endYear = parseInt(String(date_fin).slice(0, 4), 10)
    const years: number[] = []
    for (let y = startYear; y <= endYear; y++) years.push(y)
    const feries = await loadJoursFeriesForYears(supabase, years)

    // Compute each employee's nb_jours up front so we can report the grand
    // total even before writing (and skip anyone whose working_days pattern
    // leaves the range empty — e.g. Saturday-only employee on a weekday block).
    type Row = {
      employe_id: string
      nom: string
      prenom: string
      nb_jours: number
      working_days: any
    }
    const rows: Row[] = []
    for (const emp of employes) {
      const nb = calculateWorkingDays(date_debut, date_fin, {
        workingDays: getWorkingDaysForEmploye(emp),
        joursFeries: feries,
      })
      if (nb > 0) rows.push({
        employe_id: emp.id,
        nom: emp.nom || '',
        prenom: emp.prenom || '',
        nb_jours: nb,
        working_days: emp.working_days,
      })
    }
    if (rows.length === 0) {
      return NextResponse.json({
        error: 'La période sélectionnée ne contient aucun jour ouvrable pour les employés ciblés.',
      }, { status: 400 })
    }

    // Create parent conges_collectifs row.
    const totalJours = rows.reduce((s, r) => s + r.nb_jours, 0)
    const { data: collectif, error: collectifErr } = await supabase
      .from('conges_collectifs')
      .insert({
        societe_id,
        titre,
        type_conge,
        date_debut,
        date_fin,
        applique_a,
        groupe_id: applique_a === 'groupe' ? groupe_id : null,
        motif,
        nb_employes_concernes: rows.length,
        created_by: user.id,
      })
      .select('id, titre, date_debut, date_fin, type_conge, applique_a, groupe_id, nb_employes_concernes, created_at')
      .single()
    if (collectifErr || !collectif) {
      console.error('[conges/collectif] create parent failed:', collectifErr?.message)
      return NextResponse.json({ error: `Impossible de créer le congé collectif: ${collectifErr?.message || 'erreur inconnue'}` }, { status: 500 })
    }

    // Find the RH user's employe record (stamped in approuve_par) — same
    // pattern used by POST /api/rh/conges action=approuver.
    const { data: approverEmp } = await supabase
      .from('employes').select('id').eq('auth_user_id', user.id).maybeSingle()
    const approverEmpId = approverEmp?.id || null

    // Fan out: one demandes_conges row per targeted employee, approved
    // straight away with impose_par_societe=true.
    const details: Array<{ employe_id: string; nom: string; prenom: string; nb_jours: number; demande_id: string }> = []
    const errors: Array<{ employe_id: string; reason: string }> = []
    // B.4 — On re-syncera les soldes par periode anniversaire (et non
    // plus par annee civile) : on trace les dates de reference uniques
    // (date_debut + date_fin couvrent tous les periodes possibles).
    const touchedRefDates = new Map<string, Set<string>>() // employe_id -> ISO dates

    for (const r of rows) {
      const { data: dem, error: demErr } = await supabase.from('demandes_conges').insert({
        employe_id: r.employe_id,
        type_conge,
        date_debut,
        date_fin,
        nb_jours: r.nb_jours,
        demi_journee: false,
        matin_ou_apres_midi: null,
        impose_par_societe: true,
        conge_collectif_id: collectif.id,
        statut: 'approuve',
        approuve_par: approverEmpId,
        date_decision: new Date().toISOString(),
        motif: motif || `Congé collectif imposé: ${titre}`,
      }).select('id').single()

      if (demErr || !dem) {
        errors.push({ employe_id: r.employe_id, reason: demErr?.message || 'insert failed' })
        continue
      }
      details.push({
        employe_id: r.employe_id,
        nom: r.nom,
        prenom: r.prenom,
        nb_jours: r.nb_jours,
        demande_id: dem.id,
      })

      // Track periodes impacted : un conge peut chevaucher la date
      // anniversaire de l'employe, donc on recompute pour date_debut ET
      // date_fin (couvre toutes les periodes concernees, recompute idempotent).
      const refs = touchedRefDates.get(r.employe_id) || new Set<string>()
      refs.add(String(date_debut).slice(0, 10))
      refs.add(String(date_fin).slice(0, 10))
      touchedRefDates.set(r.employe_id, refs)
    }

    // Re-sync soldes_conges pour chaque (employe, periode) impactée.
    // recomputeSoldeCongesAll est idempotent (SUM-based) et period-aware.
    if (type_conge === 'AL') {
      for (const [employeId, refs] of touchedRefDates) {
        for (const ref of refs) {
          await recomputeSoldeCongesAll(supabase, employeId, ref)
        }
      }
    }

    return NextResponse.json({
      collectif,
      nb_employes: details.length,
      total_jours_imposes: details.reduce((s, d) => s + d.nb_jours, 0),
      details,
      errors,
    }, { status: 201 })
  } catch (e: unknown) {
    console.error('[conges/collectif] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
