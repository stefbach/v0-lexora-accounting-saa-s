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

      // Get all employees for this société
      const { data: allEmps, error: empError } = await supabase.from('employes').select('*').eq('societe_id', societe_id)

      if (empError) {
        console.error('[paie batch] Error fetching employees:', empError.message)
        return NextResponse.json({ error: `Erreur employes: ${empError.message}`, bulletins: [], nb: 0 }, { status: 500 })
      }

      if (!allEmps || allEmps.length === 0) {
        return NextResponse.json({ error: `Aucun employe trouve pour societe_id=${societe_id}`, bulletins: [], nb: 0, debug: { societe_id, periode: periodeStr } }, { status: 400 })
      }

      // Filter out departed employees
      const employes = allEmps.filter(e => !e.date_depart || e.date_depart > periodeStr)
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

        // 3. Absences injustifiées
        const { data: congesApprouves } = await supabase.from('demandes_conges')
          .select('date_debut,date_fin').eq('employe_id', emp.id).eq('statut', 'approuve')
          .gte('date_debut', `${periodeStr}-01`).lte('date_fin', `${periodeStr}-31`)

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

        const elements = {
          salaire_base: salaire_base_mur,
          transport_allowance: Number(emp.transport_allowance) || 0,
          petrol_allowance: Number(emp.petrol_allowance) || 0,
          heures_sup_montant: Math.round(total_ot_montant),
          special_allowance_1: Math.round(total_primes),
          eoy_bonus: eoy_bonus_montant,
        }

        const jt = jours_travailles > 0 ? jours_travailles : 26
        const resultat = calculerBulletin(elements, params, jt, Number(emp.pct_refacturation) || 0)
        const salaire_net_final = Math.round((resultat.salaire_net - montant_absence_final) * 100) / 100

        // Résumé notes pour le bulletin
        const notesResume = `OT: ${Math.round(total_ot_montant)} MUR, Primes: ${Math.round(total_primes)} MUR, Absences: ${jours_absence_injust} jours`

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
          heures_sup_montant: Math.round(total_ot_montant),
          special_allowance_1: Math.round(total_primes),
          transport_allowance: Number(emp.transport_allowance) || 0,
          petrol_allowance: Number(emp.petrol_allowance) || 0,
          eoy_bonus: eoy_bonus_montant,
          montant_absence: montant_absence_final,
          notes: notesResume,
          statut: 'brouillon',
        }

        // Remove fields that may not exist in DB schema (ResultatPaie extras)
        const fieldsToRemove = [
          'salary_compensation_montant', 'total_emoluments', 'prgf_pct_emoluments',
          'prgf_par_jour', 'montant_refacture_mur', 'csg_taux', 'csg_bonus',
          'salaire_brut_base', 'resultat_net'
        ]
        for (const f of fieldsToRemove) delete (bulletin as any)[f]
        console.log(`[paie batch] ${emp.nom} ${emp.prenom}: base=${salaire_base_mur}, brut=${resultat.salaire_brut}, net=${salaire_net_final}`)

        const { data: saved, error } = await supabase.from('bulletins_paie').upsert(bulletin, { onConflict: 'employe_id,periode' }).select().single()
        if (error) {
          const errMsg = `${emp.nom} ${emp.prenom}: ${error.message}`
          console.error(`[paie batch] UPSERT FAILED:`, errMsg, error.details, error.hint)
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

    if (action === 'valider') {
      const { data, error } = await supabase.from('bulletins_paie')
        .update({ statut: 'valide' }).eq('employe_id', employe_id).eq('periode', periodeDate).select().single()
      if (error) throw error
      return NextResponse.json({ bulletin: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
