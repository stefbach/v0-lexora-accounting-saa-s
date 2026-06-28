import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const actif = searchParams.get('actif')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let query = supabase
      .from('actionnaires')
      .select('*')
      .eq('societe_id', societe_id)
      .order('nom', { ascending: true })

    if (actif !== null) query = query.eq('actif', actif === 'true')

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ actionnaires: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json()
    const {
      societe_id, nom, prenom, type_personne, nationalite, adresse,
      nb_actions, type_actions, valeur_nominale, pourcentage,
      date_entree, date_sortie, actif
    } = body

    if (!societe_id || !nom) {
      return NextResponse.json({ error: 'societe_id et nom sont requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('actionnaires')
      .insert({
        societe_id, nom, prenom, type_personne, nationalite, adresse,
        nb_actions, type_actions, valeur_nominale, pourcentage,
        date_entree, date_sortie, actif: actif !== false
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ actionnaire: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Soft delete
    const { error } = await supabase
      .from('actionnaires')
      .update({ actif: false, date_sortie: new Date().toISOString().split('T')[0] })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
