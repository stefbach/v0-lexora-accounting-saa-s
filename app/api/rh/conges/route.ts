import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'
import { recomputeSoldeCongesAll } from '@/lib/rh/soldes-conges'
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
      .select('date, travail_autorise')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
    // Sprint 4 TÂCHE 3 — on exclut les jours fériés avec travail_autorise=TRUE
    // (WRA 2019 art. 21 — ces jours deviennent ouvrables avec majoration).
    // Filtrage JS plutôt que SQL pour rétrocompat si mig 139 non appliquée :
    // si la colonne n'existe pas, travail_autorise est undefined → falsy
    // → la ligne est conservée (comportement legacy).
    const set = new Set<string>(
      (data || [])
        .filter((r: any) => !r.travail_autorise)
        .map((r: any) => String(r.date).slice(0, 10)),
    )
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
    // Sprint 16 fix — SELECT résilient : try/catch + retry sans colonnes
    // optionnelles si 42703. Colonnes gender/genre/actif peuvent manquer
    // sur certains envs selon les migrations appliquées.
    // F5-bis — si employe_id est passé, on restreint à cet employé seulement
    // (sinon balances[] contenait TOUS les employés de la société → CongesTab
    // prenait balances[0] qui pouvait être un autre employé).
    let employees: any[] = []
    try {
      let q = supabase
        .from('employes')
        .select('id, nom, prenom, poste, societe_id, date_arrivee, genre, gender, actif, date_depart, salaire_base, is_migrant_worker, statut_wra')
        .in('societe_id', societeIds)
        .eq('actif', true)
        .is('date_depart', null)
      if (employe_id) q = q.eq('id', employe_id)
      const { data: emps, error: empErr } = await q
      if (empErr) {
        // Retry without genre/actif if columns missing (42703)
        console.warn('[conges GET] employees query error, retrying:', empErr.message, empErr.code)
        let q2 = supabase
          .from('employes')
          .select('id, nom, prenom, poste, societe_id, date_arrivee')
          .in('societe_id', societeIds)
          .is('date_depart', null)
        if (employe_id) q2 = q2.eq('id', employe_id)
        const { data: emps2 } = await q2
        employees = emps2 || []
      } else {
        employees = emps || []
      }
    } catch (e: any) {
      console.error('[conges GET] employees fetch exception:', e?.message || e)
    }
    const employeeIds = employees.map((e: any) => e.id)

    if (employeeIds.length === 0) {
      return NextResponse.json({ conges: [], balances: [], employes: [], kpis: { total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 } })
    }

    // ---- ACTION: balances ----
    // F5 + B.1 — Source de vérité unique = table soldes_conges, indexée par
    // (employe_id, periode_debut) depuis la mig 155 (années par anniversaire).
    // La row sélectionnée est celle où today BETWEEN periode_debut AND
    // periode_fin. Les rows manquantes sont créées par recomputeSoldeCongesAll.
    if (action === 'balances') {
      const now = new Date()
      const today = now.toISOString().slice(0, 10)

      // 1. Lire soldes_conges pour la PÉRIODE COURANTE de chaque employé
      const SOLDES_FIELDS = 'employe_id, periode_debut, periode_fin, al_droit, al_acquis, al_pris, al_solde, al_reporte, al_impose_societe, al_impose_employe, sl_droit, sl_pris, sl_solde, sl_accumule, vl_droit, vl_pris, vl_solde, vl_paye_compensation, vl_cycle_debut, vl_cycle_fin'
      const { data: soldesData } = await supabase
        .from('soldes_conges')
        .select(SOLDES_FIELDS)
        .in('employe_id', employeeIds)
        .lte('periode_debut', today)
        .gte('periode_fin', today)

      // Bug VL — un employé peut avoir 2 rows qui chevauchent today
      // (cycle anniversaire ex. 2025-10→2026-10, vl_droit=30 + ligne
      // calendaire 2026-01→2026-12, vl_droit=0). al_droit/sl_droit
      // peuvent être identiques sur les 2 rows, donc on priorise
      // vl_droit > 0 EN PREMIER pour discriminer correctement.
      // Ordre :
      //   1. vl_droit > 0 (pour récupérer l'éligibilité VL)
      //   2. al_droit ou sl_droit > 0 (cas hors-VL, garde une row utile)
      //   3. periode_debut la plus récente
      // On ne garde que la PREMIÈRE occurrence par employe_id.
      const sortedSoldes = [...(soldesData || [])].sort((a: any, b: any) => {
        const aHasVl = (Number(a.vl_droit) || 0) > 0
        const bHasVl = (Number(b.vl_droit) || 0) > 0
        if (aHasVl !== bHasVl) return aHasVl ? -1 : 1
        const aHasOther =
          (Number(a.al_droit) || 0) > 0 || (Number(a.sl_droit) || 0) > 0
        const bHasOther =
          (Number(b.al_droit) || 0) > 0 || (Number(b.sl_droit) || 0) > 0
        if (aHasOther !== bHasOther) return aHasOther ? -1 : 1
        return (b.periode_debut || '').localeCompare(a.periode_debut || '')
      })
      const soldesByEmp = new Map<string, any>()
      for (const s of sortedSoldes) {
        if (!soldesByEmp.has(s.employe_id)) soldesByEmp.set(s.employe_id, s)
      }

      // 2. Employés sans row pour la période courante → recompute pour créer
      //    la row avec droits accrus (mig 157) + pris depuis demandes_conges.
      const missing = employeeIds.filter((id: string) => !soldesByEmp.has(id))
      if (missing.length > 0) {
        await Promise.all(missing.map((id: string) =>
          recomputeSoldeCongesAll(supabase, id),
        ))
        const { data: newSoldes } = await supabase
          .from('soldes_conges')
          .select(SOLDES_FIELDS)
          .in('employe_id', missing)
          .lte('periode_debut', today)
          .gte('periode_fin', today)
        const sortedNew = [...(newSoldes || [])].sort((a: any, b: any) => {
          const aHasVl = (Number(a.vl_droit) || 0) > 0
          const bHasVl = (Number(b.vl_droit) || 0) > 0
          if (aHasVl !== bHasVl) return aHasVl ? -1 : 1
          const aHasOther =
            (Number(a.al_droit) || 0) > 0 || (Number(a.sl_droit) || 0) > 0
          const bHasOther =
            (Number(b.al_droit) || 0) > 0 || (Number(b.sl_droit) || 0) > 0
          if (aHasOther !== bHasOther) return aHasOther ? -1 : 1
          return (b.periode_debut || '').localeCompare(a.periode_debut || '')
        })
        for (const s of sortedNew) {
          if (!soldesByEmp.has(s.employe_id)) soldesByEmp.set(s.employe_id, s)
        }
      }

      // 3. Lire les SL approuvés de l'année civile (pour sick_cert_alert
      //    uniquement — signal d'UX orthogonal au compteur de soldes).
      const currentYear = now.getFullYear()
      const { data: slApproved } = await supabase
        .from('demandes_conges')
        .select('employe_id, type_conge, date_debut, date_fin, nb_jours')
        .in('employe_id', employeeIds)
        .eq('type_conge', 'SL')
        .eq('statut', 'approuve')
        .gte('date_debut', `${currentYear}-01-01`)
        .lte('date_debut', `${currentYear}-12-31`)

      // 4. Build balances — source de vérité = soldes_conges
      // Index alternatif par employe_id qui retient TOUTES les rows soldesData
      // matching today (dont la calendaire avec vl_droit=0 et l'anniversaire
      // avec vl_droit=30). Sert de filet de sécurité pour récupérer les
      // valeurs VL si la row primaire (soldesByEmp.get) est la mauvaise.
      const allSoldesByEmp = new Map<string, any[]>()
      for (const s of (soldesData || [])) {
        const arr = allSoldesByEmp.get(s.employe_id) || []
        arr.push(s)
        allSoldesByEmp.set(s.employe_id, arr)
      }
      const balances = employees.map((emp: any) => {
        const solde = soldesByEmp.get(emp.id) || null
        // Si après recompute la row est toujours absente (erreur DB), on
        // retourne null pour les soldes au lieu d'inventer des valeurs.
        // Le frontend (F5.2) affiche alors un état d'erreur explicite.
        const alDroit = solde ? Number(solde.al_droit) : null
        const alPris = solde ? Number(solde.al_pris) : null
        const alSolde = solde ? Number(solde.al_solde) : null
        // G5 — Modèle C accrual linéaire mensuel (base paiement compensatoire).
        const alAcquis = solde?.al_acquis != null ? Number(solde.al_acquis) : null
        const alSoldeAcquis = alAcquis != null && alPris != null
          ? Math.round((alAcquis - alPris) * 100) / 100
          : null
        const slDroit = solde ? Number(solde.sl_droit) : null
        const slPris = solde ? Number(solde.sl_pris) : null
        const slSolde = solde ? Number(solde.sl_solde) : null

        // G2 — Vacation Leave (WRA S.47).
        // Bug VL fix-3 — filet de sécurité : si la row primaire a vl_droit=0
        // mais qu'une AUTRE row matching today (cycle anniversaire) existe
        // avec vl_droit>0, on prend cette dernière comme source des valeurs
        // VL. Ça couvre le cas où le tri n'a pas pu trancher (al/sl
        // identiques sur les 2 rows) ET le cas où la row primaire est
        // pertinente pour AL/SL (calendaire) mais pas pour VL.
        let vlSolde_row: any = solde
        const candidates = allSoldesByEmp.get(emp.id) || []
        if ((Number(solde?.vl_droit ?? 0) || 0) <= 0) {
          const better = candidates.find((r: any) => (Number(r.vl_droit) || 0) > 0)
          if (better) vlSolde_row = better
        }
        const vlDroit = vlSolde_row ? Number(vlSolde_row.vl_droit ?? 0) : null
        const vlPris = vlSolde_row ? Number(vlSolde_row.vl_pris ?? 0) : null
        const vlSolde = vlSolde_row ? Number(vlSolde_row.vl_solde ?? 0) : null
        const vlCycleDebut = vlSolde_row?.vl_cycle_debut
          ? String(vlSolde_row.vl_cycle_debut).slice(0, 10)
          : null
        const vlCycleFin = vlSolde_row?.vl_cycle_fin
          ? String(vlSolde_row.vl_cycle_fin).slice(0, 10)
          : null
        // Déterminer le statut VL. G3 — on considère statut_wra + le
        // fait que vl_droit > 0 (déjà calculé par le helper via RPC en
        // tenant compte de la policy société).
        // Statut dérivé :
        //   - pas de date_arrivee → no_date_arrivee
        //   - migrant              → migrant_worker_exclu
        //   - vl_droit > 0 et worker   → eligible
        //   - vl_droit > 0 et hors_wra → eligible_via_policy_societe (policy étendue)
        //   - vl_droit = 0 et hors_wra → hors_wra_basic_sup_50k (policy stricte)
        //   - sinon (worker < 5 ans) → en_acquisition
        const isHorsWra = (Number(emp.salaire_base) || 0) > 50000
        let vlEligibilityStatus:
          | 'eligible'
          | 'eligible_via_policy_societe'
          | 'en_acquisition'
          | 'hors_wra_basic_sup_50k'
          | 'migrant_worker_exclu'
          | 'no_date_arrivee'
        if (!emp.date_arrivee) {
          vlEligibilityStatus = 'no_date_arrivee'
        } else if (emp.is_migrant_worker) {
          vlEligibilityStatus = 'migrant_worker_exclu'
        } else if ((vlDroit || 0) > 0) {
          vlEligibilityStatus = isHorsWra ? 'eligible_via_policy_societe' : 'eligible'
        } else if (isHorsWra) {
          vlEligibilityStatus = 'hors_wra_basic_sup_50k'
        } else {
          vlEligibilityStatus = 'en_acquisition'
        }
        // Date à laquelle l'employé deviendra éligible VL (arrivée + 5 ans).
        let vlEligibilityDate: string | null = null
        if (emp.date_arrivee && vlEligibilityStatus === 'en_acquisition') {
          const arr = new Date(String(emp.date_arrivee).slice(0, 10) + 'T12:00:00')
          const fin5y = new Date(arr)
          fin5y.setFullYear(fin5y.getFullYear() + 5)
          vlEligibilityDate = fin5y.toISOString().slice(0, 10)
        }

        // Sick certificate alert — dérivé des demandes SL approuvées
        const empSl = (slApproved || []).filter((c: any) => c.employe_id === emp.id)
        const sickCertAlert = detectSickCertAlert(empSl)

        // Ancienneté (mois calendaires révolus)
        const hireDate = emp.date_arrivee ? new Date(String(emp.date_arrivee) + 'T00:00:00') : null
        let monthsService = 99
        if (hireDate) {
          monthsService = (now.getFullYear() - hireDate.getFullYear()) * 12
            + (now.getMonth() - hireDate.getMonth())
          if (now.getDate() < hireDate.getDate()) monthsService -= 1
          if (monthsService < 0) monthsService = 0
        }

        // Statut d'éligibilité WRA 2019 (cf. mig 157)
        let eligibilityStatus: 'not_eligible' | 'accruing' | 'eligible' = 'eligible'
        if (monthsService < 6) eligibilityStatus = 'not_eligible'
        else if (monthsService < 12) eligibilityStatus = 'accruing'

        // Date à laquelle l'employé sera pleinement éligible (date_arrivee + 12 mois)
        let eligibilityDate: string | null = null
        if (hireDate && eligibilityStatus !== 'eligible') {
          const eligible = new Date(hireDate)
          eligible.setMonth(eligible.getMonth() + 12)
          eligibilityDate = eligible.toISOString().slice(0, 10)
        }

        // Status color — basé sur ancienneté + al_solde (WRA 2019)
        let statusColor: 'green' | 'orange' | 'red' = 'green'
        const alBalance = alSolde ?? 0
        if (monthsService < 3 || alBalance <= 0) {
          statusColor = 'red'
        } else if (monthsService < 12 || alBalance < 5) {
          statusColor = 'orange'
        }

        return {
          employe_id: emp.id,
          nom: emp.nom,
          prenom: emp.prenom,
          poste: emp.poste,
          societe_id: emp.societe_id,
          gender: emp.genre || emp.gender,
          date_arrivee: emp.date_arrivee,
          salaire_base: emp.salaire_base,
          // G3 — Statut WRA 2019 (computed column mig 162)
          statut_wra: emp.statut_wra || (isHorsWra ? 'hors_wra' : 'worker'),
          // ─── Période courante (B.1) ───
          periode_debut: solde ? String(solde.periode_debut).slice(0, 10) : null,
          periode_fin: solde ? String(solde.periode_fin).slice(0, 10) : null,
          months_service: monthsService,
          eligibility_status: eligibilityStatus,
          eligibility_date: eligibilityDate,
          // ─── Soldes (source de vérité = soldes_conges) ───
          al_droit: alDroit,
          al_pris: alPris,
          al_solde: alSolde,
          al_reporte: solde ? Number(solde.al_reporte ?? 0) : 0,
          // G5 — Modèle C (accrual mensuel linéaire). al_acquis est la base
          // du paiement compensatoire en cas de départ. al_solde_acquis =
          // al_acquis - al_pris (peut différer de al_solde avant M12).
          al_acquis: alAcquis,
          al_solde_acquis: alSoldeAcquis,
          al_impose_societe: solde ? Number(solde.al_impose_societe ?? 0) : 0,
          al_impose_employe: solde ? Number(solde.al_impose_employe ?? 0) : 0,
          sl_droit: slDroit,
          sl_pris: slPris,
          sl_solde: slSolde,
          sl_accumule: solde ? Number(solde.sl_accumule ?? 0) : 0,
          // ─── G2 : Vacation Leave (WRA S.47) ───
          vl_droit: vlDroit,
          vl_pris: vlPris,
          vl_solde: vlSolde,
          vl_paye_compensation: solde ? Number(solde.vl_paye_compensation ?? 0) : 0,
          vl_cycle_debut: vlCycleDebut,
          vl_cycle_fin: vlCycleFin,
          vl_eligibility_status: vlEligibilityStatus,
          vl_eligibility_date: vlEligibilityDate,
          // ─── Rétrocompat : al_deduits / sl_deduits restent exposés ───
          // Avant F5 ils distinguaient "pris approuvés" de "posés pending
          // inclus" — maintenant al_pris = al_deduits (source de vérité).
          al_deduits: alPris,
          sl_deduits: slPris,
          status_color: statusColor,
          sick_cert_alert: sickCertAlert,
          // Signal d'erreur pour le frontend si la row n'a pas pu être chargée
          _missing_solde: solde === null,
        }
      })

      // Summary KPIs
      const totalAlTaken = balances.reduce((s: number, b: any) => s + (Number(b.al_pris) || 0), 0)
      const totalSlTaken = balances.reduce((s: number, b: any) => s + (Number(b.sl_pris) || 0), 0)

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

    // DOC1 hotfix — count documents par demande (bulk, 1 roundtrip).
    const congeIds = (congesData || []).map((c: any) => c.id).filter(Boolean)
    const docCountByDemande = new Map<string, number>()
    if (congeIds.length > 0) {
      const { data: docsRows } = await supabase
        .from('documents_rh')
        .select('lien_demande_conge_id')
        .in('lien_demande_conge_id', congeIds)
        .eq('archive', false)
      for (const row of (docsRows || []) as any[]) {
        const id = row?.lien_demande_conge_id
        if (!id) continue
        docCountByDemande.set(id, (docCountByDemande.get(id) || 0) + 1)
      }
    }

    // Enrich with employee info (no FK join) + documents_count (DOC1 hotfix)
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
        documents_count: docCountByDemande.get(c.id) || 0,
      }
    })

    return NextResponse.json({ conges: congesEnriched, employes: employees })
  } catch (e: any) {
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
    // B.4 — Cible la ROW de la periode anniversaire courante (mig 155).
    // Le client envoie `periode_debut` depuis la balance row affichee.
    // Fallback pour retrocompat : si absent, on resout la periode courante
    // depuis date_arrivee de l'employe + today. Le champ legacy `annee`
    // envoye dans le body est encore lu pour retrocompat mais deprecie.
    if (action === 'modifier_solde') {
      const { employe_id, al_droit, al_pris, sl_droit, sl_pris, date_arrivee } = body
      let periode_debut: string | null = body.periode_debut || null
      if (!employe_id) return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })

      // Update employee date_arrivee if provided
      if (date_arrivee !== undefined) {
        await supabase.from('employes').update({ date_arrivee }).eq('id', employe_id)
      }

      // Fallback : resoudre la periode courante si non fournie.
      if (!periode_debut) {
        const { data: emp } = await supabase
          .from('employes').select('date_arrivee').eq('id', employe_id).maybeSingle()
        if (emp?.date_arrivee) {
          const today = new Date().toISOString().slice(0, 10)
          const { data: pd } = await supabase.rpc('get_conges_period_start', {
            date_arrivee: emp.date_arrivee, date_reference: today,
          })
          if (pd) periode_debut = String(pd).slice(0, 10)
        }
      }

      const updates: any = {}
      if (al_droit !== undefined) updates.al_droit = Number(al_droit)
      if (al_pris !== undefined) updates.al_pris = Number(al_pris)
      if (sl_droit !== undefined) updates.sl_droit = Number(sl_droit)
      if (sl_pris !== undefined) updates.sl_pris = Number(sl_pris)

      if (Object.keys(updates).length === 0 && date_arrivee === undefined) {
        return NextResponse.json({ error: 'Aucun champ a modifier' }, { status: 400 })
      }

      if (Object.keys(updates).length > 0) {
        if (!periode_debut) {
          return NextResponse.json({
            error: 'Impossible de resoudre la periode courante (date_arrivee manquante ?)',
          }, { status: 400 })
        }
        const { data: existing } = await supabase.from('soldes_conges')
          .select('id').eq('employe_id', employe_id).eq('periode_debut', periode_debut).maybeSingle()

        if (existing) {
          const { error } = await supabase.from('soldes_conges').update(updates).eq('id', existing.id)
          if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        } else {
          // Pas de row pour cette periode -> on laisse recomputeSoldeCongesAll
          // creer la row canonique puis on applique les ajustements dessus.
          await recomputeSoldeCongesAll(supabase, employe_id, periode_debut)
          await supabase.from('soldes_conges').update(updates)
            .eq('employe_id', employe_id).eq('periode_debut', periode_debut)
        }
      }

      return NextResponse.json({ success: true })
    }

    // ---- ACTION: creer (create leave request) ----
    // ---- ACTION: modifier_demande (edit pending leave request) ----
    if (action === 'modifier_demande') {
      const { id, date_debut, date_fin, type_conge, motif, demi_journee, matin_ou_apres_midi } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      // Check the request exists
      const { data: existing } = await supabase.from('demandes_conges').select('*').eq('id', id).single()
      if (!existing) return NextResponse.json({ error: 'Demande non trouvee' }, { status: 404 })
      // On autorise la modification d'une demande en attente OU approuvée
      // (congé déjà pris) — le RH doit pouvoir corriger dates/catégorie a
      // posteriori. Le solde est recompute plus bas si approuvée. Une
      // demande refusée ou annulée n'est pas modifiable (statut terminal).
      if (!['en_attente', 'approuve'].includes(existing.statut)) {
        return NextResponse.json({ error: `Impossible de modifier une demande ${existing.statut}` }, { status: 400 })
      }

      // Contrôle d'accès : l'utilisateur doit avoir accès à la société de
      // l'employé (mirror du soft-DELETE). Évite toute édition cross-tenant.
      {
        const { data: empAcc } = await supabase
          .from('employes').select('societe_id').eq('id', existing.employe_id).maybeSingle()
        const accessibleIds = await getUserSocieteIds(user.id)
        if (!empAcc || !accessibleIds.includes(empAcc.societe_id)) {
          return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
        }
      }

      const updates: any = {}
      if (date_debut !== undefined) updates.date_debut = date_debut
      if (date_fin !== undefined) updates.date_fin = date_fin
      if (type_conge !== undefined) updates.type_conge = type_conge
      if (motif !== undefined) updates.motif = motif
      // Demi-journée : sauvegarde le flag + le moment (matin/après-midi).
      // Si demi_journee = false explicite, on remet la demande en full
      // (matin_ou_apres_midi = null pour cohérence).
      if (demi_journee !== undefined) {
        updates.demi_journee = !!demi_journee
        updates.matin_ou_apres_midi = demi_journee
          ? (matin_ou_apres_midi === 'apres_midi' ? 'apres_midi' : 'matin')
          : null
      }

      // Recalculate nb_jours if dates changed
      const newDebut = date_debut || existing.date_debut
      const newFin = date_fin || existing.date_fin
      if (newDebut > newFin) {
        return NextResponse.json({ error: 'La date de fin doit etre apres la date de debut' }, { status: 400 })
      }
      if (demi_journee === true && newDebut === newFin) {
        updates.nb_jours = 0.5
      } else if (date_debut || date_fin || demi_journee !== undefined) {
        // F13 — employee-aware + jours_feries DB (cohérence avec création).
        updates.nb_jours = await computeNbJoursForEmploye(supabase, existing.employe_id, newDebut, newFin)
      }

      const { data, error } = await supabase.from('demandes_conges').update(updates).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // F3 + A.3 — si la demande modifiée est approuvée, recompute la
      // période de 12 mois concernée (dateReference = date_debut du congé).
      if (data?.statut === 'approuve') {
        await recomputeSoldeCongesAll(supabase, data.employe_id, data.date_debut)
      }
      return NextResponse.json({ demande: data })
    }

    if (action === 'creer' || !action) {
      if (!body.employe_id || !body.type_conge || !body.date_debut || !body.date_fin)
        return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

      // Sprint 16 fix — SELECT résilient pour genre (colonne optionnelle mig 047)
      let emp: any = null
      {
        const { data, error } = await supabase.from('employes')
          .select('id, societe_id, gender, genre, auth_user_id, email, date_arrivee, salaire_base, is_migrant_worker')
          .eq('id', body.employe_id).maybeSingle()
        if (error && error.code === '42703') {
          const { data: d2 } = await supabase.from('employes')
            .select('id, societe_id, gender, auth_user_id, email, date_arrivee, salaire_base')
            .eq('id', body.employe_id).maybeSingle()
          emp = d2
        } else {
          emp = data
        }
      }
      if (!emp) {
        return NextResponse.json({ error: 'Employe non trouve' }, { status: 404 })
      }

      // G4 — Validation generique selon conges_regles (mig 170).
      // Gere tous les types (AL/SL/VL/FML/SPC_*/JUR/INT/CRT/MAT/PAT/UL/COM)
      // en lisant la config effective (override societe > globale) et en
      // verifiant anciennete min, basic max, migrant, justificatifs requis.
      //
      // Exceptions pour retrocompat :
      //   - AL/SL : logique interne historique (accrual M6-M12 gere par
      //     get_conges_droits) > garde-fou conges_regles en premier filet.
      //   - VL : logique G2 (get_vacation_leave_droit) plus precise -> garde
      //     la validation VL specifique plus bas comme source autoritaire.
      try {
        const { getTypeCongeConfig, validerJustificatifs, verifierEligibilite } = await import('@/lib/rh/types-conges')
        const cfg = await getTypeCongeConfig(supabase, body.type_conge, emp.societe_id)
        if (cfg.source !== 'default') {
          // Eligibilite (skippee pour VL qui a sa propre route below, et
          // pour AL/SL qui ont le systeme accrual anciennete-aware).
          if (!['AL', 'SL', 'VL'].includes(body.type_conge)) {
            const elig = verifierEligibilite(cfg, emp, body.date_debut)
            if (!elig.eligible) {
              return NextResponse.json({
                error: 'eligibilite_refusee',
                raison: elig.raison,
                date_eligibilite: elig.date_eligibilite || null,
                type_conge: body.type_conge,
                reference_wra: cfg.reference_wra,
              }, { status: 422 })
            }
          }
          // Justificatifs conditionnels.
          //
          // DOC1 hotfix — le frontend (rh/conges/page.tsx + salarié) peut
          // poster `has_pending_files: true` dans le body s'il a des
          // fichiers sélectionnés qui seront uploadés après la création
          // (via POST /api/documents-rh/upload avec lien_demande_conge_id).
          // Dans ce cas on skip la validation URL (le fichier arrive juste
          // après). Si l'upload échoue côté client, la ligne
          // documents_rh.lien_demande_conge_id reste nulle et la demande
          // peut être repérée via la colonne documents_count=0 côté UI.
          //
          // WRA S.46 — SL : certificat médical OBLIGATOIRE seulement si
          // la demande couvre ≥ 3 jours consécutifs. Calcul calendaire
          // (date_fin - date_debut + 1 jour). Court-circuite la règle
          // generic de conges_regles qui dit requiert_certificat_medical
          // pour tous les SL.
          let cfgEffectif = cfg
          if (body.type_conge === 'SL') {
            const d1 = new Date(String(body.date_debut).slice(0, 10) + 'T12:00:00')
            const d2 = new Date(String(body.date_fin).slice(0, 10) + 'T12:00:00')
            const joursConsecutifs = Math.round(
              (d2.getTime() - d1.getTime()) / (24 * 3600 * 1000),
            ) + 1
            if (joursConsecutifs < 3) {
              cfgEffectif = { ...cfg, requiert_certificat_medical: false }
            }
          }
          const hasPendingFiles = body.has_pending_files === true
          if (!hasPendingFiles) {
            const justifValid = validerJustificatifs(cfgEffectif, {
              certificat_medical: body.certificat_medical_url || body.certificat_url,
              acte_naissance: body.acte_naissance_url,
              acte_deces: body.acte_deces_url,
              convocation: body.convocation_url,
            })
            if (!justifValid.ok) {
              return NextResponse.json({
                error: 'justificatifs_manquants',
                manquants: justifValid.manquants,
                type_conge: body.type_conge,
                reference_wra: cfgEffectif.reference_wra,
              }, { status: 422 })
            }
          }
        }
      } catch (e) {
        console.warn('[conges creer G4] validation generique skippee:', (e as any)?.message)
      }

      // G2 + G3 — Validation VL (WRA S.47). Un employé non-éligible
      // (migrant, ou < 5 ans d'ancienneté, ou hors_wra sous policy stricte)
      // ne peut pas soumettre de demande VL.
      if (body.type_conge === 'VL') {
        // Charger la policy de la société pour les hors_wra
        let policyHorsWra = 'applique_wra_etendu'
        if (emp.societe_id) {
          const { data: soc } = await supabase
            .from('societes')
            .select('policy_conges_hors_wra')
            .eq('id', emp.societe_id)
            .maybeSingle()
          if (soc?.policy_conges_hors_wra === 'contrat_uniquement') {
            policyHorsWra = 'contrat_uniquement'
          }
        }
        const { data: vlCheck } = await supabase.rpc('get_vacation_leave_droit', {
          p_date_arrivee: emp.date_arrivee,
          p_salaire_base: Number(emp.salaire_base) || 0,
          p_is_migrant: Boolean(emp.is_migrant_worker),
          p_date_reference: new Date().toISOString().slice(0, 10),
          p_policy_hors_wra: policyHorsWra,
        }).maybeSingle()
        const status = (vlCheck as any)?.eligibility_status
        // 'eligible' (worker) et 'eligible_via_policy_societe' (hors_wra avec policy étendue) sont OK.
        const isEligible = status === 'eligible' || status === 'eligible_via_policy_societe'
        if (!isEligible) {
          return NextResponse.json({
            error: 'vacation_leave_not_eligible',
            detail: "Le salarié n'a pas atteint 5 ans de service OU la policy société hors WRA ne l'autorise pas.",
            eligibility_status: status || 'unknown',
          }, { status: 400 })
        }
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

      if (body.type_conge === 'MAT' && (emp.genre || emp.gender) === 'M') {
        return NextResponse.json({ error: 'Conge maternite reserve aux femmes (WRA 2019)' }, { status: 400 })
      }
      if (body.type_conge === 'PAT' && (emp.genre || emp.gender) === 'F') {
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
        // Sprint 15 FIX 2 — WRA Art. 45 : congé maternité 100% salaire dû
        // uniquement après 12 mois de service continu. Avant 12 mois,
        // l'employeur n'est pas obligé de maintenir 100% — on avertit mais
        // on ne bloque pas (le RH confirme en connaissance de cause via le
        // flag force_mat_avant_12m envoyé par l'UI au 2ème essai).
        const hireDateMat = emp.date_arrivee ? new Date(String(emp.date_arrivee) + 'T00:00:00') : null
        const moisServiceMat = hireDateMat
          ? Math.max(0, (new Date().getFullYear() - hireDateMat.getFullYear()) * 12 + (new Date().getMonth() - hireDateMat.getMonth()))
          : 99
        if (moisServiceMat < 12 && !body.force_mat_avant_12m) {
          return NextResponse.json({
            error: `Ancienneté insuffisante pour congé maternité 100% (${moisServiceMat} mois, minimum 12 mois requis — WRA Art. 45). Confirmez pour accorder quand même.`,
            code: 'MAT_ANCIENNETE_INSUFFISANTE',
            mois_service: moisServiceMat,
          }, { status: 422 })
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

      // Sprint 15 FIX 3 — Max légaux congés spéciaux (WRA 2019).
      // CAR (mariage) = 6j/an, COM (décès) = 3j/an, GAR (garde enfant) = 5j/an.
      // On vérifie le cumul annuel déjà posé (hors refusés) + la nouvelle demande.
      const MAX_JOURS_SPECIAUX: Record<string, { max: number; label: string; ref: string }> = {
        'CAR': { max: 6, label: 'Congé mariage', ref: 'WRA Art. 51' },
        'COM': { max: 3, label: 'Congé décès famille', ref: 'WRA Art. 50' },
        'GAR': { max: 5, label: 'Garde enfant malade', ref: 'WRA Art. 49(2)' },
      }
      const specialRule = MAX_JOURS_SPECIAUX[body.type_conge]
      if (specialRule) {
        const annee = body.date_debut.slice(0, 4)
        const { data: existingSpecial } = await supabase
          .from('demandes_conges')
          .select('nb_jours')
          .eq('employe_id', body.employe_id)
          .eq('type_conge', body.type_conge)
          .neq('statut', 'refuse')
          .gte('date_debut', `${annee}-01-01`)
          .lte('date_debut', `${annee}-12-31`)
        const dejaPoises = (existingSpecial || []).reduce(
          (s: number, c: any) => s + (Number(c.nb_jours) || 0), 0
        )
        if (dejaPoises + nb_jours > specialRule.max) {
          return NextResponse.json({
            error: `${specialRule.label} limité à ${specialRule.max} jour(s) par an (${specialRule.ref}). Déjà posé cette année : ${dejaPoises}j. Demande : ${nb_jours}j → dépasse le maximum.`,
          }, { status: 400 })
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

        // Sprint 7 FIX 3 — période de carence < 6 mois : NE PLUS bloquer.
        // On bascule automatiquement en UL (unpaid leave) exactement comme
        // pour un solde insuffisant. L'employé peut toujours poser son
        // congé ; il sera simplement non payé et déduit du salaire.
        // Avertissement clair retourné au client.
        let monthsService = 99
        if (hireDate) {
          const hire = new Date(hireDate + 'T00:00:00')
          const now = new Date()
          monthsService = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth())
        }
        if (monthsService < 6) {
          typeCongeFinal = 'UL'
          bascule_ul_warning = `Période de carence (${monthsService} mois d'ancienneté / 6 mois requis WRA 2019) — ce congé sera non payé (UL) et déduit du salaire.`
          console.warn(`[conges] BASCULE UL (carence) — employe=${body.employe_id} type=${body.type_conge} ancienneté=${monthsService}mois demande=${nb_jours}j`)
        }

        const entitled = body.type_conge === 'AL'
          ? calculateALEntitlement(hireDate, currentYear)
          : calculateSLEntitlement(hireDate, currentYear)

        const remaining = entitled - taken
        // Sprint 7 FIX 3 — si déjà basculé UL pour carence, skip le check solde
        if (typeCongeFinal !== 'UL' && nb_jours > remaining) {
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
      // F3 — si la demande est déjà approuvée (création directe par RH),
      // recompute immédiatement les soldes. En mode 'en_attente' (demande
      // employé), le recompute se fera à l'approbation.
      if (data?.statut === 'approuve') {
        await recomputeSoldeCongesAll(supabase, data.employe_id, data.date_debut)
      }
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
        await recomputeSoldeCongesAll(supabase, conge.employe_id, conge.date_debut)
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
        await recomputeSoldeCongesAll(supabase, conge.employe_id, conge.date_debut)
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
        await recomputeSoldeCongesAll(supabase, conge.employe_id, conge.date_debut)
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
      // F13 — employee-aware + jours_feries DB pour cohérence modal/back-end.
      const nb_jours = await computeNbJoursForEmploye(supabase, body.employe_id, body.date_debut, dateFin)

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
      // F3 — SL rétroactif statut='approuve' → recompute soldes
      if (data?.employe_id && data?.date_debut) {
        await recomputeSoldeCongesAll(supabase, data.employe_id, data.date_debut)
      }
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
      // F13 — employee-aware + jours_feries DB pour cohérence modal/back-end.
      const nb_jours = await computeNbJoursForEmploye(supabase, body.employe_id, body.date_debut, dateFin)

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
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
