/**
 * One-shot correction script.
 *
 * Walks every demandes_conges row and recomputes `nb_jours` with the
 * new calculateWorkingDays utility — i.e. respecting the employee's
 * working_days pattern and the jours_feries table. Demandes with a
 * differing value are updated. Then the soldes_conges rows of every
 * impacted employee-year-type are rebuilt by summing the freshly
 * corrected approved leaves.
 *
 * Motivating case: Jeyel Jaunky's AL 2026-02-13 → 2026-03-06 was
 * stored with nb_jours=15, but the correct Mon-Fri count (16) now
 * produced by the shared utility is off by 1. The bug was the old
 * inline Mon-Fri loop occasionally counted leaves spanning a month
 * boundary incorrectly. This script will re-emit the correct number
 * and re-sync the balances.
 *
 * Safety:
 * - Guarded behind admin / super_admin auth.
 * - Dry-run by default (?dryRun=1 or default). Pass ?apply=1 to write.
 * - Demi-journée rows (nb_jours = 0.5) are never recomputed — those
 *   come from an explicit UI choice, not from date-range math.
 * - Returns a per-row diff so the operator can audit before applying.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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

type DiffRow = {
  demande_id: string
  employe_id: string
  employe_nom?: string | null
  type_conge: string
  date_debut: string
  date_fin: string
  statut: string
  demi_journee: boolean
  nb_jours_stored: number
  nb_jours_corrected: number
  delta: number
}

export async function POST(request: Request) {
  // Auth: admin / super_admin only.
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const apply = url.searchParams.get('apply') === '1'
  const societeFilter = url.searchParams.get('societe_id')

  const supabase = getAdminClient()

  // Load all employees (we need working_days + nom for the diff) filtered
  // by societe if the caller asked for a scoped run.
  let empQuery = supabase.from('employes').select('id, societe_id, working_days, nom, prenom')
  if (societeFilter) empQuery = empQuery.eq('societe_id', societeFilter)
  const { data: employes, error: empErr } = await empQuery
  if (empErr) return NextResponse.json({ error: `Employes: ${empErr.message}` }, { status: 500 })
  const empMap = new Map<string, any>((employes || []).map((e: any) => [e.id, e]))

  // Load jours fériés from DB (years span is bounded by actual demandes below).
  const feriesByYear = new Map<number, Set<string>>()
  async function getFeriesForYear(year: number): Promise<Set<string>> {
    const cached = feriesByYear.get(year)
    if (cached) return cached
    let set = new Set<string>()
    try {
      const { data } = await supabase.from('jours_feries')
        .select('date').gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
      set = new Set((data || []).map((r: any) => String(r.date).slice(0, 10)))
    } catch { /* noop */ }
    if (set.size === 0) set = getMauritiusPublicHolidays(year)
    feriesByYear.set(year, set)
    return set
  }

  // Pull demandes in scope (optionally only employees of the chosen societe).
  let demQuery = supabase.from('demandes_conges')
    .select('id, employe_id, type_conge, date_debut, date_fin, nb_jours, demi_journee, statut')
  if (societeFilter) {
    const ids = Array.from(empMap.keys())
    if (ids.length === 0) return NextResponse.json({ ok: true, diffs: [], apply, summary: { scanned: 0, differing: 0, updated: 0 } })
    demQuery = demQuery.in('employe_id', ids)
  }
  const { data: demandes, error: demErr } = await demQuery
  if (demErr) return NextResponse.json({ error: `Demandes: ${demErr.message}` }, { status: 500 })

  const diffs: DiffRow[] = []
  // B.4 — on trace (employe_id, date_debut ISO) au lieu de (employe, annee,
  // type) : recomputeSoldeCongesAll est period-aware et gere tous les types
  // en une passe.
  const touchedRefs = new Set<string>() // `${employe_id}|${date_iso}`

  for (const d of demandes || []) {
    // Demi-journée requests carry nb_jours=0.5 by design — never recompute.
    if (d.demi_journee === true || Number(d.nb_jours) === 0.5) continue

    const emp = empMap.get(d.employe_id)
    if (!emp) continue

    const startYear = parseInt(String(d.date_debut).slice(0, 4), 10)
    const endYear = parseInt(String(d.date_fin).slice(0, 4), 10)
    const holidays = new Set<string>()
    for (let y = startYear; y <= endYear; y++) {
      for (const h of await getFeriesForYear(y)) holidays.add(h)
    }

    const corrected = calculateWorkingDays(d.date_debut, d.date_fin, {
      workingDays: getWorkingDaysForEmploye(emp),
      joursFeries: holidays,
    })

    const stored = Number(d.nb_jours) || 0
    if (corrected === stored) continue

    diffs.push({
      demande_id: d.id,
      employe_id: d.employe_id,
      employe_nom: emp ? `${emp.prenom} ${emp.nom}` : null,
      type_conge: d.type_conge,
      date_debut: d.date_debut,
      date_fin: d.date_fin,
      statut: d.statut,
      demi_journee: !!d.demi_journee,
      nb_jours_stored: stored,
      nb_jours_corrected: corrected,
      delta: corrected - stored,
    })
  }

  let updated = 0
  let soldesSynced = 0
  if (apply && diffs.length > 0) {
    // Patch demandes_conges one by one (small volume expected) so we can
    // log individual errors without aborting the whole run.
    for (const diff of diffs) {
      const { error } = await supabase.from('demandes_conges')
        .update({ nb_jours: diff.nb_jours_corrected })
        .eq('id', diff.demande_id)
      if (error) {
        console.error(`[recompute-conges-nb-jours] update failed for ${diff.demande_id}: ${error.message}`)
        continue
      }
      updated++
      if (diff.statut === 'approuve' && (diff.type_conge === 'AL' || diff.type_conge === 'SL')) {
        touchedRefs.add(`${diff.employe_id}|${String(diff.date_debut).slice(0, 10)}`)
      }
    }

    // B.4 — Re-sync soldes_conges via le helper canonique period-aware.
    // Une passe par (employe, date_debut) suffit : recomputeSoldeCongesAll
    // recalcule toute la période contenant date_debut, tous types confondus.
    for (const key of touchedRefs) {
      const [employeId, dateRef] = key.split('|')
      await recomputeSoldeCongesAll(supabase, employeId, dateRef)
      soldesSynced++
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    summary: {
      scanned: (demandes || []).length,
      differing: diffs.length,
      updated,
      soldes_synced: soldesSynced,
    },
    diffs,
  })
}
