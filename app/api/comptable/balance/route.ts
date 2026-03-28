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
    const date_fin = searchParams.get('date_fin')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds = dossiers?.map(d => d.id) || []
    if (!dossierIds.length) return NextResponse.json({ balance: [], totaux: {} })

    let query = supabase
      .from('ecritures_comptables')
      .select('compte, libelle, debit, credit, date_ecriture')
      .in('dossier_id', dossierIds)
    if (date_fin) query = query.lte('date_ecriture', date_fin)

    const { data: ecritures, error } = await query
    if (error) throw error

    // Calculer balance par compte
    const balance: Record<string, { compte: string, total_debit: number, total_credit: number }> = {}
    for (const e of ecritures || []) {
      if (!balance[e.compte]) balance[e.compte] = { compte: e.compte, total_debit: 0, total_credit: 0 }
      balance[e.compte].total_debit += e.debit || 0
      balance[e.compte].total_credit += e.credit || 0
    }

    const lignes = Object.values(balance)
      .map(l => ({
        ...l,
        classe: l.compte[0],
        solde: l.total_debit - l.total_credit,
        solde_debiteur: Math.max(0, l.total_debit - l.total_credit),
        solde_crediteur: Math.max(0, l.total_credit - l.total_debit),
      }))
      .sort((a, b) => a.compte.localeCompare(b.compte))

    const totaux = {
      total_debit: lignes.reduce((s, l) => s + l.total_debit, 0),
      total_credit: lignes.reduce((s, l) => s + l.total_credit, 0),
      total_solde_debiteur: lignes.reduce((s, l) => s + l.solde_debiteur, 0),
      total_solde_crediteur: lignes.reduce((s, l) => s + l.solde_crediteur, 0),
    }

    // Regrouper par classe
    const par_classe: Record<string, typeof lignes> = {}
    for (const l of lignes) {
      if (!par_classe[l.classe]) par_classe[l.classe] = []
      par_classe[l.classe].push(l)
    }

    return NextResponse.json({ balance: lignes, par_classe, totaux })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
