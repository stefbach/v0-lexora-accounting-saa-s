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
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds = (dossiers || []).map((d: any) => d.id)
    if (!dossierIds.length) return NextResponse.json({ non_lettrees: [] })

    // Vue non lettrées
    const { data, error } = await supabase
      .from('ecritures_comptables')
      .select('compte,libelle,date_ecriture,debit,credit,lettre')
      .in('dossier_id', dossierIds)
      .is('lettre', null)
      .like('compte', '4%')
      .order('compte').order('date_ecriture')
      .limit(200)
    if (error) throw error

    return NextResponse.json({ ecritures_non_lettrees: data, nb: data?.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { action, dossier_id, ecriture_ids, lettre, compte } = await request.json()

    if (action === 'auto') {
      // Lettrage automatique via fonction SQL
      const { data, error } = await supabase.rpc('lettrer_automatique', {
        p_dossier_id: dossier_id,
        p_compte: compte || null
      })
      if (error) throw error
      return NextResponse.json({ nb_lettres: data, message: `${data} écritures lettrées automatiquement` })
    }

    if (action === 'manuel') {
      // Lettrage manuel : marquer les écritures avec un code lettrage
      if (!ecriture_ids?.length || !lettre) return NextResponse.json({ error: 'ecriture_ids et lettre requis' }, { status: 400 })
      const { error } = await supabase
        .from('ecritures_comptables')
        .update({ lettre, date_lettrage: new Date().toISOString().split('T')[0], lettrage_auto: false })
        .in('id', ecriture_ids)
      if (error) throw error
      return NextResponse.json({ message: `${ecriture_ids.length} écritures lettrées avec ${lettre}` })
    }

    if (action === 'delettrer') {
      const { error } = await supabase
        .from('ecritures_comptables')
        .update({ lettre: null, date_lettrage: null, lettrage_auto: false })
        .in('id', ecriture_ids)
      if (error) throw error
      return NextResponse.json({ message: 'Lettrage supprimé' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
