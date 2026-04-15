import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'
import {
  calculateWorkingDays,
  getMauritiusPublicHolidays,
  getWorkingDaysForEmploye,
} from '@/lib/rh/calculateWorkingDays'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/* getUserSocieteIds imported from @/lib/rh/access — handles all roles including admin, client_admin, comptable, rh */
/* calculateWorkingDays / getMauritiusPublicHolidays / getWorkingDaysForEmploye imported from @/lib/rh/calculateWorkingDays — shared with depart/route.ts */

/**
 * Load jours_feries from DB for a given year (Mauritius). Returns a Set
 * of 'YYYY-MM-DD' strings. Falls back to the hardcoded MU calendar for
 * that year if the DB call fails or returns an empty set.
 */
async function loadJoursFeriesForYear(
  supabase: ReturnType<typeof getAdminClient>,
  year: number
): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('jours_feries')
      .select('date')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
    const set = new Set<string>((data || []).map((r: any) => String(r.date).slice(0, 10)))
    if (set.size > 0) return set
  } catch {
    // Fall through to hardcoded fallback below
  }
  return getMauritiusPublicHolidays(year)
}

/**
 * Compute nb_jours for a leave request using the employee's `working_days`
 * pattern and the applicable jours_feries (DB-backed, with hardcoded MU
 * fallback). Expects `dateDebut`/`dateFin` as 'YYYY-MM-DD'.
 */
async function computeNbJoursForEmploye(
  supabase: ReturnType<typeof getAdminClient>,
  employeId: string,
  dateDebut: string,
  dateFin: string
): Promise<number> {
  const { data: emp } = await supabase
    .from('employes')
    .select('working_days')
    .eq('id', employeId)
    .maybeSingle()
  const workingDays = getWorkingDaysForEmploye(emp)

  const startYear = parseInt(dateDebut.slice(0, 4), 10)
  const endYear = parseInt(dateFin.slice(0, 4), 10)
  const holidays = new Set<string>()
  for (let y = startYear; y <= endYear; y++) {
    for (const h of await loadJoursFeriesForYear(supabase, y)) holidays.add(h)
  }

  return calculateWorkingDays(dateDebut, dateFin, { workingDays, joursFeries: holidays })
}

/**
 * Backwards-compatible sync helper matching the previous local signature.
 * Used by call sites that don't yet have the employee ID at hand
 * (sick-cert alert detector). Uses Mon–Fri + hardcoded MU holidays.
 */
function countWorkingDays(dateDebut: string, dateFin: string): number {
  return calculateWorkingDays(dateDebut, dateFin)
}

/**
 * Recompute and persist the annual balance row for an employee from the
 * current set of demandes_conges with statut='approuve'. This is the
 * canonical source-of-truth recalculation used whenever a demande
 * transitions into or out of the approuve bucket (approval, refusal of a
 * previously approved leave, cancellation, deletion). Idempotent by
 * design — repeated calls converge to the same result.
 *
 * Type-specific behaviour:
 *
 *   AL  → upsert soldes_conges with al_pris, al_impose_societe and
 *         al_impose_employe (split by the impose_par_societe flag on
 *         each demande). Invariant:
 *             al_pris = al_impose_societe + al_impose_employe
 *
 *   SL  → upsert soldes_conges with sl_pris (sum of approved SL days).
 *
 *   MAT → upsert conges_employes row (type_conge='MAT') with jours_pris
 *         set to the sum of approved MAT days for the year. Default
 *         jours_droit = 112 (16 weeks calendar days, WRA 2019 §52) on
 *         first insert; pre-existing rows keep their jours_droit.
 *
 *   PAT → same pattern as MAT but with default jours_droit = 28
 *         (4 weeks calendar days, WRA 2019 §53) and type_conge='PAT'.
 *
 *   Other types (UL, CAR, WI, COM, PH, ABS) → no-op. UL is deducted
 *   monthly in paie via calculer_batch; the rest don't accumulate.
 *
 * Never throws — logs a warning on failure so callers don't break.
 */
async function recomputeSoldeConges(
  supabase: ReturnType<typeof getAdminClient>,
  employeId: string,
  typeConge: string,
  annee: number = new Date().getFullYear()
): Promise<void> {
  try {
    if (typeConge === 'AL') {
      // Pull approved AL rows with the impose flag to compute the split.
      const { data: approved } = await supabase
        .from('demandes_conges')
        .select('nb_jours, impose_par_societe')
        .eq('employe_id', employeId)
        .eq('type_conge', 'AL')
        .eq('statut', 'approuve')
        .gte('date_debut', `${annee}-01-01`)
        .lte('date_debut', `${annee}-12-31`)

      let imposeSociete = 0
      let imposeEmploye = 0
      for (const c of approved || []) {
        const n = Number(c.nb_jours) || 0
        if (c.impose_par_societe === true) imposeSociete += n
        else imposeEmploye += n
      }
      const totalPris = Math.round((imposeSociete + imposeEmploye) * 100) / 100
      imposeSociete = Math.round(imposeSociete * 100) / 100
      imposeEmploye = Math.round(imposeEmploye * 100) / 100

      const { data: existing } = await supabase
        .from('soldes_conges').select('id')
        .eq('employe_id', employeId).eq('annee', annee).maybeSingle()

      if (existing) {
        await supabase.from('soldes_conges').update({
          al_pris: totalPris,
          al_impose_societe: imposeSociete,
          al_impose_employe: imposeEmploye,
        }).eq('id', existing.id)
      } else {
        await supabase.from('soldes_conges').insert({
          employe_id: employeId,
          annee,
          al_droit: 22,
          al_pris: totalPris,
          al_impose_societe: imposeSociete,
          al_impose_employe: imposeEmploye,
          sl_droit: 15,
          sl_pris: 0,
        })
      }
      console.log(`[conges] Solde AL recomputed: pris=${totalPris} (société=${imposeSociete}, employé=${imposeEmploye}) employe=${employeId} annee=${annee}`)
      return
    }

    if (typeConge === 'SL') {
      const { data: approved } = await supabase
        .from('demandes_conges').select('nb_jours')
        .eq('employe_id', employeId).eq('type_conge', 'SL').eq('statut', 'approuve')
        .gte('date_debut', `${annee}-01-01`).lte('date_debut', `${annee}-12-31`)

      const totalPris = Math.round(
        (approved || []).reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0) * 100
      ) / 100

      const { data: existing } = await supabase
        .from('soldes_conges').select('id')
        .eq('employe_id', employeId).eq('annee', annee).maybeSingle()

      if (existing) {
        await supabase.from('soldes_conges').update({ sl_pris: totalPris }).eq('id', existing.id)
      } else {
        await supabase.from('soldes_conges').insert({
          employe_id: employeId,
          annee,
          al_droit: 22, al_pris: 0, al_impose_societe: 0, al_impose_employe: 0,
          sl_droit: 15, sl_pris: totalPris,
        })
      }
      console.log(`[conges] Solde SL recomputed: pris=${totalPris} employe=${employeId} annee=${annee}`)
      return
    }

    if (typeConge === 'MAT' || typeConge === 'PAT') {
      // MAT/PAT accumulate in conges_employes (per-type, per-year row).
      // jours_droit = WRA 2019 default on insert; left alone on update.
      const { data: approved } = await supabase
        .from('demandes_conges').select('nb_jours')
        .eq('employe_id', employeId).eq('type_conge', typeConge).eq('statut', 'approuve')
        .gte('date_debut', `${annee}-01-01`).lte('date_debut', `${annee}-12-31`)

      const totalPris = Math.round(
        (approved || []).reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0) * 100
      ) / 100

      const defaultDroit = typeConge === 'MAT' ? 112 : 28
      const { data: existing } = await supabase
        .from('conges_employes').select('id, jours_droit')
        .eq('employe_id', employeId).eq('annee', annee).eq('type_conge', typeConge)
        .maybeSingle()

      if (existing) {
        await supabase.from('conges_employes').update({
          jours_pris: totalPris,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        await supabase.from('conges_employes').insert({
          employe_id: employeId,
          annee,
          type_conge: typeConge,
          jours_droit: defaultDroit,
          jours_pris: totalPris,
        })
      }
      console.log(`[conges] ${typeConge} recomputed: pris=${totalPris} employe=${employeId} annee=${annee}`)
      return
    }

    // Other types (UL, CAR, WI, COM, PH, ABS): no balance tracking.
  } catch (err: any) {
    console.warn(`[conges] recomputeSoldeConges failed (non-blocking):`, err?.message)
  }
}

/** Calculate prorata AL entitlement based on hire date (Mauritius WRA 2019: 20 days/year) */
/**
 * Calculate Annual Leave entitlement based on WRA 2019 rules:
 * - Year 1 (first 12 months): 0 days for months 1-6, then 1 day/month from month 7 (max 6 days)
 * - Year 2+: 22 days (20 + 2 additional) in full from the contract anniversary date
 *
 * @param dateArrivee - Employee hire date (ISO string)
 * @param year - The year we're calculating for
 * @param today - Reference date for "today" (defaults to now)
 */
function calculateALEntitlement(dateArrivee: string | null, year: number, today?: Date): number {
  if (!dateArrivee) return 22 // No hire date = assume full entitlement

  const hireDate = new Date(dateArrivee + 'T00:00:00')
  const refDate = today || new Date()

  // Calculate months of service at refDate
  const monthsOfService = (refDate.getFullYear() - hireDate.getFullYear()) * 12 + (refDate.getMonth() - hireDate.getMonth())

  // Before 6 months of service: 0 days (probation)
  if (monthsOfService < 6) return 0

  // 6-12 months: 1 day/month from month 7 (max 6 days in year 1)
  if (monthsOfService < 12) {
    return Math.min(monthsOfService - 6, 6)
  }

  // 12+ months: full entitlement 22 days
  // Counter resets on each anniversary. Check if anniversary has passed this year.
  // The year parameter represents the calendar year being queried.
  // We return the entitlement FOR that year, based on anniversary-aligned reference period.
  const anniversaryThisYear = new Date(year, hireDate.getMonth(), hireDate.getDate())
  const hasAnniversaryPassed = refDate >= anniversaryThisYear

  // If the reference year is before the first anniversary year, use year-1 rules
  const firstAnniversaryYear = hireDate.getFullYear() + 1
  if (year < firstAnniversaryYear) {
    // Still in year 1 — use partial entitlement
    const monthsAtEndOfYear = Math.min(12, 12 - hireDate.getMonth())
    if (monthsAtEndOfYear < 6) return 0
    return Math.min(monthsAtEndOfYear - 6, 6)
  }

  // Year 2+: Full 22 days. Counter available from anniversary date.
  return 22
}

/**
 * Calculate Sick Leave entitlement based on WRA 2019 rules:
 * - Year 1: same as AL — 0 days months 1-6, 1 day/month from month 7 (max 6 days)
 * - Year 2+: 15 days in full, cumulative if not taken
 */
function calculateSLEntitlement(dateArrivee: string | null, year: number, today?: Date): number {
  if (!dateArrivee) return 15

  const hireDate = new Date(dateArrivee + 'T00:00:00')
  const refDate = today || new Date()
  const monthsOfService = (refDate.getFullYear() - hireDate.getFullYear()) * 12 + (refDate.getMonth() - hireDate.getMonth())

  // Before 6 months: 0 days
  if (monthsOfService < 6) return 0

  // Between 6 and 12 months: 1 day per month from month 7 (max 6 days)
  if (monthsOfService < 12) {
    return Math.min(monthsOfService - 6, 6)
  }

  // 12+ months: 15 days per year (cumulative — accumulated balance handled separately)
  return 15
}

/** Detect consecutive sick leave days > 3 for an employee */
function detectSickCertAlert(slRecords: any[]): boolean {
  if (slRecords.length === 0) return false
  const sorted = [...slRecords].sort((a, b) => a.date_debut.localeCompare(b.date_debut))
  // Check individual records
  for (const rec of sorted) {
    const days = countWorkingDays(rec.date_debut, rec.date_fin)
    if (days > 3) return true
  }
  // Check consecutive separate SL records that together span > 3 days
  let consecutiveDays = 0
  let lastEnd: Date | null = null
  for (const rec of sorted) {
    const start = new Date(rec.date_debut + 'T12:00:00')
    const end = new Date(rec.date_fin + 'T12:00:00')
    const days = countWorkingDays(rec.date_debut, rec.date_fin)
    if (lastEnd) {
      const gap = new Date(lastEnd)
      gap.setDate(gap.getDate() + 1)
      while (gap.getDay() === 0 || gap.getDay() === 6) gap.setDate(gap.getDate() + 1)
      if (start <= gap) {
        consecutiveDays += days
      } else {
        consecutiveDays = days
      }
    } else {
      consecutiveDays = days
    }
    lastEnd = end
    if (consecutiveDays > 3) return true
  }
  return false
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    const societe_id = searchParams.get('societe_id')
    const statut = searchParams.get('statut')
    const action = searchParams.get('action')

    // 1) Determine accessible societes
    let societeIds: string[]

    // Self-service: if employe_id is passed and matches the logged-in user, allow direct access
    if (employe_id) {
      const { data: selfEmp } = await supabase.from('employes').select('id, societe_id, auth_user_id, email').eq('id', employe_id).maybeSingle()
      const isSelf = selfEmp && (selfEmp.auth_user_id === user.id || selfEmp.email === user.email)
      if (isSelf) {
        societeIds = [selfEmp.societe_id]
      } else {
        societeIds = await getUserSocieteIds(user.id)
      }
    } else if (societe_id) {
      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise a cette societe' }, { status: 403 })
      }
      societeIds = [societe_id]
    } else {
      societeIds = await getUserSocieteIds(user.id)
    }

    // Fallback for employee role: find their own société
    if (societeIds.length === 0) {
      const { data: selfEmp } = await supabase.from('employes').select('societe_id, auth_user_id, email')
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email || 'NONE'}`)
        .is('date_depart', null)
        .maybeSingle()
      if (selfEmp?.societe_id) {
        societeIds = [selfEmp.societe_id]
      }
    }

    if (societeIds.length === 0) {
      return NextResponse.json({ conges: [], balances: [], employes: [], kpis: { total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 } })
    }

    // 2) Get employees for those societes
    const { data: emps } = await supabase
      .from('employes')
      .select('id, nom, prenom, poste, societe_id, date_arrivee, gender, actif')
      .in('societe_id', societeIds)
    const employees = emps || []
    const employeeIds = employees.map((e: any) => e.id)

    if (employeeIds.length === 0) {
      return NextResponse.json({ conges: [], balances: [], employes: [], kpis: { total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 } })
    }

    // ---- ACTION: balances ----
    if (action === 'balances') {
      const currentYear = new Date().getFullYear()

      // Get all approved leave requests for current year
      const { data: congesData } = await supabase
        .from('demandes_conges')
        .select('*')
        .in('employe_id', employeeIds)
        .eq('statut', 'approuve')
        .gte('date_debut', `${currentYear}-01-01`)
        .lte('date_debut', `${currentYear}-12-31`)

      const conges = congesData || []

      // Get all SL records (approved) for consecutive check
      const allSl = conges.filter((c: any) => c.type_conge === 'SL')

      // Build balances per employee
      const balances = employees.map((emp: any) => {
        const empConges = conges.filter((c: any) => c.employe_id === emp.id)
        const empAlConges = empConges.filter((c: any) => c.type_conge === 'AL')
        const alTaken = empAlConges.reduce((sum: number, c: any) => sum + (c.nb_jours || 0), 0)
        // Split AL days between company-imposed and employee-chosen.
        const alImposeSociete = empAlConges
          .filter((c: any) => c.impose_par_societe === true)
          .reduce((sum: number, c: any) => sum + (c.nb_jours || 0), 0)
        const alImposeEmploye = alTaken - alImposeSociete
        const slTaken = empConges.filter((c: any) => c.type_conge === 'SL').reduce((sum: number, c: any) => sum + (c.nb_jours || 0), 0)
        const alEntitled = calculateALEntitlement(emp.date_arrivee, currentYear)
        const slEntitled = calculateSLEntitlement(emp.date_arrivee, currentYear)
        const alBalance = alEntitled - alTaken
        const slBalance = slEntitled - slTaken

        // Sick certificate alert
        const empSl = allSl.filter((c: any) => c.employe_id === emp.id)
        const sickCertAlert = detectSickCertAlert(empSl)

        // Status indicator
        let statusColor = 'green'
        if (alBalance <= 0 || slBalance <= 0) statusColor = 'red'
        else if (alBalance <= 5 || slBalance <= 3) statusColor = 'orange'

        return {
          employe_id: emp.id,
          nom: emp.nom,
          prenom: emp.prenom,
          poste: emp.poste,
          societe_id: emp.societe_id,
          gender: emp.gender,
          date_arrivee: emp.date_arrivee,
          al_droit: alEntitled,
          al_pris: alTaken,
          al_impose_societe: Math.round(alImposeSociete * 100) / 100,
          al_impose_employe: Math.round(alImposeEmploye * 100) / 100,
          al_solde: alBalance,
          sl_droit: slEntitled,
          sl_pris: slTaken,
          sl_solde: slBalance,
          status_color: statusColor,
          sick_cert_alert: sickCertAlert,
        }
      })

      // Summary KPIs
      const totalAlTaken = balances.reduce((s: number, b: any) => s + b.al_pris, 0)
      const totalSlTaken = balances.reduce((s: number, b: any) => s + b.sl_pris, 0)

      // Pending requests count
      const { count: pendingCount } = await supabase
        .from('demandes_conges')
        .select('id', { count: 'exact', head: true })
        .in('employe_id', employeeIds)
        .eq('statut', 'en_attente')

      const alertCount = balances.filter((b: any) => b.sick_cert_alert).length

      return NextResponse.json({
        balances,
        kpis: {
          total_al_taken: totalAlTaken,
          total_sl_taken: totalSlTaken,
          pending_requests: pendingCount || 0,
          alerts: alertCount,
        },
      })
    }

    // ---- ACTION: absents_today ----
    if (action === 'absents_today') {
      const today = new Date().toISOString().split('T')[0]

      // Get approved leaves covering today
      const { data: congesAujourdhui } = await supabase
        .from('demandes_conges')
        .select('*')
        .in('employe_id', employeeIds)
        .eq('statut', 'approuve')
        .lte('date_debut', today)
        .gte('date_fin', today)

      const empIdsEnConge = new Set((congesAujourdhui || []).map((c: any) => c.employe_id))

      const absentsWithLeave = (congesAujourdhui || []).map((c: any) => {
        const emp = employees.find((e: any) => e.id === c.employe_id)
        return {
          ...c,
          employe: emp ? { nom: emp.nom, prenom: emp.prenom, poste: emp.poste, societe_id: emp.societe_id } : null,
        }
      })

      // All employees not on approved leave (potential unplanned absences)
      const employeesNotOnLeave = employees.filter((e: any) => !empIdsEnConge.has(e.id))

      return NextResponse.json({
        absents_avec_conge: absentsWithLeave,
        employes_sans_conge: employeesNotOnLeave,
      })
    }

    // ---- DEFAULT: return conges list ----
    let query = supabase
      .from('demandes_conges')
      .select('*')
      .in('employe_id', employeeIds)
      .order('date_debut', { ascending: false })
    if (employe_id) query = query.eq('employe_id', employe_id)
    if (statut) query = query.eq('statut', statut)

    const { data: congesData, error: congesErr } = await query
    if (congesErr) throw congesErr

    // Enrich with employee info (no FK join)
    const empMap = new Map(employees.map((e: any) => [e.id, e]))
    const congesEnriched = (congesData || []).map((c: any) => {
      const emp = empMap.get(c.employe_id)
      return {
        ...c,
        employe: emp ? {
          nom: emp.nom,
          prenom: emp.prenom,
          poste: emp.poste,
          societe_id: emp.societe_id,
        } : null,
      }
    })

    return NextResponse.json({ conges: congesEnriched, employes: employees })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const action = body.action

    // ---- ACTION: modifier_solde (manually adjust employee leave balance) ----
    if (action === 'modifier_solde') {
      const { employe_id, annee, al_droit, al_pris, sl_droit, sl_pris, date_arrivee } = body
      if (!employe_id) return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
      const year = annee || new Date().getFullYear()

      // Update employee date_arrivee if provided
      if (date_arrivee !== undefined) {
        await supabase.from('employes').update({ date_arrivee }).eq('id', employe_id)
      }

      // Upsert soldes_conges record for the year
      const { data: existing } = await supabase.from('soldes_conges')
        .select('id').eq('employe_id', employe_id).eq('annee', year).maybeSingle()

      const updates: any = {}
      if (al_droit !== undefined) updates.al_droit = Number(al_droit)
      if (al_pris !== undefined) updates.al_pris = Number(al_pris)
      if (sl_droit !== undefined) updates.sl_droit = Number(sl_droit)
      if (sl_pris !== undefined) updates.sl_pris = Number(sl_pris)

      if (Object.keys(updates).length === 0 && date_arrivee === undefined) {
        return NextResponse.json({ error: 'Aucun champ a modifier' }, { status: 400 })
      }

      if (Object.keys(updates).length > 0) {
        if (existing) {
          const { error } = await supabase.from('soldes_conges').update(updates).eq('id', existing.id)
          if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        } else {
          const { error } = await supabase.from('soldes_conges').insert({
            employe_id, annee: year,
            al_droit: updates.al_droit ?? 22,
            al_pris: updates.al_pris ?? 0,
            sl_droit: updates.sl_droit ?? 15,
            sl_pris: updates.sl_pris ?? 0,
          })
          if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        }
      }

      return NextResponse.json({ success: true })
    }

    // ---- ACTION: creer (create leave request) ----
    // ---- ACTION: modifier_demande (edit pending leave request) ----
    if (action === 'modifier_demande') {
      const { id, date_debut, date_fin, type_conge, motif, demi_journee } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      // Check the request exists and is pending
      const { data: existing } = await supabase.from('demandes_conges').select('*').eq('id', id).single()
      if (!existing) return NextResponse.json({ error: 'Demande non trouvee' }, { status: 404 })
      if (existing.statut !== 'en_attente') {
        return NextResponse.json({ error: 'Impossible de modifier une demande deja traitee' }, { status: 400 })
      }

      const updates: any = {}
      if (date_debut !== undefined) updates.date_debut = date_debut
      if (date_fin !== undefined) updates.date_fin = date_fin
      if (type_conge !== undefined) updates.type_conge = type_conge
      if (motif !== undefined) updates.motif = motif

      // Recalculate nb_jours if dates changed
      const newDebut = date_debut || existing.date_debut
      const newFin = date_fin || existing.date_fin
      if (newDebut > newFin) {
        return NextResponse.json({ error: 'La date de fin doit etre apres la date de debut' }, { status: 400 })
      }
      if (demi_journee === true && newDebut === newFin) {
        updates.nb_jours = 0.5
      } else if (date_debut || date_fin || demi_journee !== undefined) {
        updates.nb_jours = countWorkingDays(newDebut, newFin)
      }

      const { data, error } = await supabase.from('demandes_conges').update(updates).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ demande: data })
    }

    if (action === 'creer' || !action) {
      if (!body.employe_id || !body.type_conge || !body.date_debut || !body.date_fin)
        return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

      const { data: emp } = await supabase.from('employes').select('id, societe_id, gender, auth_user_id, email').eq('id', body.employe_id).maybeSingle()
      if (!emp) {
        return NextResponse.json({ error: 'Employe non trouve' }, { status: 404 })
      }

      // Access check: either user has société access OR user IS the employee (self-service)
      const isSelf = emp.auth_user_id === user.id || emp.email === user.email
      let isManager = false
      if (!isSelf) {
        const accessibleIds = await getUserSocieteIds(user.id)
        isManager = accessibleIds.includes(emp.societe_id)
        if (!isManager) {
          return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
        }
      }

      // impose_par_societe: only a manager can impose a leave. If an
      // employee submits a self-service request with this flag, ignore it.
      const imposeParSociete = isManager && body.impose_par_societe === true

      // Validate dates
      if (body.date_fin < body.date_debut) {
        return NextResponse.json({ error: 'La date de fin doit être après la date de début' }, { status: 400 })
      }

      // Validate Mauritius WRA 2019 rules
      // Support half-day (demi-journee): if demi_journee=true and same date, count as 0.5
      const isDemiJournee = body.demi_journee === true
      const matinOuApresMidi: 'matin' | 'apres_midi' | null =
        body.matin_ou_apres_midi === 'matin' || body.matin_ou_apres_midi === 'apres_midi'
          ? body.matin_ou_apres_midi
          : null

      if (isDemiJournee) {
        if (body.date_debut !== body.date_fin) {
          return NextResponse.json({
            error: 'Une demi-journée doit concerner une seule date (date_debut = date_fin)',
          }, { status: 400 })
        }
        if (!matinOuApresMidi) {
          return NextResponse.json({
            error: 'Précisez si la demi-journée est le matin ou l\'après-midi',
          }, { status: 400 })
        }
        // Type-level gate: conges_employes.demi_journee_autorisee is the
        // per-(employe, annee, type) config flag. If a row exists for this
        // type and the flag is explicitly false, refuse the request with a
        // clear message. If no row exists yet we allow — the default
        // declared in the schema is true and Commit 10's paramètres page
        // will let the RH team flip it per type.
        const anneeDemi = new Date(body.date_debut).getFullYear()
        const { data: typeCfg } = await supabase
          .from('conges_employes')
          .select('demi_journee_autorisee')
          .eq('employe_id', body.employe_id)
          .eq('annee', anneeDemi)
          .eq('type_conge', body.type_conge)
          .maybeSingle()
        if (typeCfg && typeCfg.demi_journee_autorisee === false) {
          return NextResponse.json({
            error: `Les demi-journées ne sont pas autorisées pour ce type de congé (${body.type_conge}). Contactez votre manager RH pour modifier le paramétrage.`,
          }, { status: 400 })
        }
      }

      let nb_jours: number
      if (isDemiJournee) {
        nb_jours = 0.5
      } else {
        // FIX 2 — utiliser computeNbJoursForEmploye (employee-aware) au
        // lieu du thin wrapper countWorkingDays() qui ignorait les
        // working_days de l'employé ET les jours_feries en DB. Pour un
        // employé Mon-Fri standard le résultat est identique, mais pour
        // un employé 6j/sem (commerce, hôtellerie) le samedi n'était
        // pas compté → nb_jours sous-estimé, solde mal débité.
        nb_jours = await computeNbJoursForEmploye(supabase, body.employe_id, body.date_debut, body.date_fin)
      }

      if (nb_jours <= 0) {
        return NextResponse.json({
          error: 'La période sélectionnée ne contient aucun jour ouvrable',
          hint: 'Vérifiez que les dates ne tombent pas uniquement sur des weekends ou des jours fériés (selon votre pattern working_days).',
        }, { status: 400 })
      }

      // Sprint 2 — Anti-doublon : refuse une demande strictement identique
      // (même employé, même type, mêmes dates de début ET fin). Retour 409
      // pour que le client puisse différencier d'un 400 (validation).
      // Volontairement strict sur les 4 colonnes : un user peut soumettre
      // 2 demandes pour la même semaine si dates différentes (matin/après-midi
      // par ex. via demi-journée) — donc on ne dédoublonne que sur l'identité
      // exacte de la période.
      const { data: dupExisting } = await supabase
        .from('demandes_conges')
        .select('id, statut, nb_jours')
        .eq('employe_id', body.employe_id)
        .eq('type_conge', body.type_conge)
        .eq('date_debut', body.date_debut)
        .eq('date_fin', body.date_fin)
        .maybeSingle()
      if (dupExisting) {
        return NextResponse.json({
          error: 'Une demande identique existe déjà',
          existing_id: dupExisting.id,
          existing_statut: dupExisting.statut,
          hint: 'Si vous voulez modifier ou ajouter à cette demande, ouvrez-la directement.',
        }, { status: 409 })
      }

      if (body.type_conge === 'MAT' && emp.gender === 'M') {
        return NextResponse.json({ error: 'Conge maternite reserve aux femmes (WRA 2019)' }, { status: 400 })
      }
      if (body.type_conge === 'PAT' && emp.gender === 'F') {
        return NextResponse.json({ error: 'Conge paternite reserve aux hommes (WRA 2019)' }, { status: 400 })
      }
      if (body.type_conge === 'MAT') {
        // Maternity = 16 weeks = 112 calendar days (WRA 2019 Section 52)
        const startDate = new Date(body.date_debut + 'T12:00:00')
        const endDate = new Date(body.date_fin + 'T12:00:00')
        const calendarDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        if (calendarDays > 112) {
          return NextResponse.json({ error: 'Maternity Leave: maximum 16 weeks (112 calendar days) per WRA 2019 Section 52' }, { status: 400 })
        }
      }
      if (body.type_conge === 'PAT') {
        // Paternity = 4 weeks = 28 calendar days (WRA 2019 Section 53)
        const startDate = new Date(body.date_debut + 'T12:00:00')
        const endDate = new Date(body.date_fin + 'T12:00:00')
        const calendarDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        if (calendarDays > 28) {
          return NextResponse.json({ error: 'Paternity Leave: maximum 4 weeks (28 calendar days) per WRA 2019 Section 53' }, { status: 400 })
        }
      }

      // Check balance for AL and SL.
      // FIX 2 — politique RH : si le solde est insuffisant, NE PAS bloquer.
      // Le congé est créé en bascule UL (unpaid leave) automatiquement et
      // un avertissement est retourné à l'UI. Ainsi un manager ne peut
      // jamais empêcher un salarié de prendre un congé pour solde nul ;
      // le coût est simplement déduit du salaire au prochain calcul de paie.
      let typeCongeFinal: string = body.type_conge
      let bascule_ul_warning: string | null = null
      if (body.type_conge === 'AL' || body.type_conge === 'SL') {
        const currentYear = new Date().getFullYear()
        const { data: existingLeaves } = await supabase
          .from('demandes_conges')
          .select('nb_jours')
          .eq('employe_id', body.employe_id)
          .eq('type_conge', body.type_conge)
          .eq('statut', 'approuve')
          .gte('date_debut', `${currentYear}-01-01`)
          .lte('date_debut', `${currentYear}-12-31`)

        const taken = (existingLeaves || []).reduce((sum: number, c: any) => sum + (c.nb_jours || 0), 0)

        // Get employee hire date for WRA Year 1 rules
        const { data: empFull } = await supabase.from('employes').select('date_arrivee').eq('id', body.employe_id).maybeSingle()
        const hireDate = empFull?.date_arrivee

        // Calculate months of service for probation check (still BLOCKING:
        // WRA 2019 interdit le droit à congé en période d'essai, donc même
        // une bascule UL ne s'applique pas — on refuse).
        if (hireDate) {
          const hire = new Date(hireDate + 'T00:00:00')
          const now = new Date()
          const monthsService = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth())
          if (monthsService < 6) {
            return NextResponse.json({
              error: `Pas de droit à congé pendant les 6 premiers mois (période de carence WRA 2019). Ancienneté: ${monthsService} mois.`,
            }, { status: 400 })
          }
        }

        const entitled = body.type_conge === 'AL'
          ? calculateALEntitlement(hireDate, currentYear)
          : calculateSLEntitlement(hireDate, currentYear)

        const remaining = entitled - taken
        if (nb_jours > remaining) {
          // FIX 2 — bascule UL au lieu de bloquer. Si le solde restant est
          // partiel (>0), on enregistre quand même tout en UL pour ne pas
          // mélanger deux types de congé sur une seule demande (plus simple
          // pour la paie + plus clair pour l'utilisateur). Le RH peut
          // approuver/refuser à la main si nécessaire.
          const typeLabel = body.type_conge === 'AL' ? 'Local Leave' : 'Sick Leave'
          typeCongeFinal = 'UL'
          bascule_ul_warning = `Solde ${typeLabel} insuffisant (${remaining}j restants sur ${entitled}j) — congé enregistré en Unpaid Leave et déduit du salaire ce mois.`
          console.warn(`[conges] BASCULE UL — employe=${body.employe_id} type=${body.type_conge} demande=${nb_jours}j solde=${remaining}j`)
        }
      }

      console.log(`[conges] Creating: type=${typeCongeFinal} (initial=${body.type_conge}), debut=${body.date_debut}, fin=${body.date_fin}, nb_jours=${nb_jours}`)

      const { data, error } = await supabase.from('demandes_conges').insert({
        employe_id: body.employe_id,
        type_conge: typeCongeFinal,
        date_debut: body.date_debut,
        date_fin: body.date_fin,
        nb_jours,
        demi_journee: isDemiJournee,
        matin_ou_apres_midi: matinOuApresMidi,
        impose_par_societe: imposeParSociete,
        statut: body.statut || 'en_attente',
        motif: bascule_ul_warning
          ? `${body.motif || ''}\n[Auto-bascule UL] ${bascule_ul_warning}`.trim()
          : (body.motif || null),
        document_url: body.document_url || null,
      }).select().single()
      if (error) throw error
      return NextResponse.json({
        conge: data,
        warning: bascule_ul_warning, // null si pas de bascule, sinon message UX
        bascule_ul: bascule_ul_warning !== null,
        type_conge_initial: body.type_conge,
        type_conge_final: typeCongeFinal,
      }, { status: 201 })
    }

    // ---- ACTION: approuver ----
    if (action === 'approuver') {
      if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

      const { data: conge } = await supabase.from('demandes_conges').select('*').eq('id', body.id).maybeSingle()
      if (!conge) return NextResponse.json({ error: 'Demande non trouvee' }, { status: 404 })

      // Access: self-service (employee approving own? no) or manager/RH access
      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', conge.employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employe non trouve' }, { status: 404 })

      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      // Find the approver's employe record (to store in approuve_par)
      const { data: approverEmp } = await supabase.from('employes').select('id').eq('auth_user_id', user.id).maybeSingle()

      const { data, error } = await supabase
        .from('demandes_conges')
        .update({
          statut: 'approuve',
          date_decision: new Date().toISOString(),
          approuve_par: approverEmp?.id || null,
          notes_manager: body.commentaire || body.notes_manager || null,
        })
        .eq('id', body.id)
        .select()
        .single()
      if (error) {
        console.error('[conges] approuver error:', error.message)
        return NextResponse.json({ error: 'Erreur approbation: ' + error.message }, { status: 500 })
      }

      // Recompute the annual balance from the current set of approved leaves.
      // Helper is a no-op for types it doesn't track (UL/CAR/WI/COM/PH/ABS),
      // so we call unconditionally. Uses the date_debut year to pick the
      // right row even when someone approves a leave that started last year.
      if (data) {
        const annee = new Date(conge.date_debut).getFullYear()
        await recomputeSoldeConges(supabase, conge.employe_id, conge.type_conge, annee)
      }

      return NextResponse.json({ conge: data })
    }

    // ---- ACTION: refuser ----
    if (action === 'refuser') {
      if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

      const { data: conge } = await supabase.from('demandes_conges').select('*').eq('id', body.id).maybeSingle()
      if (!conge) return NextResponse.json({ error: 'Demande non trouvee' }, { status: 404 })

      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', conge.employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employe non trouve' }, { status: 404 })

      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      // Remember if the refusal is reversing an already-approved leave —
      // in that case we MUST recompute the solde so the days go back to
      // the employee's balance. If the leave was still en_attente, there
      // was nothing to re-credit, but recomputing is a cheap no-op.
      const wasApproved = conge.statut === 'approuve'

      const { data: refuserEmp } = await supabase.from('employes').select('id').eq('auth_user_id', user.id).maybeSingle()

      const { data, error } = await supabase
        .from('demandes_conges')
        .update({
          statut: 'refuse',
          date_decision: new Date().toISOString(),
          approuve_par: refuserEmp?.id || null,
          notes_manager: body.motif_refus || body.notes_manager || null,
        })
        .eq('id', body.id)
        .select()
        .single()
      if (error) {
        console.error('[conges] refuser error:', error.message)
        return NextResponse.json({ error: 'Erreur refus: ' + error.message }, { status: 500 })
      }

      // Re-credit the balance by recomputing from the current approved set
      // (this refused one will no longer be counted). Helper is a no-op
      // for untracked types, so no conditional needed beyond wasApproved.
      if (wasApproved) {
        const annee = new Date(conge.date_debut).getFullYear()
        await recomputeSoldeConges(supabase, conge.employe_id, conge.type_conge, annee)
      }

      return NextResponse.json({ conge: data })
    }

    // ---- ACTION: annuler (soft-delete + balance restore) ----
    //
    // Semantics: the leave row is kept (statut='annule') so audit history
    // and the UI's historique tab still see it. If the leave was
    // previously approved, the solde is re-credited via the same
    // recompute-from-scratch strategy as the refusal path.
    //
    // Access control:
    //   - admin / rh / client_admin / direction / comptable with access to
    //     the employee's societe: can annuler any leave in that scope.
    //   - The employee herself: can annuler only her OWN leave and only
    //     while it's still en_attente (you can't walk back an already
    //     approved leave without a manager's decision).
    if (action === 'annuler') {
      if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

      const { data: conge } = await supabase.from('demandes_conges').select('*').eq('id', body.id).maybeSingle()
      if (!conge) return NextResponse.json({ error: 'Demande non trouvee' }, { status: 404 })
      if (conge.statut === 'annule') {
        return NextResponse.json({ error: 'Demande deja annulee' }, { status: 400 })
      }
      if (conge.statut === 'refuse') {
        return NextResponse.json({ error: 'Demande deja refusee (aucune annulation possible)' }, { status: 400 })
      }

      const { data: emp } = await supabase.from('employes').select('id, societe_id, auth_user_id').eq('id', conge.employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employe non trouve' }, { status: 404 })

      // Authorization: either the requester is a manager with access to
      // this societe, or she is the employee herself cancelling her own
      // pending request.
      const accessibleIds = await getUserSocieteIds(user.id)
      const isManager = accessibleIds.includes(emp.societe_id)
      const isSelf = emp.auth_user_id === user.id
      if (!isManager && !isSelf) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }
      if (isSelf && !isManager && conge.statut !== 'en_attente') {
        return NextResponse.json({
          error: 'Un employe ne peut annuler que ses demandes en attente. Demandez a votre manager.',
        }, { status: 403 })
      }

      const wasApproved = conge.statut === 'approuve'

      const { data: canceller } = await supabase.from('employes').select('id').eq('auth_user_id', user.id).maybeSingle()

      const { data, error } = await supabase
        .from('demandes_conges')
        .update({
          statut: 'annule',
          date_decision: new Date().toISOString(),
          approuve_par: canceller?.id || null,
          notes_manager: body.motif_annulation || body.notes_manager || null,
        })
        .eq('id', body.id)
        .select()
        .single()
      if (error) {
        console.error('[conges] annuler error:', error.message)
        return NextResponse.json({ error: 'Erreur annulation: ' + error.message }, { status: 500 })
      }

      // Restore the balance when cancelling an already-approved leave.
      // Helper is a no-op for untracked types.
      if (wasApproved) {
        const annee = new Date(conge.date_debut).getFullYear()
        await recomputeSoldeConges(supabase, conge.employe_id, conge.type_conge, annee)
      }

      return NextResponse.json({ conge: data })
    }

    // ---- ACTION: sick_retroactif ----
    if (action === 'sick_retroactif') {
      if (!body.employe_id || !body.date_debut)
        return NextResponse.json({ error: 'employe_id et date_debut requis' }, { status: 400 })

      const accessibleIds = await getUserSocieteIds(user.id)
      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', body.employe_id).maybeSingle()
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      const dateFin = body.date_fin || body.date_debut
      const nb_jours = countWorkingDays(body.date_debut, dateFin)

      const { data, error } = await supabase.from('demandes_conges').insert({
        employe_id: body.employe_id,
        type_conge: 'SL',
        date_debut: body.date_debut,
        date_fin: dateFin,
        nb_jours,
        statut: 'approuve',
        motif: body.motif || 'Absence justifiee retroactivement (SL)',
        date_decision: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      return NextResponse.json({ conge: data }, { status: 201 })
    }

    // ---- ACTION: absence_injustifiee ----
    if (action === 'absence_injustifiee') {
      if (!body.employe_id || !body.date_debut)
        return NextResponse.json({ error: 'employe_id et date_debut requis' }, { status: 400 })

      const accessibleIds = await getUserSocieteIds(user.id)
      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', body.employe_id).maybeSingle()
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      const dateFin = body.date_fin || body.date_debut
      const nb_jours = countWorkingDays(body.date_debut, dateFin)

      const { data, error } = await supabase.from('demandes_conges').insert({
        employe_id: body.employe_id,
        type_conge: 'ABS',
        date_debut: body.date_debut,
        date_fin: dateFin,
        nb_jours,
        statut: 'approuve',
        motif: body.motif || 'Absence injustifiee - deduction salaire',
        date_decision: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      return NextResponse.json({ conge: data }, { status: 201 })
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
