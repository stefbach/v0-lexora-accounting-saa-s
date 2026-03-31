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

    // Get employee IDs filtered by societe
    let empIds: string[] | null = null
    if (societe_id) {
      const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
      empIds = emps?.map(e => e.id) || []
    }

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
      if (error) throw error

      const enriched = (data || []).map(p => {
        // Compute duration if both times exist
        let duree_minutes = p.duree_minutes || null
        let heures_travaillees: number | null = null
        let heures_sup: number | null = null

        if (p.heure_entree && p.heure_sortie && !duree_minutes) {
          const entreeMs = new Date(`1970-01-01T${p.heure_entree}`).getTime()
          const sortieMs = new Date(`1970-01-01T${p.heure_sortie}`).getTime()
          duree_minutes = Math.round((sortieMs - entreeMs) / 60000)
        }

        if (duree_minutes && duree_minutes > 0) {
          heures_travaillees = parseFloat((duree_minutes / 60).toFixed(2))
          heures_sup = heures_travaillees > 8 ? parseFloat((heures_travaillees - 8).toFixed(2)) : 0
        }

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
    if (error) throw error

    // Enrich with computed fields
    const enriched = (data || []).map(p => {
      let duree_minutes = p.duree_minutes || null
      let heures_travaillees: number | null = null
      let heures_sup: number | null = null

      if (p.heure_entree && p.heure_sortie && !duree_minutes) {
        const entreeMs = new Date(`1970-01-01T${p.heure_entree}`).getTime()
        const sortieMs = new Date(`1970-01-01T${p.heure_sortie}`).getTime()
        duree_minutes = Math.round((sortieMs - entreeMs) / 60000)
      }

      if (duree_minutes && duree_minutes > 0) {
        heures_travaillees = parseFloat((duree_minutes / 60).toFixed(2))
        heures_sup = heures_travaillees > 8 ? parseFloat((heures_travaillees - 8).toFixed(2)) : 0
      }

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
      societe_id,
      heure_forcee,
      motif_absence,
      date_pointage: bodyDate,
    } = body

    if (!employe_id || !type_pointage) {
      return NextResponse.json({ error: 'employe_id et type_pointage requis' }, { status: 400 })
    }

    const today = bodyDate || new Date().toISOString().split('T')[0]
    const now = heure_forcee || new Date().toTimeString().split(' ')[0] // HH:MM:SS

    // Helper: find existing pointage for this employee on this date
    async function findExisting() {
      const { data } = await supabase
        .from('pointages')
        .select('*')
        .eq('employe_id', employe_id)
        .eq('date_pointage', today)
        .order('created_at', { ascending: false })
        .limit(1)
      return data && data.length > 0 ? data[0] : null
    }

    // Special case: justified absence
    if (type_pointage === 'absence_justifiee') {
      const existing = await findExisting()

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
        if (error) throw error
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
        if (error) throw error
        return NextResponse.json({ pointage: data, message: 'Absence justifiee enregistree' })
      }
    }

    const existing = await findExisting()

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
      const updateData: Record<string, unknown> = {
        heure_sortie: now,
        duree_minutes,
      }

      const { data, error } = await supabase
        .from('pointages')
        .update(updateData)
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
