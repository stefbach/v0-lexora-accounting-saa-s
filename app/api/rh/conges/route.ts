import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    const societe_id = searchParams.get('societe_id')
    const statut = searchParams.get('statut')

    let query = supabase.from('demandes_conges').select('*, employe:employes(nom,prenom,poste)').order('date_debut', { ascending: false })
    if (employe_id) query = query.eq('employe_id', employe_id)
    if (statut) query = query.eq('statut', statut)
    if (societe_id) {
      const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
      const ids = emps?.map(e => e.id) || []
      if (ids.length) query = query.in('employe_id', ids)
    }

    const [congesData, soldesData] = await Promise.all([
      query,
      employe_id
        ? supabase.from('soldes_conges').select('*').eq('employe_id', employe_id).order('annee', { ascending: false }).limit(1)
        : { data: null }
    ])

    if (congesData.error) throw congesData.error
    return NextResponse.json({ conges: congesData.data, soldes: soldesData.data?.[0] || null })
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
    if (!body.employe_id || !body.type_conge || !body.date_debut || !body.date_fin)
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

    const d1 = new Date(body.date_debut), d2 = new Date(body.date_fin)
    const nb_jours = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const { data, error } = await supabase.from('demandes_conges').insert({ ...body, nb_jours }).select().single()
    if (error) throw error
    return NextResponse.json({ conge: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
