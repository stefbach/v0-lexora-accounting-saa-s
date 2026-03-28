import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const type_facture = searchParams.get('type') // client | fournisseur
    const statut = searchParams.get('statut')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const limit = parseInt(searchParams.get('limit') || '100')

    let query = supabase
      .from('factures')
      .select('*')
      .order('date_facture', { ascending: false })
      .limit(limit)

    if (societe_id) query = query.eq('societe_id', societe_id)
    if (type_facture) query = query.eq('type_facture', type_facture)
    if (statut) query = query.eq('statut', statut)
    if (date_debut) query = query.gte('date_facture', date_debut)
    if (date_fin) query = query.lte('date_facture', date_fin)

    const { data, error } = await query
    if (error) throw error

    // Calcul totaux
    const totaux = {
      total_ht: data?.reduce((s, f) => s + (f.montant_ht || 0), 0) || 0,
      total_tva: data?.reduce((s, f) => s + (f.montant_tva || 0), 0) || 0,
      total_ttc: data?.reduce((s, f) => s + (f.montant_ttc || 0), 0) || 0,
      total_mur: data?.reduce((s, f) => s + (f.montant_mur || f.montant_ttc || 0), 0) || 0,
      nb_factures: data?.length || 0,
      nb_en_attente: data?.filter(f => f.statut === 'en_attente').length || 0,
      nb_retard: data?.filter(f => f.statut === 'retard').length || 0,
    }

    return NextResponse.json({ factures: data, totaux })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const {
      societe_id, dossier_id, numero_facture, type_facture = 'client',
      tiers, description, date_facture, date_echeance,
      devise = 'MUR', taux_change = 1,
      montant_ht = 0, montant_tva = 0, montant_ttc, taux_tva = 0,
      statut = 'en_attente', document_id, notes
    } = body

    if (!societe_id || !date_facture) {
      return NextResponse.json({ error: 'societe_id et date_facture requis' }, { status: 400 })
    }

    const ttc = montant_ttc ?? (montant_ht + montant_tva)
    const mur = devise === 'MUR' ? ttc : ttc * (taux_change || 1)

    const { data, error } = await supabase
      .from('factures')
      .insert({
        societe_id, dossier_id, numero_facture, type_facture,
        tiers, description, date_facture, date_echeance,
        devise, taux_change, montant_ht, montant_tva,
        montant_ttc: ttc, taux_tva, montant_mur: mur,
        statut, document_id, notes
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ facture: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
