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
    const compte = searchParams.get('compte')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const classe = searchParams.get('classe') // 1-7

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Récupérer les dossiers de la société
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('id')
      .eq('societe_id', societe_id)

    const dossierIds = dossiers?.map(d => d.id) || []
    if (!dossierIds.length) return NextResponse.json({ ecritures: [], soldes: {} })

    let query = supabase
      .from('ecritures_comptables')
      .select('*')
      .in('dossier_id', dossierIds)
      .order('compte')
      .order('date_ecriture')

    if (compte) query = query.like('compte', `${compte}%`)
    else if (classe) query = query.like('compte', `${classe}%`)
    if (date_debut) query = query.gte('date_ecriture', date_debut)
    if (date_fin) query = query.lte('date_ecriture', date_fin)

    const { data: ecritures, error } = await query
    if (error) throw error

    // Grouper par compte avec soldes cumulés
    const comptes: Record<string, {
      compte: string, libelle_compte: string,
      ecritures: typeof ecritures, total_debit: number,
      total_credit: number, solde: number
    }> = {}

    for (const e of ecritures || []) {
      if (!comptes[e.compte]) {
        comptes[e.compte] = {
          compte: e.compte,
          libelle_compte: e.libelle || '',
          ecritures: [],
          total_debit: 0,
          total_credit: 0,
          solde: 0
        }
      }
      comptes[e.compte].ecritures.push(e)
      comptes[e.compte].total_debit += e.debit || 0
      comptes[e.compte].total_credit += e.credit || 0
      comptes[e.compte].solde += (e.debit || 0) - (e.credit || 0)
    }

    return NextResponse.json({
      grand_livre: Object.values(comptes).sort((a, b) => a.compte.localeCompare(b.compte)),
      nb_comptes: Object.keys(comptes).length,
      nb_ecritures: ecritures?.length || 0
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
