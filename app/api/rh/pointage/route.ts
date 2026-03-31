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

// Helper: compute hours from entry/exit times
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

// Helper: find employee IDs for a societe, or for the user's linked societes
async function resolveEmployeeFilter(
  supabase: ReturnType<typeof getAdminClient>,
  userId: string,
  societe_id: string | null
): Promise<string[] | null> {
  if (societe_id) {
    const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
    return emps?.map(e => e.id) || []
  }

  // No societe_id given: resolve from user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, societe_id')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.societe_id) {
    const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', profile.societe_id)
    return emps?.map(e => e.id) || []
  }

  // Admin/super_admin: return null (no filter = all)
  if (profile?.role && ['admin', 'super_admin'].includes(profile.role)) {
    return null
  }

  // Fallback: find societes via dossiers or ownership
  const { data: dossiers } = await supabase.from('dossiers').select('societe_id').eq('client_id', userId)
  const { data: owned } = await supabase.from('societes').select('id').eq('created_by', userId)
  const sIds = [...new Set([...(dossiers || []).map(d => d.societe_id), ...(owned || []).map(s => s.id)])].filter(Boolean)

  if (sIds.length > 0) {
    const { data: emps } = await supabase.from('employes').select('id').in('societe_id', sIds)
    return emps?.map(e => e.id) || []
  }

  return []
}

// Helper: find existing pointage for an employee on a date
async function findExistingPointage(
  supabase: ReturnType<typeof getAdminClient>,
  employe_id: string,
  date: string
) {
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
    const periode = searchParams.get('periode') // YYYY-MM

    // Resolve employee filter based on societe or user context
    const empIds = employe_id ? null : await resolveEmployeeFilter(supabase, user.id, societe_id)

    if (mensuel || periode) {
      // Monthly view: return all pointages for the month
      const mois = periode || date.slice(0, 7)
      const [annee, moisNum] = mois.split('-').map(Number)
      const nbJours = new Date(annee, moisNum, 0).getDate()
      const dateDebut = `${mois}-01`
      const dateFin = `${mois}-${String(nbJours).padStart(2, '0')}`

      let query = supabase
        .from('pointages')
        .select('*, employe:employes(nom,prenom,poste)')
        .gte('date_pointage', dateDebut)
        .lte('date_pointage', dateFin)
        .order('date_pointage', { ascending: true })

      if (employe_id) query = query.eq('employe_id', employe_id)
      else if (empIds && empIds.length > 0) query = query.in('employe_id', empIds)
      else if (empIds && empIds.length === 0) return NextResponse.json({ pointages: [], mois })

      const { data, error } = await query
      if (error) {
        console.error('[pointage GET monthly]', error.message, error.details)
        throw error
      }

      const enriched = (data || []).map(p => {
        const { duree_minutes, heures_travaillees, heures_sup } = computeHours(
          p.heure_entree, p.heure_sortie, p.duree_minutes
        )
        return {
          ...p,
          date: p.date_pointage,
          duree_minutes,
          heures_travaillees,
          heures_sup,
          absent_justifie: p.statut_jour === 'absent_justifie',
        }
      })

      return NextResponse.json({ pointages: enriched, mois, nb: enriched.length })
    }

    // Daily view (default)
    let query = supabase
      .from('pointages')
      .select('*, employe:employes(nom,prenom,poste)')
      .eq('date_pointage', date)
      .order('created_at', { ascending: true })

    if (employe_id) query = query.eq('employe_id', employe_id)
    else if (empIds && empIds.length > 0) query = query.in('employe_id', empIds)
    else if (empIds && empIds.length === 0) return NextResponse.json({ pointages: [], date })

    const { data, error } = await query
    if (error) {
      console.error('[pointage GET daily]', error.message, error.details)
      throw error
    }

    // Enrich with computed fields
    const enriched = (data || []).map(p => {
      const { duree_minutes, heures_travaillees, heures_sup } = computeHours(
        p.heure_entree, p.heure_sortie, p.duree_minutes
      )
      return {
        ...p,
        duree_minutes,
        heures_travaillees,
        heures_sup,
        absent_justifie: p.statut_jour === 'absent_justifie',
      }
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
    const {
      employe_id,
      type_pointage,
      heure_forcee,
      motif_absence,
      date_pointage: bodyDate,
    } = body

    if (!employe_id || !type_pointage) {
      return NextResponse.json({ error: 'employe_id et type_pointage requis' }, { status: 400 })
    }

    const today = bodyDate || new Date().toISOString().split('T')[0]
    const now = heure_forcee || new Date().toTimeString().split(' ')[0] // HH:MM:SS

    // Special case: justified absence
    if (type_pointage === 'absence_justifiee') {
      const existing = await findExistingPointage(supabase, employe_id, today)

      if (existing) {
        const { data, error } = await supabase
          .from('pointages')
          .update({
            statut_jour: 'absent_justifie',
            notes: motif_absence || existing.notes || null,
          })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) {
          console.error('[pointage absence update]', error.message, error.details)
          throw error
        }
        return NextResponse.json({ pointage: data, message: 'Absence justifiee enregistree' })
      } else {
        const { data, error } = await supabase
          .from('pointages')
          .insert({
            employe_id,
            date_pointage: today,
            statut_jour: 'absent_justifie',
            notes: motif_absence || null,
          })
          .select()
          .single()
        if (error) {
          console.error('[pointage absence insert]', error.message, error.details)
          throw error
        }
        return NextResponse.json({ pointage: data, message: 'Absence justifiee enregistree' })
      }
    }

    const existing = await findExistingPointage(supabase, employe_id, today)

    let result

    if (type_pointage === 'entree') {
      // Clock in: if already clocked in today, return error
      if (existing && existing.heure_entree) {
        return NextResponse.json(
          {
            error: 'Deja pointe',
            message: `Entree deja enregistree a ${String(existing.heure_entree).slice(0, 5)}`,
            pointage: existing,
          },
          { status: 409 }
        )
      }

      let data, error
      if (existing) {
        // Update existing record (e.g., absence record being corrected)
        const res = await supabase.from('pointages')
          .update({ heure_entree: now, statut_jour: 'travaille' })
          .eq('id', existing.id).select().single()
        data = res.data; error = res.error
      } else {
        // Insert new record
        const res = await supabase.from('pointages')
          .insert({ employe_id, date_pointage: today, heure_entree: now, statut_jour: 'travaille' })
          .select().single()
        data = res.data; error = res.error
      }
      if (error) {
        console.error('[pointage entree]', error.message, error.details)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      result = data
    } else if (type_pointage === 'sortie') {
      // Clock out: must have clocked in first
      if (!existing || !existing.heure_entree) {
        return NextResponse.json(
          { error: "Pas de pointage d'entree", message: "Veuillez d'abord pointer votre entree" },
          { status: 400 }
        )
      }

      // If already clocked out, return error
      if (existing.heure_sortie) {
        return NextResponse.json(
          {
            error: 'Deja pointe',
            message: `Sortie deja enregistree a ${String(existing.heure_sortie).slice(0, 5)}`,
            pointage: existing,
          },
          { status: 409 }
        )
      }

      // Calculate duration in minutes
      const entreeMs = new Date(`1970-01-01T${existing.heure_entree}`).getTime()
      const sortieMs = new Date(`1970-01-01T${now}`).getTime()
      const duree_minutes = Math.round((sortieMs - entreeMs) / 60000)
      const heures_travaillees = parseFloat((duree_minutes / 60).toFixed(2))
      const heures_sup = heures_travaillees > 8 ? parseFloat((heures_travaillees - 8).toFixed(2)) : 0

      // Update with sortie time and computed duration
      const { data, error } = await supabase
        .from('pointages')
        .update({
          heure_sortie: now,
          duree_minutes,
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) {
        console.error('[pointage sortie]', error.message, error.details)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      result = { ...data, duree_minutes, heures_travaillees, heures_sup }
    } else {
      return NextResponse.json({ error: 'type_pointage invalide. Utiliser "entree", "sortie" ou "absence_justifiee"' }, { status: 400 })
    }

    return NextResponse.json({ pointage: result })
  } catch (e: unknown) {
    console.error('[pointage POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
