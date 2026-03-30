import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculerBulletin, PARAMS_MRA_DEFAUT } from '@/lib/rh/paie'

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

function calcOT(hEntree: string, hSortie: string, ferieDay: boolean) {
  if (!hEntree || !hSortie) return { normales: 0, ot15: 0, ot2: 0 }
  const debut = new Date(`1970-01-01T${hEntree}`)
  const fin = new Date(`1970-01-01T${hSortie}`)
  let totalH = (fin.getTime() - debut.getTime()) / 3600000 - 1
  if (totalH <= 0) totalH = 0
  if (ferieDay) return { normales: 0, ot15: 0, ot2: totalH }
  const normales = Math.min(totalH, 9)
  const reste = Math.max(totalH - 9, 0)
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

    let query = supabase
      .from('bulletins_paie')
      .select('*, employe:employes(code,nom,prenom,poste,pct_refacturation,societe_refacturation_id,devise_salaire,taux_change_eur)')
      .order('periode', { ascending: false })

    if (employe_id) query = query.eq('employe_id', employe_id)
    if (periode) query = query.ilike('periode', `${periode}%`)
    if (societe_id) query = query.eq('societe_id', societe_id)

    const { data, error } = await query
    if (error) throw error

    const totaux = {
      masse_salariale_brute: data?.reduce((s, b) => s + (Number(b.salaire_brut) || 0), 0) || 0,
      masse_salariale_nette: data?.reduce((s, b) => s + (Number(b.salaire_net) || 0), 0) || 0,
      total_charges_patronales: data?.reduce((s, b) => s + (Number(b.total_charges_patronales) || 0), 0) || 0,
      cout_total_employeur: data?.reduce((s, b) => s + (Number(b.salaire_brut) + Number(b.total_charges_patronales) || 0), 0) || 0,
      total_refacture: data?.reduce((s, b) => s + (Number(b.montant_refacture_mur) || 0), 0) || 0,
    }

    return NextResponse.json({ bulletins: data, totaux, nb: data?.length || 0 })
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
      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).single()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // 1. Récupérer OT de la période depuis les pointages
      const { data: pointagesMois } = await supabase.from('pointages')
        .select('*').eq('employe_id', employe_id)
        .gte('date_pointage', `${periodeStr}-01`)
        .lte('date_pointage', `${periodeStr}-31`)

      let total_ot_montant = 0
      const taux_horaire = Number(emp.salaire_base) / (45 * 52 / 12)
      let jours_travailles = 0

      for (const pt of pointagesMois || []) {
        if (!pt.heure_entree) continue
        jours_travailles++
        const ferie = isFerie(pt.date_pointage)
        const ot = calcOT(pt.heure_entree, pt.heure_sortie || '', ferie)
        const montant15 = ot.ot15 * taux_horaire * 1.5
        const montant2 = ot.ot2 * taux_horaire * 2
        total_ot_montant += montant15 + montant2
      }

      // 2. Récupérer primes approuvées de la période
      const { data: primesMois } = await supabase.from('primes_variables_mois')
        .select('*').eq('employe_id', employe_id).eq('periode', periodeDate).eq('approuve', true)

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
      const salaire_net_final = Math.round((resultat.salaire_net - montant_absence_final) * 100) / 100

      const bulletin: Record<string, any> = {
        employe_id, societe_id: societe_id || emp.societe_id,
        periode: periodeDate,
        salaire_base: elements.salaire_base,
        salaire_brut: resultat.salaire_brut,
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
        cout_total_employeur: resultat.cout_total_employeur,
        heures_sup_montant: elements.heures_sup_montant || 0,
        special_allowance_1: elements.special_allowance_1 || 0,
        transport_allowance: elements.transport_allowance || 0,
        petrol_allowance: elements.petrol_allowance || 0,
        montant_absence: montant_absence_final,
        statut: 'brouillon',
      }

      const { data, error } = await supabase.from('bulletins_paie').upsert(bulletin, { onConflict: 'employe_id,periode' }).select().single()
      if (error) {
        console.error('[paie calculer]', error.message)
        throw error
      }

      // Marquer les primes comme intégrées (colonne integre_paie + date_integration ajoutées en migration 028)
      if (primesMois && primesMois.length > 0) {
        await supabase.from('primes_variables_mois')
          .update({ integre_paie: true, date_integration: new Date().toISOString() })
          .in('id', primesMois.map(p => p.id))
      }

      return NextResponse.json({ bulletin: data, simulation: { ...resultat, total_ot_montant, total_primes, montant_absence_final, jours_travailles } })
    }

    // ══════════════════════════════════════════════════════
    // ACTION : calculer_batch (tous les employés de la société)
    // ══════════════════════════════════════════════════════
    if (action === 'calculer_batch') {
      // Get all active employees (no departure date or departure in the future)
      let empQuery = supabase.from('employes').select('*').eq('societe_id', societe_id)
      const { data: allEmps } = await empQuery
      // Filter out departed employees (keep those without date_depart or with future date_depart)
      const employes = (allEmps || []).filter(e => !e.date_depart || e.date_depart > periodeStr)

      // Get variables from request body if provided (from elaboration-paie page)
      const requestVariables: Record<string, any> = {}
      if (body.variables && Array.isArray(body.variables)) {
        body.variables.forEach((v: any) => { requestVariables[v.employe_id] = v })
      }
      const bulletinsSauvegardes = []

      for (const emp of employes || []) {
        // 1. OT depuis pointages
        const { data: pointagesMois } = await supabase.from('pointages')
          .select('*').eq('employe_id', emp.id)
          .gte('date_pointage', `${periodeStr}-01`).lte('date_pointage', `${periodeStr}-31`)

        let total_ot_montant = 0
        const taux_horaire = Number(emp.salaire_base) / (45 * 52 / 12)
        let jours_travailles = 0

        for (const pt of pointagesMois || []) {
          if (!pt.heure_entree) continue
          jours_travailles++
          const ot = calcOT(pt.heure_entree, pt.heure_sortie || '', isFerie(pt.date_pointage))
          total_ot_montant += ot.ot15 * taux_horaire * 1.5 + ot.ot2 * taux_horaire * 2
        }

        // 2. Primes approuvées
        const { data: primesMois } = await supabase.from('primes_variables_mois')
          .select('*').eq('employe_id', emp.id).eq('periode', periodeDate).eq('approuve', true)
        const total_primes = (primesMois || []).reduce((s, p) => s + Number(p.montant || 0), 0)

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
          const taux = Number(emp.taux_change_eur) || params.taux_eur || 46.50
          salaire_base_mur = Math.round(salaire_base_mur * taux)
        }

        const elements = {
          salaire_base: salaire_base_mur,
          transport_allowance: Number(emp.transport_allowance) || 0,
          petrol_allowance: Number(emp.petrol_allowance) || 0,
          heures_sup_montant: Math.round(total_ot_montant),
          special_allowance_1: Math.round(total_primes),
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
          salaire_brut: resultat.salaire_brut,
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
          cout_total_employeur: resultat.cout_total_employeur,
          heures_sup_montant: Math.round(total_ot_montant),
          special_allowance_1: Math.round(total_primes),
          transport_allowance: Number(emp.transport_allowance) || 0,
          petrol_allowance: Number(emp.petrol_allowance) || 0,
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
          console.error(`[paie batch] Error for ${emp.nom} ${emp.prenom}:`, error.message)
        }
        if (!error && saved) {
          bulletinsSauvegardes.push({ ...saved, nom: emp.nom, prenom: emp.prenom, employe: { id: emp.id, code: emp.code, nom: emp.nom, prenom: emp.prenom, poste: emp.poste } })
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

      return NextResponse.json({ bulletins: bulletinsSauvegardes, totaux, nb: bulletinsSauvegardes.length })
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
