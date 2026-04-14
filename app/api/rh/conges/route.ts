import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculateWorkingDays } from '@/lib/rh/calculateWorkingDays'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Get the societe IDs accessible by this user */
async function getUserSocieteIds(supabase: ReturnType<typeof getAdminClient>, userId: string): Promise<string[]> {
  const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', userId).maybeSingle()
  if (profile?.societe_id) return [profile.societe_id]

  const { data: dossiers } = await supabase.from('dossiers').select('societe_id').eq('client_id', userId)
  const { data: owned } = await supabase.from('societes').select('id').eq('created_by', userId)
  return [...new Set([...(dossiers || []).map((d: any) => d.societe_id), ...(owned || []).map((s: any) => s.id)])]
}

/** Default working days pattern (Mon-Fri) */
const DEFAULT_WORKING_DAYS = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }

/** Get an employee's working_days pattern, falling back to Mon-Fri */
function getWorkingDaysForEmploye(emp: any) {
  const wd = emp?.working_days
  if (wd && typeof wd === 'object') {
    return {
      mon: wd.mon !== false,
      tue: wd.tue !== false,
      wed: wd.wed !== false,
      thu: wd.thu !== false,
      fri: wd.fri !== false,
      sat: wd.sat === true,
      sun: wd.sun === true,
    }
  }
  return { ...DEFAULT_WORKING_DAYS }
}

/** Fetch jours fériés applicable to a société over a date range */
async function fetchJoursFeries(
  supabase: ReturnType<typeof getAdminClient>,
  societeId: string | null,
  dateDebut: string,
  dateFin: string
): Promise<Date[]> {
  const minDate = `${dateDebut.slice(0, 4)}-01-01`
  const maxDate = `${dateFin.slice(0, 4)}-12-31`

  let query = supabase.from('jours_feries').select('date').gte('date', minDate).lte('date', maxDate)
  if (societeId) {
    query = query.or(`societe_id.eq.${societeId},societe_id.is.null`)
  } else {
    query = query.is('societe_id', null)
  }
  const { data } = await query
  return (data || []).map((r: any) => new Date(r.date + 'T12:00:00'))
}

/** Compute nb_jours ouvrés for an employee using working_days + jours_feries */
async function computeNbJours(
  supabase: ReturnType<typeof getAdminClient>,
  employeId: string,
  dateDebut: string,
  dateFin: string
): Promise<number> {
  const { data: emp } = await supabase
    .from('employes')
    .select('societe_id, working_days')
    .eq('id', employeId)
    .maybeSingle()
  const workingDays = getWorkingDaysForEmploye(emp)
  const feries = await fetchJoursFeries(supabase, emp?.societe_id || null, dateDebut, dateFin)
  return calculateWorkingDays(
    new Date(dateDebut + 'T12:00:00'),
    new Date(dateFin + 'T12:00:00'),
    workingDays,
    feries
  )
}

/** Simple working-day count (Mon-Fri) — used only for sick-cert alert pattern analysis */
function countWorkingDays(dateDebut: string, dateFin: string): number {
  let count = 0
  const d = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')
  while (d <= end) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

/** Calculate prorata AL entitlement based on hire date (Mauritius WRA 2019: 20 days/year) */
function calculateALEntitlement(dateArrivee: string | null, year: number): number {
  if (!dateArrivee) return 20
  const hireDate = new Date(dateArrivee)
  const hireYear = hireDate.getFullYear()
  if (hireYear < year) return 20
  if (hireYear > year) return 0
  // Hired this year: prorata = 20 * months_worked / 12
  const monthsWorked = 12 - hireDate.getMonth()
  return Math.round((20 * monthsWorked) / 12)
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
    if (societe_id) {
      const accessibleIds = await getUserSocieteIds(supabase, user.id)
      if (!accessibleIds.includes(societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise a cette societe' }, { status: 403 })
      }
      societeIds = [societe_id]
    } else {
      societeIds = await getUserSocieteIds(supabase, user.id)
    }

    // ---- ACTION: preview_nb_jours (real-time nb_jours calc for UI) ----
    // Handled early, before empty-societes early returns, so the preview
    // endpoint always returns { nb_jours } when inputs are valid.
    if (action === 'preview_nb_jours') {
      const previewEmployeId = searchParams.get('employe_id')
      const previewDateDebut = searchParams.get('date_debut')
      const previewDateFin = searchParams.get('date_fin')
      if (!previewEmployeId || !previewDateDebut || !previewDateFin) {
        return NextResponse.json({ error: 'employe_id, date_debut, date_fin requis' }, { status: 400 })
      }
      // Verify the employee belongs to a societe the user has access to
      const { data: empAccess } = await supabase
        .from('employes')
        .select('id, societe_id')
        .eq('id', previewEmployeId)
        .maybeSingle()
      if (!empAccess || !societeIds.includes(empAccess.societe_id)) {
        return NextResponse.json({ error: 'Employe non accessible' }, { status: 403 })
      }
      const nb_jours = await computeNbJours(supabase, previewEmployeId, previewDateDebut, previewDateFin)
      return NextResponse.json({ nb_jours })
    }

    if (societeIds.length === 0) {
      return NextResponse.json({ conges: [], balances: [], employes: [], kpis: { total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 } })
    }

    // 2) Get employees for those societes
    const { data: emps } = await supabase
      .from('employes')
      .select('id, nom, prenom, poste, societe_id, date_arrivee, sexe, statut')
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
        const slEntitled = 15
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
          sexe: emp.sexe,
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

    // ---- ACTION: creer (create leave request) ----
    if (action === 'creer' || !action) {
      if (!body.employe_id || !body.type_conge || !body.date_debut || !body.date_fin)
        return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

      const accessibleIds = await getUserSocieteIds(supabase, user.id)
      const { data: emp } = await supabase.from('employes').select('id, societe_id, sexe').eq('id', body.employe_id).maybeSingle()
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Employe non trouve ou acces non autorise' }, { status: 403 })
      }

      // Validate Mauritius WRA 2019 rules
      // nb_jours computed using employee's working_days pattern + jours fériés
      const nb_jours = await computeNbJours(supabase, body.employe_id, body.date_debut, body.date_fin)

      if (body.type_conge === 'MAT' && emp.sexe === 'M') {
        return NextResponse.json({ error: 'Conge maternite reserve aux femmes (WRA 2019)' }, { status: 400 })
      }
      if (body.type_conge === 'PAT' && emp.sexe === 'F') {
        return NextResponse.json({ error: 'Conge paternite reserve aux hommes (WRA 2019)' }, { status: 400 })
      }
      if (body.type_conge === 'MAT') {
        // Maternity = 14 weeks = 98 calendar days
        const startDate = new Date(body.date_debut + 'T12:00:00')
        const endDate = new Date(body.date_fin + 'T12:00:00')
        const calendarDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        if (calendarDays > 98) {
          return NextResponse.json({ error: 'Conge maternite: maximum 14 semaines (98 jours) selon WRA 2019' }, { status: 400 })
        }
      }
      if (body.type_conge === 'PAT' && nb_jours > 5) {
        return NextResponse.json({ error: 'Conge paternite: maximum 5 jours ouvrables selon WRA 2019' }, { status: 400 })
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
        const entitled = body.type_conge === 'AL'
          ? calculateALEntitlement(null, currentYear) // Will recalculate with actual date_arrivee below
          : 15

        if (body.type_conge === 'AL') {
          const { data: empFull } = await supabase.from('employes').select('date_arrivee').eq('id', body.employe_id).maybeSingle()
          const alEntitled = calculateALEntitlement(empFull?.date_arrivee, currentYear)
          const remaining = alEntitled - taken
          if (nb_jours > remaining) {
            return NextResponse.json({ error: `Solde AL insuffisant: ${remaining} jour(s) restant(s)` }, { status: 400 })
          }
        } else {
          const remaining = entitled - taken
          if (nb_jours > remaining) {
            return NextResponse.json({ error: `Solde SL insuffisant: ${remaining} jour(s) restant(s)` }, { status: 400 })
          }
        }
      }

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

      const accessibleIds = await getUserSocieteIds(supabase, user.id)
      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', conge.employe_id).maybeSingle()
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      const { data, error } = await supabase
        .from('demandes_conges')
        .update({
          statut: 'approuve',
          date_approbation: new Date().toISOString(),
          commentaire_manager: body.commentaire || null,
        })
        .eq('id', body.id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ conge: data })
    }

    // ---- ACTION: refuser ----
    if (action === 'refuser') {
      if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

      const { data: conge } = await supabase.from('demandes_conges').select('*').eq('id', body.id).maybeSingle()
      if (!conge) return NextResponse.json({ error: 'Demande non trouvee' }, { status: 404 })

      const accessibleIds = await getUserSocieteIds(supabase, user.id)
      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', conge.employe_id).maybeSingle()
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      const { data, error } = await supabase
        .from('demandes_conges')
        .update({
          statut: 'refuse',
          date_approbation: new Date().toISOString(),
          commentaire_manager: body.motif_refus || body.commentaire || null,
        })
        .eq('id', body.id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ conge: data })
    }

    // ---- ACTION: sick_retroactif ----
    if (action === 'sick_retroactif') {
      if (!body.employe_id || !body.date_debut)
        return NextResponse.json({ error: 'employe_id et date_debut requis' }, { status: 400 })

      const accessibleIds = await getUserSocieteIds(supabase, user.id)
      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', body.employe_id).maybeSingle()
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      const dateFin = body.date_fin || body.date_debut
      const nb_jours = await computeNbJours(supabase, body.employe_id, body.date_debut, dateFin)

      const { data, error } = await supabase.from('demandes_conges').insert({
        employe_id: body.employe_id,
        type_conge: 'SL',
        date_debut: body.date_debut,
        date_fin: dateFin,
        nb_jours,
        statut: 'approuve',
        motif: body.motif || 'Absence justifiee retroactivement (SL)',
        date_approbation: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      return NextResponse.json({ conge: data }, { status: 201 })
    }

    // ---- ACTION: absence_injustifiee ----
    if (action === 'absence_injustifiee') {
      if (!body.employe_id || !body.date_debut)
        return NextResponse.json({ error: 'employe_id et date_debut requis' }, { status: 400 })

      const accessibleIds = await getUserSocieteIds(supabase, user.id)
      const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', body.employe_id).maybeSingle()
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }

      const dateFin = body.date_fin || body.date_debut
      const nb_jours = await computeNbJours(supabase, body.employe_id, body.date_debut, dateFin)

      const { data, error } = await supabase.from('demandes_conges').insert({
        employe_id: body.employe_id,
        type_conge: 'ABS',
        date_debut: body.date_debut,
        date_fin: dateFin,
        nb_jours,
        statut: 'approuve',
        motif: body.motif || 'Absence injustifiee - deduction salaire',
        date_approbation: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      return NextResponse.json({ conge: data }, { status: 201 })
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
