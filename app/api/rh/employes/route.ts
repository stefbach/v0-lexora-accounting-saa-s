import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const search = searchParams.get('search')
    const actifs = searchParams.get('actifs') !== 'false'

    let query = supabase.from('employes').select('*').order('nom')
    if (societe_id) query = query.eq('societe_id', societe_id)
    if (actifs) query = query.eq('actif', true)
    if (search) query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,poste.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ employes: data, total: data?.length || 0 })
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
    if (!body.societe_id || !body.nom || !body.prenom || !body.salaire_base)
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

    // Générer code employé
    const { count } = await supabase.from('employes').select('*', { count: 'exact', head: true }).eq('societe_id', body.societe_id)
    body.code = String((count || 0) + 1).padStart(6, '0')

    const { data, error } = await supabase.from('employes').insert(body).select().single()
    if (error) throw error

    // Initialiser soldes congés année en cours
    await supabase.from('soldes_conges').insert({
      employe_id: data.id,
      annee: new Date().getFullYear(),
    })

    return NextResponse.json({ employe: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
