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
  if (societe_id) {
    const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
    return emps?.map(e => e.id) || []
  }

  const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', userId).maybeSingle()

  if (profile?.societe_id) {
    const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', profile.societe_id)
    return emps?.map(e => e.id) || []
  }

  if (profile?.role && ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'manager', 'direction'].includes(profile.role)) return null

  const { data: dossiers } = await supabase.from('dossiers').select('societe_id').eq('client_id', userId)
  const { data: owned } = await supabase.from('societes').select('id').eq('created_by', userId)
  const sIds = [...new Set([...(dossiers || []).map(d => d.societe_id), ...(owned || []).map(s => s.id)])].filter(Boolean)

  if (sIds.length > 0) {
    const { data: emps } = await supabase.from('employes').select('id').in('societe_id', sIds)
    return emps?.map(e => e.id) || []
  }

  return []
}

// Safe insert/update that retries without statut_jour if column doesn't exist
// Columns that may not exist in production DB — remove them on error and retry
const OPTIONAL_COLS = ['statut_jour', 'notes', 'duree_minutes', 'type_entree', 'type_sortie', 'shift_code', 'planning_assignment_id', 'absence_type', 'auto_detected', 'valide_par']

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

      const enriched = (data || []).map(p => {
        const { duree_minutes, heures_travaillees, heures_sup } = computeHours(p.heure_entree, p.heure_sortie, p.duree_minutes)
        return { ...p, date: p.date_pointage, duree_minutes, heures_travaillees, heures_sup, employe: empMap[p.employe_id] || null }
      })

      return NextResponse.json({ pointages: enriched, mois, nb: enriched.length })
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

    const enriched = (data || []).map(p => {
      const { duree_minutes, heures_travaillees, heures_sup } = computeHours(p.heure_entree, p.heure_sortie, p.duree_minutes)
      return { ...p, duree_minutes, heures_travaillees, heures_sup, employe: empMap[p.employe_id] || null }
    })

    return NextResponse.json({ pointages: enriched, date })
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

    // Absence justifiée
    if (type_pointage === 'absence_justifiee') {
      const existing = await findExistingPointage(supabase, employe_id, today)
      if (existing) {
        const { data, error } = await safeUpdatePointage(supabase, existing.id, {
          statut_jour: 'absent_justifie',
          notes: motif_absence || existing.notes || null,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data, message: 'Absence justifiee enregistree' })
      } else {
        const { data, error } = await safeInsertPointage(supabase, {
          employe_id,
          date_pointage: today,
          statut_jour: 'absent_justifie',
          notes: motif_absence || null,
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
          heure_entree: now, statut_jour: 'travaille',
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data })
      } else {
        const { data, error } = await safeInsertPointage(supabase, {
          employe_id, date_pointage: today, heure_entree: now, statut_jour: 'travaille',
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
      const duree_minutes = Math.round((sortieMs - entreeMs) / 60000)

      const { data, error } = await safeUpdatePointage(supabase, existing.id, {
        heure_sortie: now, duree_minutes,
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
          heure_entree, heure_sortie: heure_sortie || null, duree_minutes, statut_jour: 'travaille',
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data })
      } else {
        const { data, error } = await safeInsertPointage(supabase, {
          employe_id, date_pointage: today, heure_entree, heure_sortie: heure_sortie || null,
          duree_minutes, statut_jour: 'travaille',
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pointage: data })
      }
    }

    return NextResponse.json({ error: 'type_pointage invalide. Utiliser: entree, sortie, absence_justifiee, manuel' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[pointage POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
