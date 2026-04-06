import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculerBulletin, PARAMS_MRA_DEFAUT } from '@/lib/rh/paie'
import { getUserSocieteIds, userHasAccessToSociete, userHasAccessToEmploye } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const JOURS_FERIES_MU = ["01-01", "02-01", "12-03", "01-05", "09-05", "15-08", "02-11", "25-12"]

function isFerie(dateStr: string): boolean { return JOURS_FERIES_MU.includes(dateStr.slice(5)) }
function isWeekend(dateStr: string): boolean { const d = new Date(dateStr + "T12:00:00"); return d.getDay() === 0 || d.getDay() === 6 }

// Bug 4 fix: OT threshold comes from planning (heures_prevues) instead of hardcoded 9.
// planningHours = planned working hours for the day (e.g. 8 for 3x8, 9 for standard).
// isPlannedWorkDay = true if there's a planning_assignment that is NOT repos for this day.
// Weekend/unplanned work: if employee works on a day NOT in planning, all hours are OT at 1.5x.
function calcOT(hEntree: string, hSortie: string, ferieDay: boolean, planningHours: number = 9, isPlannedWorkDay: boolean = true) {
  if (!hEntree || !hSortie) return { normales: 0, ot15: 0, ot2: 0 }
  const debut = new Date(`1970-01-01T${hEntree}`)
  const fin = new Date(`1970-01-01T${hSortie}`)
  let totalH = (fin.getTime() - debut.getTime()) / 3600000 - 1
  if (totalH <= 0) totalH = 0
  // Public holiday: all hours at 2x
  if (ferieDay) return { normales: 0, ot15: 0, ot2: totalH }
  // Unplanned work day (not in planning or planning says Repos): all hours at 1.5x
  if (!isPlannedWorkDay) return { normales: 0, ot15: totalH, ot2: 0 }
  // Normal planned work day: OT starts after planningHours
  const normales = Math.min(totalH, planningHours)
  const reste = Math.max(totalH - planningHours, 0)
  return { normales, ot15: Math.min(reste, 2), ot2: Math.max(reste - 2, 0) }
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const supabase = getAdminClient()

    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    const periode = searchParams.get('periode')
    const societe_id = searchParams.get('societe_id')

    // Multi-tenant: verify access
    if (societe_id) {
      const hasAccess = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
    }
    if (employe_id && !societe_id) {
      const hasAccess = await userHasAccessToEmploye(user.id, employe_id)
      if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })
    }
    // If neither societe_id nor employe_id, restrict to accessible societes
    const accessibleIds = (!societe_id && !employe_id) ? await getUserSocieteIds(user.id) : []
    if (!societe_id && !employe_id && accessibleIds.length === 0) {
      return NextResponse.json({ bulletins: [], totaux: {}, nb: 0 })
    }

    // Query bulletins (NO FK join — avoids schema cache issues)
    let query = supabase
      .from('bulletins_paie')
      .select('*')
      .order('periode', { ascending: false })

    if (employe_id) query = query.eq('employe_id', employe_id)
    if (periode) query = query.gte('periode', `${periode}-01`).lte('periode', `${periode}-31`)
    if (societe_id) {
      query = query.eq('societe_id', societe_id)
    } else if (!employe_id && accessibleIds.length > 0) {
      query = query.in('societe_id', accessibleIds)
    }

    const { data, error } = await query
    if (error) {
      console.error('[paie GET] query error:', error.message)
      throw error
    }

    // Enrich with employee names (separate query)
    const empIds = [...new Set((data || []).map(b => b.employe_id))]
    let empMap: Record<string, any> = {}
    if (empIds.length > 0) {
      const { data: emps } = await supabase.from('employes').select('id, code_employe, nom, prenom, poste, devise_salaire').in('id', empIds)
      for (const e of emps || []) empMap[e.id] = { code: e.code_employe, nom: e.nom, prenom: e.prenom, poste: e.poste, devise_salaire: e.devise_salaire }
    }

    // salaire_brut is a GENERATED column in PostgreSQL:
    // = salaire_base + increment + OT + transport + petrol + special_1 + special_2 + special_3 + other + eoy + departure
    // So it's ALWAYS correct as long as its components are correct.
    // We just need to ensure display values make sense.
    const enriched = (data || []).map(b => {
      const salaire_brut = Number(b.salaire_brut) || 0
      const salaire_net = Number(b.salaire_net) || 0
      const salaire_base = Number(b.salaire_base) || 0
      const ot = Number(b.heures_sup_montant) || 0
      const csg_s = Number(b.csg_salarie) || 0
      const nsf_s = Number(b.nsf_salarie) || 0
      const paye_v = Number(b.paye) || 0
      const absence = Number(b.montant_absence) || 0
      const total_deductions = Number(b.total_deductions) || (csg_s + nsf_s + paye_v + absence)

      // Recalculate primes if missing: primes = brut - base - OT - other components
      let primes = Number(b.special_allowance_1) || 0
      if (primes === 0 && salaire_brut > salaire_base + ot) {
        primes = Math.round(salaire_brut - salaire_base - ot
          - (Number(b.transport_allowance) || 0) - (Number(b.petrol_allowance) || 0)
          - (Number(b.increment_salaire) || 0) - (Number(b.special_allowance_2) || 0)
          - (Number(b.special_allowance_3) || 0) - (Number(b.other_refund) || 0)
          - (Number(b.eoy_bonus) || 0) - (Number(b.departure_notice) || 0))
        if (primes < 0) primes = 0
      }

      const csg_p = Number(b.csg_patronal) || 0
      const nsf_p = Number(b.nsf_patronal) || 0
      const levy = Number(b.training_levy) || 0
      const prgf = Number(b.prgf) || 0
      const total_charges = Number(b.total_charges_patronales) || (csg_p + nsf_p + levy + prgf)
      const cout_total = salaire_brut + total_charges

      return {
        ...b,
        special_allowance_1: primes,
        total_deductions,
        total_charges_patronales: total_charges,
        cout_total_employeur: cout_total,
        employe: empMap[b.employe_id] || null,
      }
    })

    const totaux = {
      masse_salariale_brute: enriched.reduce((s, b) => s + Number(b.salaire_brut), 0),
      masse_salariale_nette: enriched.reduce((s, b) => s + (Number(b.salaire_net) || 0), 0),
      total_charges_patronales: enriched.reduce((s, b) => s + Number(b.total_charges_patronales), 0),
      cout_total_employeur: enriched.reduce((s, b) => s + Number(b.cout_total_employeur), 0),
      total_refacture: enriched.reduce((s, b) => s + (Number(b.montant_refacture_mur) || 0), 0),
    }

    console.log(`[paie GET] ${enriched.length} bulletins, periode=${periode}, societe=${societe_id || 'all'}`)
    return NextResponse.json({ bulletins: enriched, totaux, nb: enriched.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const supabase = getAdminClient()

    const body = await request.json()
    const { action, employe_id, societe_id, periode } = body

    // Récupérer paramètres MRA
    const { data: paramsDB } = await supabase.from('parametres_paie_mra').select('*').order('annee', { ascending: false }).limit(1).maybeSingle()
    const params = paramsDB ? {
      csg_seuil_taux_reduit: Number(paramsDB.csg_seuil_taux_reduit),
      csg_salarie_taux_reduit: Number(paramsDB.csg_salarie_taux_reduit),
      csg_salarie_taux_plein: Number(paramsDB.csg_salarie_taux_plein),
      csg_patronal: Number(paramsDB.csg_patronal),
      nsf_salarie: Number(paramsDB.nsf_salarie),
      nsf_patronal: Number(paramsDB.nsf_patronal),
      training_levy: Number(paramsDB.training_levy),
      prgf_patronal_par_jour: Number(paramsDB.prgf_patronal_par_jour ?? 4.50),
      prgf_taux_emoluments: Number(paramsDB.prgf_taux_emoluments ?? 0.045),
      paye_seuil_exoneration: Number(paramsDB.paye_seuil_exoneration ?? 390000),
      paye_taux_1: Number(paramsDB.paye_taux_1 ?? 0.10),
      paye_seuil_taux_2: Number(paramsDB.paye_seuil_taux_2 ?? 650000),
      paye_taux_2: Number(paramsDB.paye_taux_2 ?? 0.15),
      salary_compensation: Number(paramsDB.salary_compensation ?? 635),
      salary_compensation_seuil: Number(paramsDB.salary_compensation_seuil ?? 50000),
    } : PARAMS_MRA_DEFAUT

    const periodeDate = periode ? `${periode}-01` : `${new Date().toISOString().slice(0, 7)}-01`
    const periodeStr = periodeDate.slice(0, 7)

    // ══════════════════════════════════════════════════════
    // ACTION : calculer (employé unique)
    // ══════════════════════════════════════════════════════
    if (action === 'calculer') {
      // Multi-tenant: verify access to the target société
      const targetSocieteId = societe_id || null
      if (targetSocieteId) {
        const hasAccess = await userHasAccessToSociete(user.id, targetSocieteId)
        if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      } else if (employe_id) {
        const hasAccess = await userHasAccessToEmploye(user.id, employe_id)
        if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })
      }

      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).single()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // 1. Récupérer OT de la période depuis les pointages
      const { data: pointagesMois } = await supabase.from('pointages')
        .select('*').eq('employe_id', employe_id)
        .gte('date_pointage', `${periodeStr}-01`)
        .lte('date_pointage', `${periodeStr}-31`)

      // Bug 4 fix: fetch planning assignments for this employee+period to determine planned hours
      const { data: planAssignments } = await supabase.from('planning_assignments')
        .select('date, shift_code, heures_prevues, est_repos')
        .eq('employe_id', employe_id)
        .gte('date', `${periodeStr}-01`)
        .lte('date', `${periodeStr}-31`)
      const planMap: Record<string, { heures_prevues: number; est_repos: boolean }> = {}
      for (const pa of planAssignments || []) {
        planMap[pa.date] = { heures_prevues: Number(pa.heures_prevues) || 8, est_repos: pa.est_repos }
      }

      let total_ot_montant = 0
      const taux_horaire = Number(emp.salaire_base) / (45 * 52 / 12)
      let jours_travailles = 0

      for (const pt of pointagesMois || []) {
        if (!pt.heure_entree) continue
        jours_travailles++
        const ferie = isFerie(pt.date_pointage)
        const plan = planMap[pt.date_pointage]
        // If planning exists, use planned hours as OT threshold; default to 9 (standard)
        const planningHours = plan ? plan.heures_prevues : 9
        // Work day is "planned" if planning says it's a work day (not repos)
        // If no planning exists, fall back to weekday=planned, weekend=unplanned
        const isPlannedWorkDay = plan ? !plan.est_repos : !isWeekend(pt.date_pointage)
        const ot = calcOT(pt.heure_entree, pt.heure_sortie || '', ferie, planningHours, isPlannedWorkDay)
        const montant15 = ot.ot15 * taux_horaire * 1.5
        const montant2 = ot.ot2 * taux_horaire * 2
        total_ot_montant += montant15 + montant2
      }

      // 2. Récupérer toutes les primes de la période (approuvées ou saisies par un RH/admin)
      const { data: primesMois } = await supabase.from('primes_variables_mois')
        .select('*').eq('employe_id', employe_id).eq('periode', periodeDate)

      const total_primes = (primesMois || []).reduce((s, p) => s + Number(p.montant || 0), 0)

      // 3. Récupérer absences injustifiées
      const { data: congesApprouves } = await supabase.from('demandes_conges')
        .select('*').eq('employe_id', employe_id).eq('statut', 'approuve')
        .gte('date_debut', `${periodeStr}-01`).lte('date_fin', `${periodeStr}-31`)

      let jours_absence_injust = 0
      for (const pt of pointagesMois || []) {
        if (isWeekend(pt.date_pointage)) continue
        const enConge = (congesApprouves || []).some(c => pt.date_pointage >= c.date_debut && pt.date_pointage <= c.date_fin)
        if (!pt.heure_entree && !enConge && pt.absent_justifie !== true) jours_absence_injust++
      }
      const montant_absence = Math.round(jours_absence_injust * (Number(emp.salaire_base) / 26) * 100) / 100

      // 4. Conversion EUR si applicable
      let salaire_base_mur = Number(emp.salaire_base)
      if (emp.devise_salaire === 'EUR') {
        const taux = Number(emp.taux_change_eur) || 46.50
        salaire_base_mur = Math.round(salaire_base_mur * taux)
      }

      const elements = {
        salaire_base: salaire_base_mur,
        transport_allowance: Number(emp.transport_allowance) || 0,
        petrol_allowance: Number(emp.petrol_allowance) || 0,
        increment_salaire: body.increment_salaire || 0,
        heures_sup_montant: Math.round(total_ot_montant) + (body.heures_sup_montant || 0),
        special_allowance_1: total_primes + (body.special_allowance_1 || 0),
        special_allowance_2: body.special_allowance_2 || 0,
        special_allowance_3: body.special_allowance_3 || 0,
        other_refund: body.other_refund || 0,
        eoy_bonus: body.eoy_bonus || 0,
        departure_notice: body.departure_notice || 0,
      }

      const joursTravailles = jours_travailles > 0 ? jours_travailles : (body.jours_travailles || 26)
      const resultat = calculerBulletin(elements, params, joursTravailles, Number(emp.pct_refacturation) || 0)

      // Déduire absences injustifiées du net
      const salaire_net_final = Math.round((resultat.salaire_net - montant_absence) * 100) / 100

      const bulletin: Record<string, any> = {
        employe_id, societe_id: societe_id || emp.societe_id,
        periode: periodeDate,
        salaire_base: elements.salaire_base,
        // salaire_brut is GENERATED ALWAYS — do NOT include
        salaire_net: salaire_net_final,
        csg_salarie: resultat.csg_salarie,
        csg_patronal: resultat.csg_patronal,
        nsf_salarie: resultat.nsf_salarie,
        nsf_patronal: resultat.nsf_patronal,
        paye: resultat.paye,
        training_levy: resultat.training_levy,
        prgf: resultat.prgf,
        total_deductions: Math.round((resultat.total_deductions + montant_absence) * 100) / 100,
        total_charges_patronales: resultat.total_charges_patronales,
        heures_sup_montant: elements.heures_sup_montant || 0,
        special_allowance_1: elements.special_allowance_1 || 0,
        transport_allowance: elements.transport_allowance || 0,
        petrol_allowance: elements.petrol_allowance || 0,
        montant_absence: montant_absence,
        statut: 'brouillon',
      }

      const { data, error } = await supabase.from('bulletins_paie').upsert(bulletin, { onConflict: 'employe_id,periode' }).select().single()
      if (error) {
        console.error('[paie calculer]', error.message, error.details, error.hint)
        return NextResponse.json({ error: `Erreur bulletin: ${error.message}`, details: error.details, hint: error.hint }, { status: 500 })
      }

      // Marquer les primes comme intégrées (colonne integre_paie + date_integration ajoutées en migration 028)
      if (primesMois && primesMois.length > 0) {
        await supabase.from('primes_variables_mois')
          .update({ integre_paie: true, date_integration: new Date().toISOString() })
          .in('id', primesMois.map(p => p.id))
      }

      return NextResponse.json({ bulletin: data, simulation: { ...resultat, total_ot_montant, total_primes, montant_absence, jours_travailles } })
    }

    // ══════════════════════════════════════════════════════
    // ACTION : calculer_batch (tous les employés de la société)
    // ══════════════════════════════════════════════════════
    if (action === 'calculer_batch') {
      if (!societe_id) {
        return NextResponse.json({ error: 'societe_id requis pour calculer_batch', bulletins: [], nb: 0 }, { status: 400 })
      }

      // Multi-tenant: verify access to this société
      const hasAccess = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })

      // LOCK GUARD: check if period is locked
      const { data: existingLocked } = await supabase.from('bulletins_paie')
        .select('id').eq('societe_id', societe_id)
        .gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`)
        .eq('verrouille', true).limit(1)
      if (existingLocked && existingLocked.length > 0) {
        return NextResponse.json({ error: 'Période verrouillée — impossible de recalculer. Déverrouillez d\'abord.', bulletins: [], nb: 0 }, { status: 403 })
      }

      // Get all employees for this société
      const { data: allEmps, error: empError } = await supabase.from('employes').select('*').eq('societe_id', societe_id)

      if (empError) {
        console.error('[paie batch] Error fetching employees:', empError.message)
        return NextResponse.json({ error: `Erreur employes: ${empError.message}`, bulletins: [], nb: 0 }, { status: 500 })
      }

      if (!allEmps || allEmps.length === 0) {
        return NextResponse.json({ error: `Aucun employe trouve pour societe_id=${societe_id}`, bulletins: [], nb: 0, debug: { societe_id, periode: periodeStr } }, { status: 400 })
      }

      // Filter out departed employees — only include if still active during this period
      // Use both `actif` field (GENERATED from date_depart IS NULL) and date_depart comparison
      const employes = allEmps.filter(e => {
        // If no date_depart set → active
        if (!e.date_depart && e.actif !== false) return true
        // If explicitly inactive with no date
        if (e.actif === false && !e.date_depart) return false
        // If date_depart exists, include only if they departed during or after this period
        if (e.date_depart) {
          const depart = String(e.date_depart).slice(0, 10)
          const periodeDebut = `${periodeStr}-01`
          return depart >= periodeDebut
        }
        return true
      })
      // Log filtered-out employees for debugging
      const excluded = allEmps.filter(e => !employes.includes(e))
      for (const e of excluded) {
        console.log(`[paie batch] EXCLU: ${e.prenom} ${e.nom} — date_depart=${e.date_depart}, actif=${e.actif}`)
      }
      // Log all employees with their depart status for debugging
      for (const e of allEmps) {
        if (e.nom && (e.nom.toLowerCase().includes('godder') || e.nom.toLowerCase().includes('haggoo'))) {
          console.log(`[paie batch] DEBUG ${e.prenom} ${e.nom}: date_depart=${JSON.stringify(e.date_depart)}, actif=${JSON.stringify(e.actif)}, exclure_mra=${JSON.stringify(e.exclure_mra)}, included=${employes.includes(e)}`)
        }
      }
      console.log(`[paie batch] ${employes.length} employes actifs sur ${allEmps.length} total pour societe=${societe_id}, periode=${periodeStr}`)

      // Get variables from request body if provided
      const requestVariables: Record<string, any> = {}
      if (body.variables && Array.isArray(body.variables)) {
        body.variables.forEach((v: any) => { requestVariables[v.employe_id] = v })
      }
      const bulletinsSauvegardes = []
      const erreurs: string[] = []

      for (const emp of employes || []) {
        // 1. OT depuis pointages
        const { data: pointagesMois } = await supabase.from('pointages')
          .select('*').eq('employe_id', emp.id)
          .gte('date_pointage', `${periodeStr}-01`).lte('date_pointage', `${periodeStr}-31`)

        // Bug 4 fix: fetch planning assignments for this employee+period
        const { data: planAssignments } = await supabase.from('planning_assignments')
          .select('date, shift_code, heures_prevues, est_repos')
          .eq('employe_id', emp.id)
          .gte('date', `${periodeStr}-01`)
          .lte('date', `${periodeStr}-31`)
        const planMap: Record<string, { heures_prevues: number; est_repos: boolean }> = {}
        for (const pa of planAssignments || []) {
          planMap[pa.date] = { heures_prevues: Number(pa.heures_prevues) || 8, est_repos: pa.est_repos }
        }

        let total_ot_montant = 0
        const taux_horaire = Number(emp.salaire_base) / (45 * 52 / 12)
        let jours_travailles = 0

        for (const pt of pointagesMois || []) {
          if (!pt.heure_entree) continue
          jours_travailles++
          const ferie = isFerie(pt.date_pointage)
          const plan = planMap[pt.date_pointage]
          const planningHours = plan ? plan.heures_prevues : 9
          const isPlannedWorkDay = plan ? !plan.est_repos : !isWeekend(pt.date_pointage)
          const ot = calcOT(pt.heure_entree, pt.heure_sortie || '', ferie, planningHours, isPlannedWorkDay)
          total_ot_montant += ot.ot15 * taux_horaire * 1.5 + ot.ot2 * taux_horaire * 2
        }

        // 2. Toutes les primes de la période (approuvées ou saisies)
        const { data: primesMois } = await supabase.from('primes_variables_mois')
          .select('*').eq('employe_id', emp.id).eq('periode', periodeDate)
        let total_primes = (primesMois || []).reduce((s, p) => s + Number(p.montant || 0), 0)

        // 3. Congés approuvés du mois — distinguer SL (réduit seuil OT) vs AL (ne réduit pas)
        const { data: congesApprouves } = await supabase.from('demandes_conges')
          .select('*').eq('employe_id', emp.id).eq('statut', 'approuve')
          .gte('date_debut', `${periodeStr}-01`).lte('date_fin', `${periodeStr}-31`)

        // Count sick leave days (SL) — reduces the monthly OT threshold
        let joursSickLeave = 0
        let joursLocalLeave = 0
        for (const c of congesApprouves || []) {
          const start = new Date(c.date_debut + 'T12:00:00')
          const end = new Date(c.date_fin + 'T12:00:00')
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getDay() !== 0 && d.getDay() !== 6) { // exclude weekends
              if (c.type_conge === 'SL') joursSickLeave++
              else if (c.type_conge === 'AL') joursLocalLeave++
            }
          }
        }

        // Monthly OT threshold: standard hours minus sick leave hours
        // Sick Leave reduces the expected hours (employee was sick, can't make it up with OT)
        // Local Leave does NOT reduce the threshold (employee chose to take leave)
        const heuresParJour = 9 // standard daily hours
        const joursTravailMois = 26 // standard working days per month
        const seuilMensuelStandard = joursTravailMois * heuresParJour // 234h standard
        const seuilAjuste = (joursTravailMois - joursSickLeave) * heuresParJour
        // Note: joursLocalLeave do NOT reduce the threshold

        // Calculate total hours worked from pointages
        let totalHeuresTravaillees = 0
        for (const pt of pointagesMois || []) {
          if (!pt.heure_entree || !pt.heure_sortie) continue
          const debut = new Date(`1970-01-01T${pt.heure_entree}`)
          const fin = new Date(`1970-01-01T${pt.heure_sortie}`)
          let h = (fin.getTime() - debut.getTime()) / 3600000 - 1 // minus 1h lunch
          if (h < 0) h = 0
          totalHeuresTravaillees += h
        }

        // OT is still calculated per-day for the rate breakdown (1.5x vs 2x)
        // but the monthly total is capped by the adjusted threshold
        // If total worked <= adjusted threshold, no OT even if some days were long
        const otMensuelBrut = Math.max(0, totalHeuresTravaillees - seuilAjuste)

        // Scale the daily OT proportionally if monthly OT is less than sum of daily OT
        const dailyOtSum = total_ot_montant / taux_horaire // approximate hours from daily calc
        const otScaleFactor = dailyOtSum > 0 && otMensuelBrut < dailyOtSum ? otMensuelBrut / dailyOtSum : 1
        total_ot_montant = Math.round(total_ot_montant * otScaleFactor)

        // 4. Absences injustifiées

        let jours_absence_injust = 0
        for (const pt of pointagesMois || []) {
          if (isWeekend(pt.date_pointage)) continue
          const enConge = (congesApprouves || []).some(c => pt.date_pointage >= c.date_debut && pt.date_pointage <= c.date_fin)
          if (!pt.heure_entree && !enConge && pt.absent_justifie !== true) jours_absence_injust++
        }
        // 4. Override with request variables if provided
        const reqVar = requestVariables[emp.id]
        if (reqVar) {
          if (reqVar.jours_travailles) jours_travailles = reqVar.jours_travailles
          if (reqVar.absences) jours_absence_injust = reqVar.absences
          if (reqVar.primes) total_primes += Number(reqVar.primes) || 0
          if (reqVar.heures_sup_150) total_ot_montant += (Number(reqVar.heures_sup_150) || 0) * (Number(emp.salaire_base) / (45 * 52 / 12)) * 1.5
          if (reqVar.heures_sup_200) total_ot_montant += (Number(reqVar.heures_sup_200) || 0) * (Number(emp.salaire_base) / (45 * 52 / 12)) * 2
        }
        const montant_absence_final = Math.round(jours_absence_injust * (Number(emp.salaire_base) / 26) * 100) / 100

        // 5. Conversion EUR
        let salaire_base_mur = Number(emp.salaire_base)
        if (emp.devise_salaire === 'EUR') {
          const taux = Number(emp.taux_change_eur) || 46.50
          salaire_base_mur = Math.round(salaire_base_mur * taux)
        }

        // EOY bonus: if include_eoy_bonus is set, compute 1/12 of annual basic
        let eoy_bonus_montant = 0
        if (body.include_eoy_bonus && periodeStr.endsWith("-12")) {
          eoy_bonus_montant = Math.round(salaire_base_mur) // 1 month's basic salary as 13th month
        }

        const isHorsMRA = emp.exclure_mra === true

        // Hors champs MRA : salaire brut = salaire de base uniquement
        // Pas de transport, petrol, OT, primes, pas de salary compensation
        const elements = isHorsMRA ? {
          salaire_base: salaire_base_mur,
          salary_compensation: 0,
          transport_allowance: 0,
          petrol_allowance: 0,
          heures_sup_montant: 0,
          special_allowance_1: 0,
          special_allowance_2: 0,
          special_allowance_3: 0,
          increment_salaire: 0,
          other_refund: 0,
          departure_notice: 0,
          commission: 0,
          eoy_bonus: 0,
        } : {
          salaire_base: salaire_base_mur,
          transport_allowance: Number(emp.transport_allowance) || 0,
          petrol_allowance: Number(emp.petrol_allowance) || 0,
          heures_sup_montant: Math.round(total_ot_montant),
          special_allowance_1: Math.round(total_primes),
          eoy_bonus: eoy_bonus_montant,
        }

        const jt = jours_travailles > 0 ? jours_travailles : 26
        const resultat = calculerBulletin(elements, params, jt, Number(emp.pct_refacturation) || 0)

        // Hors champs MRA : pas de CSG, NSF, PAYE, pas de charges patronales
        if (isHorsMRA) {
          resultat.csg_salarie = 0
          resultat.csg_patronal = 0
          resultat.csg_bonus = 0
          resultat.csg_patronal_bonus = 0
          resultat.nsf_salarie = 0
          resultat.nsf_patronal = 0
          resultat.paye = 0
          resultat.training_levy = 0
          resultat.prgf = 0
          resultat.total_deductions = 0
          resultat.total_charges_patronales = 0
          resultat.salaire_net = salaire_base_mur // net = base pour hors MRA
        }
        const salaire_net_final = isHorsMRA ? salaire_base_mur : Math.round((resultat.salaire_net - montant_absence_final) * 100) / 100

        // Résumé notes pour le bulletin
        const transportAlloc = isHorsMRA ? 0 : (Number(emp.transport_allowance) || 0)
        const petrolAlloc = isHorsMRA ? 0 : (Number(emp.petrol_allowance) || 0)
        const mraTag = isHorsMRA ? ' [HORS MRA - Brut=Base]' : ''
        const notesResume = isHorsMRA
          ? `Base: ${salaire_base_mur} [HORS MRA - Brut=Net=Base]`
          : `Base: ${salaire_base_mur}, Transport: ${transportAlloc}, Petrol: ${petrolAlloc}, OT: ${Math.round(total_ot_montant)}, Primes: ${Math.round(total_primes)}, Absences: ${jours_absence_injust}j`
        console.log(`[paie] ${emp.prenom} ${emp.nom}: base=${salaire_base_mur} transport=${transportAlloc} petrol=${petrolAlloc} OT=${Math.round(total_ot_montant)} primes=${Math.round(total_primes)} abs=${jours_absence_injust}${mraTag}`)

        const bulletin: Record<string, any> = {
          employe_id: emp.id,
          societe_id,
          periode: periodeDate,
          salaire_base: salaire_base_mur,
          // salaire_brut is GENERATED ALWAYS — do NOT include it
          salaire_net: salaire_net_final,
          csg_salarie: resultat.csg_salarie,
          csg_patronal: resultat.csg_patronal,
          nsf_salarie: resultat.nsf_salarie,
          nsf_patronal: resultat.nsf_patronal,
          paye: resultat.paye,
          training_levy: resultat.training_levy,
          prgf: resultat.prgf,
          total_deductions: Math.round((resultat.total_deductions + montant_absence_final) * 100) / 100,
          total_charges_patronales: resultat.total_charges_patronales,
          heures_sup_montant: isHorsMRA ? 0 : Math.round(total_ot_montant),
          special_allowance_1: isHorsMRA ? 0 : Math.round(total_primes),
          transport_allowance: isHorsMRA ? 0 : (Number(emp.transport_allowance) || 0),
          petrol_allowance: isHorsMRA ? 0 : (Number(emp.petrol_allowance) || 0),
          increment_salaire: isHorsMRA ? 0 : (Number(emp.increment_salaire) || 0),
          other_refund: isHorsMRA ? 0 : (Number(emp.other_refund) || 0),
          eoy_bonus: isHorsMRA ? 0 : eoy_bonus_montant,
          montant_absence: isHorsMRA ? 0 : montant_absence_final,
          notes: notesResume,
          statut: 'brouillon',
        }

        // Remove fields that may not exist in DB schema (ResultatPaie extras)
        const fieldsToRemove = [
          'salary_compensation_montant', 'total_emoluments', 'prgf_pct_emoluments',
          'prgf_par_jour', 'montant_refacture_mur', 'csg_taux', 'csg_bonus',
          'salaire_brut_base', 'resultat_net', 'salaire_brut', 'cout_total_employeur',
          'jours_travailles', 'csg_patronal_bonus'
        ]
        for (const f of fieldsToRemove) delete (bulletin as any)[f]
        console.log(`[paie batch] ${emp.nom} ${emp.prenom}: base=${salaire_base_mur}, brut=${resultat.salaire_brut}, net=${salaire_net_final}`)

        // Try upsert first, fallback to select+update/insert if UNIQUE constraint is missing
        let saved: any = null
        let error: any = null

        // Check if bulletin already exists for this employee+period
        const { data: existing } = await supabase.from('bulletins_paie')
          .select('id').eq('employe_id', emp.id).eq('periode', periodeDate).maybeSingle()

        if (existing) {
          // UPDATE existing bulletin
          const { data: updated, error: upErr } = await supabase.from('bulletins_paie')
            .update(bulletin).eq('id', existing.id).select().single()
          saved = updated
          error = upErr
        } else {
          // INSERT new bulletin
          const { data: inserted, error: insErr } = await supabase.from('bulletins_paie')
            .insert(bulletin).select().single()
          saved = inserted
          error = insErr
        }

        if (error) {
          const errMsg = `${emp.nom} ${emp.prenom}: ${error.message}${error.details ? ' — ' + error.details : ''}${error.hint ? ' (hint: ' + error.hint + ')' : ''}`
          console.error(`[paie batch] SAVE FAILED:`, errMsg)
          erreurs.push(errMsg)
        }
        if (!error && saved) {
          bulletinsSauvegardes.push({ ...saved, nom: emp.nom, prenom: emp.prenom, employe: { id: emp.id, code: emp.code_employe, nom: emp.nom, prenom: emp.prenom, poste: emp.poste } })
          // Marquer primes intégrées (colonne integre_paie + date_integration ajoutées en migration 028)
          if (primesMois && primesMois.length > 0) {
            await supabase.from('primes_variables_mois')
              .update({ integre_paie: true, date_integration: new Date().toISOString() })
              .in('id', primesMois.map((p: any) => p.id))
          }
        }
      }

      const totaux = {
        masse_salariale_brute: bulletinsSauvegardes.reduce((s, b) => s + Number(b.salaire_brut || 0), 0),
        masse_salariale_nette: bulletinsSauvegardes.reduce((s, b) => s + Number(b.salaire_net || 0), 0),
        total_charges_patronales: bulletinsSauvegardes.reduce((s, b) => s + Number(b.total_charges_patronales || 0), 0),
        cout_total_employeur: bulletinsSauvegardes.reduce((s, b) => s + Number(b.salaire_brut || 0) + Number(b.total_charges_patronales || 0), 0),
      }

      return NextResponse.json({
        bulletins: bulletinsSauvegardes,
        totaux,
        nb: bulletinsSauvegardes.length,
        nb_employes: employes.length,
        erreurs: erreurs.length > 0 ? erreurs : undefined,
        debug: { societe_id, periode: periodeStr, nb_employes_total: allEmps.length, nb_actifs: employes.length, nb_bulletins: bulletinsSauvegardes.length, nb_erreurs: erreurs.length }
      })
    }

    // ══════════════════════════════════════════════════════════════
    // Mark employee as hors MRA or set departure date
    // ══════════════════════════════════════════════════════════════
    if (action === 'modifier_employe') {
      const { employe_id: eid, champs: empChamps } = body
      if (!eid || !empChamps) return NextResponse.json({ error: 'employe_id et champs requis' }, { status: 400 })
      const allowedEmp = ['exclure_mra', 'date_depart', 'actif']
      const empUpdates: Record<string, any> = {}
      for (const [k, v] of Object.entries(empChamps)) {
        if (allowedEmp.includes(k)) empUpdates[k] = v
      }
      // Can't set actif directly (GENERATED), use date_depart instead
      if ('actif' in empUpdates && empUpdates.actif === false && !empUpdates.date_depart) {
        empUpdates.date_depart = new Date().toISOString().slice(0, 10)
        delete empUpdates.actif
      }
      if ('actif' in empUpdates) delete empUpdates.actif // can't write GENERATED column
      if (Object.keys(empUpdates).length === 0) return NextResponse.json({ error: 'Aucun champ modifiable' }, { status: 400 })
      const { error: empErr } = await supabase.from('employes').update(empUpdates).eq('id', eid)
      if (empErr) {
        console.error('[modifier_employe] error:', empErr.message)
        return NextResponse.json({ error: empErr.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════
    // Delete a specific bulletin
    // ══════════════════════════════════════════════════════════════
    if (action === 'supprimer_bulletin') {
      const { bulletin_id: bid } = body
      if (!bid) return NextResponse.json({ error: 'bulletin_id requis' }, { status: 400 })
      const { data: bul } = await supabase.from('bulletins_paie').select('id, verrouille').eq('id', bid).single()
      if (!bul) return NextResponse.json({ error: 'Bulletin non trouve' }, { status: 404 })
      if (bul.verrouille) return NextResponse.json({ error: 'Bulletin verrouille' }, { status: 403 })
      const { error: dErr } = await supabase.from('bulletins_paie').delete().eq('id', bid)
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════
    // Manual edit of a single bulletin
    // ══════════════════════════════════════════════════════════════
    if (action === 'modifier_bulletin') {
      const { bulletin_id, champs } = body
      if (!bulletin_id || !champs) return NextResponse.json({ error: 'bulletin_id et champs requis' }, { status: 400 })

      // Check lock
      const { data: existing } = await supabase.from('bulletins_paie').select('id, verrouille, statut').eq('id', bulletin_id).single()
      if (!existing) return NextResponse.json({ error: 'Bulletin non trouve' }, { status: 404 })
      if (existing.verrouille) return NextResponse.json({ error: 'Bulletin verrouille — modification impossible' }, { status: 403 })

      // Only allow these fields to be manually edited
      const allowed = ['salaire_base', 'heures_sup_montant', 'special_allowance_1', 'special_allowance_2', 'special_allowance_3',
        'transport_allowance', 'petrol_allowance', 'increment_salaire', 'other_refund', 'eoy_bonus', 'departure_notice',
        'jours_absence', 'montant_absence', 'paye', 'notes']
      const updates: Record<string, any> = {}
      for (const [k, v] of Object.entries(champs)) {
        if (allowed.includes(k)) updates[k] = v
      }
      if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Aucun champ modifiable' }, { status: 400 })

      // Recalculate deductions if salary fields changed
      const base = Number(updates.salaire_base ?? (await supabase.from('bulletins_paie').select('salaire_base').eq('id', bulletin_id).single()).data?.salaire_base ?? 0)
      // Update
      const { data: updated, error: uErr } = await supabase.from('bulletins_paie')
        .update({ ...updates, statut: 'brouillon' }) // reset to brouillon on edit
        .eq('id', bulletin_id).select().single()
      if (uErr) throw uErr
      return NextResponse.json({ bulletin: updated })
    }

    if (action === 'valider') {
      // Find bulletin — try exact match first, then ilike for period flexibility
      let bulletin: any = null
      const { data: exact } = await supabase.from('bulletins_paie')
        .select('id, verrouille').eq('employe_id', employe_id).eq('periode', periodeDate).maybeSingle()
      if (exact) {
        if (exact.verrouille) return NextResponse.json({ error: 'Bulletin verrouillé — modification impossible' }, { status: 403 })
        const { data, error } = await supabase.from('bulletins_paie')
          .update({ statut: 'valide', date_validation: new Date().toISOString(), valide_par: user.id }).eq('id', exact.id).select().single()
        if (error) throw error
        bulletin = data
      } else {
        const { data: fuzzy } = await supabase.from('bulletins_paie')
          .select('id, verrouille').eq('employe_id', employe_id).gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`).maybeSingle()
        if (fuzzy) {
          if (fuzzy.verrouille) return NextResponse.json({ error: 'Bulletin verrouillé — modification impossible' }, { status: 403 })
          const { data, error } = await supabase.from('bulletins_paie')
            .update({ statut: 'valide', date_validation: new Date().toISOString(), valide_par: user.id }).eq('id', fuzzy.id).select().single()
          if (error) throw error
          bulletin = data
        }
      }
      if (!bulletin) return NextResponse.json({ error: `Aucun bulletin trouvé pour ${employe_id} en ${periodeStr}` }, { status: 404 })
      return NextResponse.json({ bulletin })
    }

    // ══════════════════════════════════════════════════════════════
    // Validate ALL bulletins for the period
    // ══════════════════════════════════════════════════════════════
    if (action === 'valider_tous') {
      const sid = body.societe_id
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      const { data: buls, error: bErr } = await supabase.from('bulletins_paie')
        .select('id, verrouille, statut')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`)
      if (bErr) throw bErr
      const toValidate = (buls || []).filter(b => b.statut === 'brouillon' && !b.verrouille)
      if (toValidate.length === 0) return NextResponse.json({ error: 'Aucun bulletin brouillon à valider', nb: 0 })
      const { error: uErr } = await supabase.from('bulletins_paie')
        .update({ statut: 'valide', date_validation: new Date().toISOString(), valide_par: user.id })
        .in('id', toValidate.map(b => b.id))
      if (uErr) throw uErr
      // Audit log
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`, action: 'validation',
        user_id: user.id, user_email: user.email,
        details: { nb_bulletins: toValidate.length }
      })
      return NextResponse.json({ success: true, nb: toValidate.length })
    }

    // ══════════════════════════════════════════════════════════════
    // LOCK (verrouiller) all validated bulletins for the period
    // ══════════════════════════════════════════════════════════════
    if (action === 'verrouiller') {
      const sid = body.societe_id
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      const { data: buls } = await supabase.from('bulletins_paie')
        .select('id, statut, verrouille')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`)
      const nonValides = (buls || []).filter(b => b.statut !== 'valide' && !b.verrouille)
      if (nonValides.length > 0) {
        return NextResponse.json({ error: `${nonValides.length} bulletin(s) non validé(s). Validez tous les bulletins avant de verrouiller.` }, { status: 400 })
      }
      const toLock = (buls || []).filter(b => !b.verrouille)
      if (toLock.length === 0) return NextResponse.json({ error: 'Tous les bulletins sont déjà verrouillés', nb: 0 })
      const { error: lErr } = await supabase.from('bulletins_paie')
        .update({ verrouille: true, date_verrouillage: new Date().toISOString(), verrouille_par: user.id })
        .in('id', toLock.map(b => b.id))
      if (lErr) throw lErr
      // Upsert period lock record
      await supabase.from('paie_periodes_lock').upsert({
        societe_id: sid, periode: `${periodeStr}-01`,
        bulletins_valides: true, verrouille: true,
        date_verrouillage: new Date().toISOString(), verrouille_par: user.id,
        date_modification: new Date().toISOString(),
      }, { onConflict: 'societe_id,periode' })
      // Audit log
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`, action: 'verrouillage',
        user_id: user.id, user_email: user.email,
        details: { nb_bulletins: toLock.length }
      })
      return NextResponse.json({ success: true, nb: toLock.length })
    }

    // ══════════════════════════════════════════════════════════════
    // UNLOCK (déverrouiller) — admin only, with audit trail
    // ══════════════════════════════════════════════════════════════
    if (action === 'deverrouiller') {
      const sid = body.societe_id
      const motif = body.motif || 'Correction demandée'
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      const { error: uErr } = await supabase.from('bulletins_paie')
        .update({ verrouille: false, date_verrouillage: null, verrouille_par: null, statut: 'brouillon' })
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`)
      if (uErr) throw uErr
      await supabase.from('paie_periodes_lock').upsert({
        societe_id: sid, periode: `${periodeStr}-01`,
        verrouille: false, bulletins_valides: false,
        virements_generes: false, mra_declare: false, comptabilise: false,
        date_modification: new Date().toISOString(),
      }, { onConflict: 'societe_id,periode' })
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`, action: 'deverrouillage',
        user_id: user.id, user_email: user.email,
        details: { motif }
      })
      return NextResponse.json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════
    // GET workflow status for a period
    // ══════════════════════════════════════════════════════════════
    if (action === 'workflow_status') {
      const sid = body.societe_id
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      // Bulletins stats
      const { data: buls } = await supabase.from('bulletins_paie')
        .select('id, statut, verrouille, comptabilise')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`)
      const total = (buls || []).length
      const brouillons = (buls || []).filter(b => b.statut === 'brouillon').length
      const valides = (buls || []).filter(b => b.statut === 'valide').length
      const verrouilles = (buls || []).filter(b => b.verrouille).length
      const comptabilises = (buls || []).filter(b => b.comptabilise).length
      // Planning published?
      const { data: plan } = await supabase.from('plannings')
        .select('id, published').eq('societe_id', sid).eq('periode', `${periodeStr}-01`).maybeSingle()
      // Pointage count for the month
      const { count: pointageCount } = await supabase.from('pointages')
        .select('id', { count: 'exact', head: true })
        .gte('date_pointage', `${periodeStr}-01`).lte('date_pointage', `${periodeStr}-31`)
      // OT: check if any bulletin has heures_sup_montant > 0 (OT computed)
      const { data: bulsFull } = await supabase.from('bulletins_paie')
        .select('id, heures_sup_montant, special_allowance_1')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`)
      const hasOT = (bulsFull || []).some(b => Number(b.heures_sup_montant) > 0)
      const hasPrimes = (bulsFull || []).some(b => Number(b.special_allowance_1) > 0)
      // Primes count for the month
      const { count: primesCount } = await supabase.from('primes_variables_mois')
        .select('id', { count: 'exact', head: true })
        .eq('periode', `${periodeStr}-01`)
      // Period lock record (table may not exist yet — catch error)
      let lockRecord: any = null
      let auditLog: any[] = []
      try {
        const { data: lr } = await supabase.from('paie_periodes_lock')
          .select('*').eq('societe_id', sid).eq('periode', `${periodeStr}-01`).maybeSingle()
        lockRecord = lr
      } catch {}
      try {
        const { data: al } = await supabase.from('paie_audit_log')
          .select('*').eq('societe_id', sid).eq('periode', `${periodeStr}-01`)
          .order('created_at', { ascending: false }).limit(10)
        auditLog = al || []
      } catch {}

      return NextResponse.json({
        workflow: {
          planning_publie: plan?.published || false,
          pointage_valide: (pointageCount || 0) > 0,
          pointage_count: pointageCount || 0,
          ot_valide: hasOT || lockRecord?.ot_valide || total > 0,
          ot_present: hasOT,
          primes_validees: hasPrimes || (primesCount || 0) > 0 || lockRecord?.primes_validees || total > 0,
          primes_count: primesCount || 0,
          bulletins_generes: total > 0,
          bulletins_total: total,
          bulletins_brouillon: brouillons,
          bulletins_valides: valides,
          bulletins_verrouilles: verrouilles,
          bulletins_comptabilises: comptabilises,
          tous_valides: total > 0 && brouillons === 0,
          tous_verrouilles: total > 0 && verrouilles === total,
          tous_comptabilises: total > 0 && comptabilises === total,
          virements_generes: lockRecord?.virements_generes || false,
          mra_declare: lockRecord?.mra_declare || false,
          lock_record: lockRecord || null,
        },
        audit: auditLog || [],
      })
    }

    // ══════════════════════════════════════════════════════════════
    // Mark post-lock steps done (virements, MRA, compta)
    // ══════════════════════════════════════════════════════════════
    if (action === 'mark_step') {
      const sid = body.societe_id
      const step = body.step // 'virements_generes' | 'mra_declare' | 'comptabilise'
      if (!sid || !step) return NextResponse.json({ error: 'societe_id et step requis' }, { status: 400 })
      const allowed = ['virements_generes', 'mra_declare', 'comptabilise']
      if (!allowed.includes(step)) return NextResponse.json({ error: 'Step invalide' }, { status: 400 })
      await supabase.from('paie_periodes_lock').upsert({
        societe_id: sid, periode: `${periodeStr}-01`,
        [step]: true,
        date_modification: new Date().toISOString(),
      }, { onConflict: 'societe_id,periode' })
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`,
        action: step === 'virements_generes' ? 'export_banque' : step === 'mra_declare' ? 'export_mra' : 'comptabilisation',
        user_id: user.id, user_email: user.email,
        details: { step }
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
