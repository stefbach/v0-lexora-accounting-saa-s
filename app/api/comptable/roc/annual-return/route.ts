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
    const annee = searchParams.get('annee')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let query = supabase
      .from('annual_returns_roc')
      .select('*')
      .eq('societe_id', societe_id)
      .order('annee', { ascending: false })

    if (annee) query = query.eq('annee', parseInt(annee))

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ annual_returns: data || [] })
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
    const {
      societe_id, annee, date_agm, date_echeance, date_soumission,
      reference_roc, statut, actif_total, passif_total,
      chiffre_affaires, resultat_net, notes
    } = body

    if (!societe_id || !annee) {
      return NextResponse.json({ error: 'societe_id et annee sont requis' }, { status: 400 })
    }

    // Calculer date_echeance = date_agm + 28 jours si non fournie
    let echeance = date_echeance
    if (!echeance && date_agm) {
      const agm = new Date(date_agm)
      agm.setDate(agm.getDate() + 28)
      echeance = agm.toISOString().split('T')[0]
    }

    const { data, error } = await supabase
      .from('annual_returns_roc')
      .upsert({
        societe_id, annee, date_agm, date_echeance: echeance,
        date_soumission, reference_roc, statut: statut || 'a_faire',
        actif_total, passif_total, chiffre_affaires, resultat_net, notes
      }, { onConflict: 'societe_id,annee' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ annual_return: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const body = await request.json()

    // Recalculer date_echeance si date_agm change
    if (body.date_agm && !body.date_echeance) {
      const agm = new Date(body.date_agm)
      agm.setDate(agm.getDate() + 28)
      body.date_echeance = agm.toISOString().split('T')[0]
    }

    const { data, error } = await supabase
      .from('annual_returns_roc')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ annual_return: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
