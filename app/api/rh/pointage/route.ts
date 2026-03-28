import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const societe_id = searchParams.get('societe_id')
    const employe_id = searchParams.get('employe_id')
    const mensuel = searchParams.get('mensuel') === '1'
    const periode = searchParams.get('periode') // YYYY-MM

    // Récupérer la liste des employés filtrés par société
    let empIds: string[] | null = null
    if (societe_id) {
      const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
      empIds = emps?.map(e => e.id) || []
    }

    if (mensuel || periode) {
      // Vue mensuelle : retourner tous les pointages du mois
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

      // Ajouter des infos calculées
      const enriched = (data || []).map(p => ({
        ...p,
        date: p.date_pointage,
        absence_injustifiee: !p.heure_entree && !p.absent_justifie,
      }))

      return NextResponse.json({ pointages: enriched, mois, nb: enriched.length })
    }

    // Vue journalière (défaut)
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { employe_id, type_pointage, methode = 'manuel', latitude, longitude, heure_forcee, motif_absence, type_absence } = body
    if (!employe_id || !type_pointage) return NextResponse.json({ error: 'employe_id et type_pointage requis' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]
    const now = heure_forcee || new Date().toTimeString().split(' ')[0]

    // Cas spécial : enregistrement d'une absence justifiée
    if (type_pointage === 'absence_justifiee') {
      const { data, error } = await supabase.from('pointages').upsert({
        employe_id,
        date_pointage: today,
        absent_justifie: true,
        motif_absence: motif_absence || null,
        type_absence: type_absence || null,
      }, { onConflict: 'employe_id,date_pointage' }).select().single()
      if (error) throw error
      return NextResponse.json({ pointage: data, message: 'Absence justifiée enregistrée' })
    }

    const { data: existing } = await supabase.from('pointages').select('*').eq('employe_id', employe_id).eq('date_pointage', today).maybeSingle()

    let result
    if (!existing || type_pointage === 'entree') {
      const { data, error } = await supabase.from('pointages').upsert({
        employe_id, date_pointage: today, heure_entree: now,
        type_entree: methode, latitude_entree: latitude, longitude_entree: longitude,
      }, { onConflict: 'employe_id,date_pointage' }).select().single()
      if (error) throw error
      result = data
    } else {
      const duree = existing.heure_entree
        ? Math.round((new Date(`1970-01-01T${now}`).getTime() - new Date(`1970-01-01T${existing.heure_entree}`).getTime()) / 60000)
        : null
      const { data, error } = await supabase.from('pointages').update({
        heure_sortie: now, type_sortie: methode,
        latitude_sortie: latitude, longitude_sortie: longitude, duree_minutes: duree,
      }).eq('id', existing.id).select().single()
      if (error) throw error
      result = data
    }
    return NextResponse.json({ pointage: result })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
