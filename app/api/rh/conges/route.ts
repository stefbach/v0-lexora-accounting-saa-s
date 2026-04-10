import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/* getUserSocieteIds imported from @/lib/rh/access — handles all roles including admin, client_admin, comptable, rh */

/**
 * Mauritius public holidays (jours fériés).
 * Returns a Set of "YYYY-MM-DD" strings for a given year.
 * Fixed-date holidays per Workers' Rights Act 2019 + Mauritius Public Holidays Act.
 * Note: Some holidays (Eid, Divali, Chinese Spring Festival, etc.) have variable dates
 * that shift yearly — we include the most common known dates. For production accuracy,
 * these should come from a database or government gazette.
 */
function getMauritiusPublicHolidays(year: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`

  const fixed = [
    fmt(1, 1),   // New Year's Day (1 Jan)
    fmt(1, 2),   // New Year's Day (2 Jan)
    fmt(2, 1),   // Abolition of Slavery (1 Feb)
    fmt(3, 12),  // Independence & Republic Day (12 Mar)
    fmt(5, 1),   // Labour Day (1 May)
    fmt(11, 1),  // All Saints' Day (1 Nov — Toussaint)
    fmt(11, 2),  // Arrival of Indentured Labourers (2 Nov)
    fmt(12, 25), // Christmas Day (25 Dec)
  ]

  // Variable holidays — approximate common dates per year
  // These are approximations; for exact dates, consult the Government Gazette
  const variableByYear: Record<number, string[]> = {
    2024: [
      fmt(1, 25),  // Thaipoosam Cavadee
      fmt(2, 10),  // Chinese Spring Festival
      fmt(3, 8),   // Maha Shivaratree
      fmt(3, 29),  // Ougadi
      fmt(4, 10),  // Eid-Ul-Fitr
      fmt(8, 15),  // Assumption of the Blessed Virgin Mary
      fmt(9, 16),  // Ganesh Chaturthi
      fmt(11, 1),  // Divali (overlaps with All Saints')
    ],
    2025: [
      fmt(1, 14),  // Thaipoosam Cavadee
      fmt(1, 29),  // Chinese Spring Festival
      fmt(2, 26),  // Maha Shivaratree
      fmt(3, 30),  // Eid-Ul-Fitr
      fmt(3, 14),  // Ougadi
      fmt(8, 15),  // Assumption of the Blessed Virgin Mary
      fmt(9, 5),   // Ganesh Chaturthi
      fmt(10, 20), // Divali
    ],
    2026: [
      fmt(1, 2),   // Thaipoosam Cavadee (overlaps with New Year)
      fmt(2, 17),  // Chinese Spring Festival
      fmt(2, 15),  // Maha Shivaratree
      fmt(3, 20),  // Eid-Ul-Fitr
      fmt(4, 3),   // Ougadi
      fmt(8, 15),  // Assumption of the Blessed Virgin Mary
      fmt(8, 26),  // Ganesh Chaturthi
      fmt(11, 8),  // Divali
    ],
  }

  const all = [...fixed, ...(variableByYear[year] || [])]
  return new Set(all)
}

/** Count working days between two dates (exclude Sat/Sun + Mauritius public holidays) */
function countWorkingDays(dateDebut: string, dateFin: string): number {
  let count = 0
  const d = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')

  // Collect public holidays for all years in the range
  const startYear = d.getFullYear()
  const endYear = end.getFullYear()
  const holidays = new Set<string>()
  for (let y = startYear; y <= endYear; y++) {
    for (const h of getMauritiusPublicHolidays(y)) holidays.add(h)
  }

  while (d <= end) {
    const day = d.getDay()
    const iso = d.toISOString().split('T')[0]
    if (day !== 0 && day !== 6 && !holidays.has(iso)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
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
        const alTaken = empConges.filter((c: any) => c.type_conge === 'AL').reduce((sum: number, c: any) => sum + (c.nb_jours || 0), 0)
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
      if (!isSelf) {
        const accessibleIds = await getUserSocieteIds(user.id)
        if (!accessibleIds.includes(emp.societe_id)) {
          return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
        }
      }

      // Validate dates
      if (body.date_fin < body.date_debut) {
        return NextResponse.json({ error: 'La date de fin doit être après la date de début' }, { status: 400 })
      }

      // Validate Mauritius WRA 2019 rules
      // Support half-day (demi-journee): if demi_journee=true and same date, count as 0.5
      const isDemiJournee = body.demi_journee === true
      let nb_jours: number
      if (isDemiJournee && body.date_debut === body.date_fin) {
        nb_jours = 0.5
      } else {
        nb_jours = countWorkingDays(body.date_debut, body.date_fin)
      }

      if (nb_jours <= 0) {
        return NextResponse.json({ error: 'La période sélectionnée ne contient aucun jour ouvrable' }, { status: 400 })
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

      // Check balance for AL and SL
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

        // Calculate months of service for probation check
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
          const typeLabel = body.type_conge === 'AL' ? 'Local Leave' : 'Sick Leave'
          return NextResponse.json({
            error: `Solde ${typeLabel} insuffisant: ${remaining} jour(s) restant(s) sur ${entitled} jour(s) de droit`,
          }, { status: 400 })
        }
      }

      console.log(`[conges] Creating: type=${body.type_conge}, debut=${body.date_debut}, fin=${body.date_fin}, nb_jours=${nb_jours}`)

      const { data, error } = await supabase.from('demandes_conges').insert({
        employe_id: body.employe_id,
        type_conge: body.type_conge,
        date_debut: body.date_debut,
        date_fin: body.date_fin,
        nb_jours,
        statut: body.statut || 'en_attente',
        motif: body.motif || null,
        document_url: body.document_url || null,
      }).select().single()
      if (error) throw error
      return NextResponse.json({ conge: data }, { status: 201 })
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

      // Update soldes_conges table if it exists
      if (data && (conge.type_conge === 'AL' || conge.type_conge === 'SL')) {
        try {
          const currentYear = new Date().getFullYear()
          const nbJours = Number(conge.nb_jours) || 0

          // Recalculate total taken for this employee this year
          const { data: allApproved } = await supabase
            .from('demandes_conges')
            .select('nb_jours')
            .eq('employe_id', conge.employe_id)
            .eq('type_conge', conge.type_conge)
            .eq('statut', 'approuve')
            .gte('date_debut', `${currentYear}-01-01`)
            .lte('date_debut', `${currentYear}-12-31`)

          const totalPris = (allApproved || []).reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)

          // Upsert soldes_conges
          const field_pris = conge.type_conge === 'AL' ? 'al_pris' : 'sl_pris'
          const { data: existingSolde } = await supabase
            .from('soldes_conges')
            .select('id')
            .eq('employe_id', conge.employe_id)
            .eq('annee', currentYear)
            .maybeSingle()

          if (existingSolde) {
            await supabase.from('soldes_conges')
              .update({ [field_pris]: totalPris })
              .eq('id', existingSolde.id)
          } else {
            await supabase.from('soldes_conges').insert({
              employe_id: conge.employe_id,
              annee: currentYear,
              al_droit: 22,
              al_pris: conge.type_conge === 'AL' ? totalPris : 0,
              sl_droit: 15,
              sl_pris: conge.type_conge === 'SL' ? totalPris : 0,
            }).select().maybeSingle()
          }

          console.log(`[conges] Solde mis à jour: ${conge.type_conge} pris=${totalPris} pour employe=${conge.employe_id}`)
        } catch (soldeErr: any) {
          console.warn('[conges] Erreur mise à jour soldes (non bloquant):', soldeErr.message)
        }
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
