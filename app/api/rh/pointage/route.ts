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

    let query = supabase.from('pointages').select('*, employe:employes(nom,prenom,poste,photo_url)').eq('date_pointage', date)
    if (societe_id) {
      const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
      const ids = emps?.map(e => e.id) || []
      if (ids.length) query = query.in('employe_id', ids)
    }
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

    const { employe_id, type_pointage, methode = 'manuel', latitude, longitude } = await request.json()
    if (!employe_id || !type_pointage) return NextResponse.json({ error: 'employe_id et type_pointage requis' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toTimeString().split(' ')[0]

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
