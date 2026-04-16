import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function computeHours(heure_entree: string | null, heure_sortie: string | null, duree_minutes_existing: number | null) {
  let duree_minutes = duree_minutes_existing || null
  let heures_travaillees: number | null = null
  let heures_sup: number | null = null

  if (heure_entree && heure_sortie && !duree_minutes) {
    const entreeMs = new Date(`1970-01-01T${heure_entree}`).getTime()
    const sortieMs = new Date(`1970-01-01T${heure_sortie}`).getTime()
    if (!isNaN(entreeMs) && !isNaN(sortieMs)) {
      duree_minutes = Math.round((sortieMs - entreeMs) / 60000)
    }
  }

  if (duree_minutes && duree_minutes > 0) {
    heures_travaillees = parseFloat((duree_minutes / 60).toFixed(2))
    heures_sup = heures_travaillees > 8 ? parseFloat((heures_travaillees - 8).toFixed(2)) : 0
  }

  return { duree_minutes, heures_travaillees, heures_sup }
}

async function resolveEmployeeFilter(
  supabase: ReturnType<typeof getAdminClient>,
  userId: string,
  societe_id: string | null
): Promise<string[] | null> {
  // Sprint 5 FIX 1 — exclure employés partis (actif=false OU date_depart).
  // Un ancien salarié ne doit JAMAIS apparaître dans le pointage quotidien
  // (pas de pointages actifs, pas dans la grille manager).
  if (societe_id) {
    const { data: emps } = await supabase.from('employes').select('id')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .is('date_depart', null)
    return emps?.map(e => e.id) || []
  }

  const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', userId).maybeSingle()

  if (profile?.societe_id) {
    const { data: emps } = await supabase.from('employes').select('id')
      .eq('societe_id', profile.societe_id)
      .eq('actif', true)
      .is('date_depart', null)
    return emps?.map(e => e.id) || []
  }

  if (profile?.role && ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'manager', 'direction'].includes(profile.role)) return null

  const { data: dossiers } = await supabase.from('dossiers').select('societe_id').eq('client_id', userId)
  const { data: owned } = await supabase.from('societes').select('id').eq('created_by', userId)
  const sIds = [...new Set([...(dossiers || []).map(d => d.societe_id), ...(owned || []).map(s => s.id)])].filter(Boolean)

  if (sIds.length > 0) {
    const { data: emps } = await supabase.from('employes').select('id')
      .in('societe_id', sIds)
      .eq('actif', true)
      .is('date_depart', null)
    return emps?.map(e => e.id) || []
  }

  return []
}

// Safe insert/update that retries without statut_jour if column doesn't exist
// Columns that may not exist in production DB — remove them on error and retry
const OPTIONAL_COLS = ['statut_jour', 'notes', 'duree_minutes', 'type_entree', 'type_sortie', 'shift_code', 'planning_assignment_id', 'absence_type', 'auto_detected', 'valide_par', 'heure_pause_debut', 'heure_pause_fin']

function stripMissingCols(record: Record<string, unknown>, errorMsg: string): Record<string, unknown> {
  const cleaned = { ...record }
  for (const col of OPTIONAL_COLS) {
    if (errorMsg.includes(col)) {
      delete cleaned[col]
    }
  }
  return cleaned
}

async function safeInsertPointage(supabase: ReturnType<typeof getAdminClient>, record: Record<string, unknown>) {
  const { data, error } = await supabase.from('pointages').insert(record).select().single()
  if (error) {
    console.error('[safeInsert] first try failed:', error.message)
    // Strip any columns mentioned in the error and retry
    const safe = stripMissingCols(record, error.message)
    console.log('[safeInsert] retrying with:', Object.keys(safe))
    const retry = await supabase.from('pointages').insert(safe).select().single()
    if (retry.error) console.error('[safeInsert] retry also failed:', retry.error.message)
    return retry
  }
  return { data, error }
}

async function safeUpdatePointage(supabase: ReturnType<typeof getAdminClient>, id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from('pointages').update(updates).eq('id', id).select().single()
  if (error) {
    console.error('[safeUpdate] first try failed:', error.message)
    const safe = stripMissingCols(updates, error.message)
    console.log('[safeUpdate] retrying with:', Object.keys(safe))
    const retry = await supabase.from('pointages').update(safe).eq('id', id).select().single()
    if (retry.error) console.error('[safeUpdate] retry also failed:', retry.error.message)
    return retry
  }
  return { data, error }
}

async function findExistingPointage(supabase: ReturnType<typeof getAdminClient>, employe_id: string, date: string) {
  const { data } = await supabase
    .from('pointages')
    .select('*')
    .eq('employe_id', employe_id)
    .eq('date_pointage', date)
    .order('created_at', { ascending: false })
    .limit(1)
  return data && data.length > 0 ? data[0] : null
}

// Bug 3: Look up planning_assignment for an employee on a given date
async function findPlanningAssignment(supabase: ReturnType<typeof getAdminClient>, employe_id: string, date: string) {
  const { data } = await supabase
    .from('planning_assignments')
    .select('id, shift_code, heure_debut, heure_fin, heures_prevues, est_repos')
    .eq('employe_id', employe_id)
    .eq('date', date)
    .limit(1)
  return data && data.length > 0 ? data[0] : null
}

// INTÉGRATION 1 — calcule les flags de retard / départ anticipé par
// rapport au planning du jour. Seuil de tolérance 15 min, dans les 2 sens.
//   retard_minutes > 0           ⇒ l'employé est arrivé en retard
//   depart_anticipe_minutes > 0  ⇒ l'employé est parti plus tôt
//   ecart_heures                 ⇒ heures réelles − heures prévues
// Retourne null si le planning manque ou est un jour de repos.
function computePointagePunctuality(
  planAssignment: { heure_debut?: string | null; heure_fin?: string | null; heures_prevues?: number | null; est_repos?: boolean | null } | null,
  heure_entree: string | null,
  heure_sortie: string | null,
  heures_travaillees: number | null,
) {
  if (!planAssignment || planAssignment.est_repos) return null
  const TOL_MIN = 15
  const toMs = (h: string) => new Date(`1970-01-01T${h}`).getTime()

  let retard_minutes = 0
  let en_retard = false
  if (heure_entree && planAssignment.heure_debut) {
    const delta = Math.round((toMs(heure_entree) - toMs(planAssignment.heure_debut)) / 60000)
    if (delta > TOL_MIN) {
      retard_minutes = delta
      en_retard = true
    }
  }

  let depart_anticipe_minutes = 0
  let depart_anticipe = false
  if (heure_sortie && planAssignment.heure_fin) {
    const delta = Math.round((toMs(planAssignment.heure_fin) - toMs(heure_sortie)) / 60000)
    if (delta > TOL_MIN) {
      depart_anticipe_minutes = delta
      depart_anticipe = true
    }
  }

  let ecart_heures: number | null = null
  if (heures_travaillees != null && planAssignment.heures_prevues != null) {
    ecart_heures = parseFloat((heures_travaillees - Number(planAssignment.heures_prevues)).toFixed(2))
  }

  return {
    prevu_debut: planAssignment.heure_debut || null,
    prevu_fin: planAssignment.heure_fin || null,
    prevu_heures: planAssignment.heures_prevues != null ? Number(planAssignment.heures_prevues) : null,
    en_retard,
    retard_minutes,
    depart_anticipe,
    depart_anticipe_minutes,
    ecart_heures,
  }
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const societe_id = searchParams.get('societe_id')
    const employe_id = searchParams.get('employe_id')
    const mensuel = searchParams.get('mensuel') === '1'
    const periode = searchParams.get('periode')

    const empIds = employe_id ? null : await resolveEmployeeFilter(supabase, user.id, societe_id)

    if (mensuel || periode) {
      const mois = periode || date.slice(0, 7)
      const [annee, moisNum] = mois.split('-').map(Number)
      const nbJours = new Date(annee, moisNum, 0).getDate()
      const dateDebut = `${mois}-01`
      const dateFin = `${mois}-${String(nbJours).padStart(2, '0')}`

      let query = supabase
        .from('pointages')
        .select('*')
        .gte('date_pointage', dateDebut)
        .lte('date_pointage', dateFin)
        .order('date_pointage', { ascending: true })

      if (employe_id) query = query.eq('employe_id', employe_id)
      else if (empIds && empIds.length > 0) query = query.in('employe_id', empIds)
      else if (empIds && empIds.length === 0) return NextResponse.json({ pointages: [], mois })

      const { data, error } = await query
      if (error) { console.error('[pointage GET monthly]', error.message); throw error }

      // Enrich with employee names (separate query — avoids FK schema cache issues)
      const uniqueEmpIds = [...new Set((data || []).map(p => p.employe_id))]
      let empMap: Record<string, { nom: string; prenom: string; poste?: string }> = {}
      if (uniqueEmpIds.length > 0) {
        const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste').in('id', uniqueEmpIds)
        for (const e of emps || []) empMap[e.id] = { nom: e.nom, prenom: e.prenom, poste: e.poste }
      }

      // INTÉGRATION 1 — charger les planning_assignments du mois pour tous
      // les employés en une seule requête, puis joindre localement. On
      // construit une map key=`${employe_id}|${date}` → assignment.
      const planMap = new Map<string, any>()
      if (uniqueEmpIds.length > 0) {
        const { data: plans } = await supabase
          .from('planning_assignments')
          .select('id, employe_id, date, shift_code, heure_debut, heure_fin, heures_prevues, est_repos')
          .gte('date', dateDebut)
          .lte('date', dateFin)
          .in('employe_id', uniqueEmpIds)
        for (const pa of plans || []) {
          planMap.set(`${pa.employe_id}|${pa.date}`, pa)
        }
      }

      const enriched = (data || []).map(p => {
        const { duree_minutes, heures_travaillees, heures_sup } = computeHours(p.heure_entree, p.heure_sortie, p.duree_minutes)
        const pa = planMap.get(`${p.employe_id}|${p.date_pointage}`) || null
        const punctuality = computePointagePunctuality(pa, p.heure_entree, p.heure_sortie, heures_travaillees)
        return {
          ...p,
          date: p.date_pointage,
          duree_minutes,
          heures_travaillees,
          heures_sup,
          employe: empMap[p.employe_id] || null,
          planning: pa, // shift info brut pour l'UI
          punctuality,  // retard / départ anticipé / écart
        }
      })

      // INTÉGRATION 1 — backfill opportuniste : les pointages historiques
      // n'ont pas de planning_assignment_id (3 orphelins en prod). Dès
      // qu'on trouve le pa correspondant, on l'écrit en DB pour que la
      // prochaine lecture soit déjà liée. Best-effort : on n'échoue pas
      // le GET si l'UPDATE échoue.
      const toBackfill = enriched.filter(p => !p.planning_assignment_id && p.planning?.id)
      if (toBackfill.length > 0) {
        Promise.all(toBackfill.map(p =>
          safeUpdatePointage(supabase, p.id, {
            planning_assignment_id: p.planning.id,
            shift_code: p.planning.shift_code,
          })
        )).catch(e => console.warn('[pointage] backfill pa_id failed:', e))
      }

      // Migration 135 — defensive : si la colonne pointage_actif n'existe
      // pas (mig pas déployée partout) on retourne null sans 500.
      let pointage_actif: boolean | null = null
      if (societe_id) {
        try {
          const { data: socData, error: socErr } = await supabase
            .from('societes').select('pointage_actif').eq('id', societe_id).maybeSingle()
          if (socErr) console.warn('[pointage GET monthly] pointage_actif lookup failed:', socErr.message)
          else pointage_actif = (socData as any)?.pointage_actif === true
        } catch (e: any) {
          console.warn('[pointage GET monthly] pointage_actif exception:', e?.message || e)
        }
      }

      return NextResponse.json({ pointages: enriched, mois, nb: enriched.length, pointage_actif })
    }

    // Daily view
    let query = supabase
      .from('pointages')
      .select('*')
      .eq('date_pointage', date)
      .order('created_at', { ascending: true })

    if (employe_id) query = query.eq('employe_id', employe_id)
    else if (empIds && empIds.length > 0) query = query.in('employe_id', empIds)
    else if (empIds && empIds.length === 0) return NextResponse.json({ pointages: [], date })

    const { data, error } = await query
    if (error) { console.error('[pointage GET daily]', error.message); throw error }

    // Enrich with employee names (separate query)
    const uniqueEmpIds = [...new Set((data || []).map(p => p.employe_id))]
    let empMap: Record<string, { nom: string; prenom: string; poste?: string }> = {}
    if (uniqueEmpIds.length > 0) {
      const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste').in('id', uniqueEmpIds)
      for (const e of emps || []) empMap[e.id] = { nom: e.nom, prenom: e.prenom, poste: e.poste }
    }

    // INTÉGRATION 1 — planning du jour par employé, pour calcul retard
    // et affichage « Prévu 08:00-17:00 | Réel 08:15-17:00 ».
    const planMapDaily = new Map<string, any>()
    if (uniqueEmpIds.length > 0) {
      const { data: plans } = await supabase
        .from('planning_assignments')
        .select('id, employe_id, date, shift_code, heure_debut, heure_fin, heures_prevues, est_repos')
        .eq('date', date)
        .in('employe_id', uniqueEmpIds)
      for (const pa of plans || []) {
        planMapDaily.set(pa.employe_id, pa)
      }
    }

    const enriched = (data || []).map(p => {
      const { duree_minutes, heures_travaillees, heures_sup } = computeHours(p.heure_entree, p.heure_sortie, p.duree_minutes)
      const pa = planMapDaily.get(p.employe_id) || null
      const punctuality = computePointagePunctuality(pa, p.heure_entree, p.heure_sortie, heures_travaillees)
      return {
        ...p,
        duree_minutes,
        heures_travaillees,
        heures_sup,
        employe: empMap[p.employe_id] || null,
        planning: pa,
        punctuality,
      }
    })

    // INTÉGRATION 1 — backfill opportuniste (cf. path mensuel).
    const toBackfillDaily = enriched.filter(p => !p.planning_assignment_id && p.planning?.id)
    if (toBackfillDaily.length > 0) {
      Promise.all(toBackfillDaily.map(p =>
        safeUpdatePointage(supabase, p.id, {
          planning_assignment_id: p.planning.id,
          shift_code: p.planning.shift_code,
        })
      )).catch(e => console.warn('[pointage] backfill pa_id (daily) failed:', e))
    }

    // Migration 135 — defensive (cf. monthly path).
    let pointage_actif_daily: boolean | null = null
    if (societe_id) {
      try {
        const { data: socDataD, error: socErrD } = await supabase
          .from('societes').select('pointage_actif').eq('id', societe_id).maybeSingle()
        if (socErrD) console.warn('[pointage GET daily] pointage_actif lookup failed:', socErrD.message)
        else pointage_actif_daily = (socDataD as any)?.pointage_actif === true
      } catch (e: any) {
        console.warn('[pointage GET daily] pointage_actif exception:', e?.message || e)
      }
    }

    return NextResponse.json({ pointages: enriched, date, pointage_actif: pointage_actif_daily })
  } catch (e: unknown) {
    console.error('[pointage GET]', e)
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
    const { employe_id, type_pointage, heure_forcee, motif_absence, date_pointage: bodyDate } = body

    if (!employe_id || !type_pointage) {
      return NextResponse.json({ error: 'employe_id et type_pointage requis' }, { status: 400 })
    }

    const today = bodyDate || new Date().toISOString().split('T')[0]
    const now = heure_forcee || new Date().toTimeString().split(' ')[0]

    // Check if employee is on approved congé today — prevent pointage
    const { data: activeConge } = await supabase
      .from('demandes_conges')
      .select('id, type_conge')
      .eq('employe_id', employe_id)
      .eq('statut', 'approuve')
      .lte('date_debut', today)
      .gte('date_fin', today)
      .limit(1)

    if (activeConge && activeConge.length > 0 && type_pointage !== 'absence_justifiee') {
      return NextResponse.json({
        error: 'Employe en conge',
        message: `Cet employe est en conge approuve (${activeConge[0].type_conge}) aujourd'hui. Pointage non requis.`,
        en_conge: true,
        type_conge: activeConge[0].type_conge,
      }, { status: 409 })
    }

    // Bug 3: Look up planning assignment for this employee+date
    const planAssignment = await findPlanningAssignment(supabase, employe_id, today)
    const planningFields: Record<string, unknown> = {}
    if (planAssignment) {
      planningFields.planning_assignment_id = planAssignment.id
      planningFields.shift_code = planAssignment.shift_code
    }

    // Absence justifiée
    if (type_pointage === 'absence_justifiee') {
      const existing = await findExistingPointage(supabase, employe_id, today)
      if (existing) {
        const { data, error } = await safeUpdatePointage(supabase, existing.id, {
          statut_jour: 'absent_justifie',
          notes: motif_absence || existing.notes || null,
          ...planningFields,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data, message: 'Absence justifiee enregistree' })
      } else {
        const { data, error } = await safeInsertPointage(supabase, {
          employe_id,
          date_pointage: today,
          statut_jour: 'absent_justifie',
          notes: motif_absence || null,
          ...planningFields,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data, message: 'Absence justifiee enregistree' })
      }
    }

    const existing = await findExistingPointage(supabase, employe_id, today)

    if (type_pointage === 'entree') {
      if (existing && existing.heure_entree) {
        return NextResponse.json({
          error: 'Deja pointe',
          message: `Entree deja enregistree a ${String(existing.heure_entree).slice(0, 5)}`,
          pointage: existing,
        }, { status: 409 })
      }

      if (existing) {
        const { data, error } = await safeUpdatePointage(supabase, existing.id, {
          heure_entree: now, statut_jour: 'travaille', ...planningFields,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data })
      } else {
        const { data, error } = await safeInsertPointage(supabase, {
          employe_id, date_pointage: today, heure_entree: now, statut_jour: 'travaille', ...planningFields,
        })
        if (error) {
          console.error('[POST entree insert fail]', error.message)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        console.log('[POST entree OK]', data?.id, 'heure_entree:', data?.heure_entree)
        return NextResponse.json({ pointage: data })
      }
    }

    if (type_pointage === 'sortie') {
      if (!existing || !existing.heure_entree) {
        console.log('[POST sortie] no existing entry, existing:', existing?.id, 'heure_entree:', existing?.heure_entree)
        return NextResponse.json({ error: "Pas de pointage d'entree" }, { status: 400 })
      }
      if (existing.heure_sortie) {
        return NextResponse.json({
          error: 'Deja pointe',
          message: `Sortie deja enregistree a ${String(existing.heure_sortie).slice(0, 5)}`,
        }, { status: 409 })
      }

      const entreeMs = new Date(`1970-01-01T${existing.heure_entree}`).getTime()
      const sortieMs = new Date(`1970-01-01T${now}`).getTime()
      let duree_minutes = Math.round((sortieMs - entreeMs) / 60000)

      // Soustraire la pause si enregistrée
      if (existing.heure_pause_debut && existing.heure_pause_fin) {
        const pauseDebMs = new Date(`1970-01-01T${existing.heure_pause_debut}`).getTime()
        const pauseFinMs = new Date(`1970-01-01T${existing.heure_pause_fin}`).getTime()
        const pauseMin = Math.round((pauseFinMs - pauseDebMs) / 60000)
        if (pauseMin > 0) duree_minutes -= pauseMin
      }

      const { data, error } = await safeUpdatePointage(supabase, existing.id, {
        heure_sortie: now, duree_minutes, ...planningFields,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const heures_travaillees = parseFloat((duree_minutes / 60).toFixed(2))
      const heures_sup = heures_travaillees > 8 ? parseFloat((heures_travaillees - 8).toFixed(2)) : 0
      return NextResponse.json({ pointage: { ...data, duree_minutes, heures_travaillees, heures_sup } })
    }

    // Saisie manuelle (heure_entree + heure_sortie en une fois)
    if (type_pointage === 'manuel') {
      const { heure_entree, heure_sortie } = body
      if (!heure_entree) return NextResponse.json({ error: 'heure_entree requise pour saisie manuelle' }, { status: 400 })

      let duree_minutes: number | null = null
      if (heure_entree && heure_sortie) {
        const e = new Date(`1970-01-01T${heure_entree}`).getTime()
        const s = new Date(`1970-01-01T${heure_sortie}`).getTime()
        if (!isNaN(e) && !isNaN(s)) duree_minutes = Math.round((s - e) / 60000)
      }

      if (existing) {
        const { data, error } = await safeUpdatePointage(supabase, existing.id, {
          heure_entree, heure_sortie: heure_sortie || null, duree_minutes, statut_jour: 'travaille', ...planningFields,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data })
      } else {
        const { data, error } = await safeInsertPointage(supabase, {
          employe_id, date_pointage: today, heure_entree, heure_sortie: heure_sortie || null,
          duree_minutes, statut_jour: 'travaille', ...planningFields,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data })
      }
    }

    // Pause début
    if (type_pointage === 'pause_debut') {
      if (!existing || !existing.heure_entree) {
        return NextResponse.json({ error: "Pas de pointage d'entree" }, { status: 400 })
      }
      if (existing.heure_pause_debut) {
        return NextResponse.json({ error: 'Pause deja commencee', message: `Pause depuis ${String(existing.heure_pause_debut).slice(0, 5)}` }, { status: 409 })
      }
      const { data, error } = await safeUpdatePointage(supabase, existing.id, { heure_pause_debut: now })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ pointage: data, message: `Pause commencee a ${now.slice(0, 5)}` })
    }

    // Pause fin
    if (type_pointage === 'pause_fin') {
      if (!existing || !existing.heure_pause_debut) {
        return NextResponse.json({ error: "Pas de debut de pause" }, { status: 400 })
      }
      if (existing.heure_pause_fin) {
        return NextResponse.json({ error: 'Pause deja terminee', message: `Fin pause a ${String(existing.heure_pause_fin).slice(0, 5)}` }, { status: 409 })
      }
      const { data, error } = await safeUpdatePointage(supabase, existing.id, { heure_pause_fin: now })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ pointage: data, message: `Pause terminee a ${now.slice(0, 5)}` })
    }

    return NextResponse.json({ error: 'type_pointage invalide. Utiliser: entree, sortie, pause_debut, pause_fin, absence_justifiee, manuel' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[pointage POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
