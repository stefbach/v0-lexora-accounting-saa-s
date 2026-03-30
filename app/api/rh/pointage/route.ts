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
        .select('*, employe:employes(nom,prenom,poste,photo_url)')
        .gte('date_pointage', dateDebut)
        .lte('date_pointage', dateFin)
        .order('date_pointage', { ascending: true })

      if (employe_id) query = query.eq('employe_id', employe_id)
      else if (empIds && empIds.length > 0) query = query.in('employe_id', empIds)
      else if (empIds && empIds.length === 0) return NextResponse.json({ pointages: [], mois })

      const { data, error } = await query
      if (error) throw error

      const enriched = (data || []).map(p => ({
        ...p,
        date: p.date_pointage,
        absence_injustifiee: !p.heure_entree && !p.absent_justifie,
      }))

      return NextResponse.json({ pointages: enriched, mois, nb: enriched.length })
    }

    // Daily view (default)
    let query = supabase
      .from('pointages')
      .select('*, employe:employes(nom,prenom,poste,photo_url)')
      .eq('date_pointage', date)
      .order('heure_entree', { ascending: true })

    if (employe_id) query = query.eq('employe_id', employe_id)
    else if (empIds && empIds.length > 0) query = query.in('employe_id', empIds)
    else if (empIds && empIds.length === 0) return NextResponse.json({ pointages: [], date })

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ pointages: data, date })
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
    const {
      employe_id,
      type_pointage,
      societe_id,
      methode = 'manuel',
      latitude,
      longitude,
      heure_forcee,
      motif_absence,
      type_absence,
    } = body

    if (!employe_id || !type_pointage) {
      return NextResponse.json({ error: 'employe_id et type_pointage requis' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const now = heure_forcee || new Date().toTimeString().split(' ')[0] // HH:MM:SS

    // Special case: justified absence
    if (type_pointage === 'absence_justifiee') {
      const { data, error } = await supabase
        .from('pointages')
        .upsert(
          {
            employe_id,
            date_pointage: today,
            absent_justifie: true,
            motif_absence: motif_absence || null,
            type_absence: type_absence || null,
          },
          { onConflict: 'employe_id,date_pointage' }
        )
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ pointage: data, message: 'Absence justifiee enregistree' })
    }

    // Get existing pointage for today (may have duplicates if UNIQUE constraint missing)
    const { data: existingList } = await supabase
      .from('pointages')
      .select('*')
      .eq('employe_id', employe_id)
      .eq('date_pointage', today)
      .order('created_at', { ascending: false })
      .limit(1)

    const existing = existingList && existingList.length > 0 ? existingList[0] : null

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
        // Update existing record
        const res = await supabase.from('pointages')
          .update({ heure_entree: now })
          .eq('id', existing.id).select().single()
        data = res.data; error = res.error
      } else {
        // Insert new record
        const res = await supabase.from('pointages')
          .insert({ employe_id, date_pointage: today, heure_entree: now })
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
          { error: 'Pas de pointage d\'entree', message: 'Veuillez d\'abord pointer votre entree' },
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

      // Calculate worked hours and overtime
      const heures_travaillees = parseFloat((duree_minutes / 60).toFixed(2))
      const heures_sup = heures_travaillees > 8 ? parseFloat((heures_travaillees - 8).toFixed(2)) : 0
      const heures_sup_montant = heures_sup * 1.5 // 1.5x rate coefficient

      // Only update columns that exist in the table
      const updateData: Record<string, any> = { heure_sortie: now }

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
      return NextResponse.json({ error: 'type_pointage invalide. Utiliser "entree" ou "sortie"' }, { status: 400 })
    }

    return NextResponse.json({ pointage: result })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
