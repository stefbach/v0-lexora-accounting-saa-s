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

    const { data, error } = await supabase
      .from('rapprochements_bancaires')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode_debut', { ascending: false })
    if (error) throw error

    return NextResponse.json({ rapprochements: data })
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
    const { action } = body

    if (action === 'creer') {
      // Calculer le solde comptable automatiquement depuis le grand livre
      const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', body.societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      let solde_comptable = 0
      if (dossierIds.length > 0) {
        const { data: ecritures } = await supabase
          .from('ecritures_comptables')
          .select('debit,credit')
          .in('dossier_id', dossierIds)
          .like('compte', '51%')  // comptes bancaires 51x
          .gte('date_ecriture', body.periode_debut)
          .lte('date_ecriture', body.periode_fin)

        const totD = (ecritures || []).reduce((s: number, e: any) => s + Number(e.debit), 0)
        const totC = (ecritures || []).reduce((s: number, e: any) => s + Number(e.credit), 0)
        solde_comptable = totD - totC
      }

      const { data, error } = await supabase.from('rapprochements_bancaires').insert({
        societe_id: body.societe_id,
        compte_bancaire: body.compte_bancaire || '512',
        banque: body.banque,
        periode_debut: body.periode_debut,
        periode_fin: body.periode_fin,
        solde_releve: body.solde_releve,
        solde_comptable,
        created_by: user.id,
      }).select().single()
      if (error) throw error
      return NextResponse.json({ rapprochement: data, solde_comptable })
    }

    if (action === 'valider') {
      const { data, error } = await supabase
        .from('rapprochements_bancaires')
        .update({ statut: 'valide', valide_par: user.id, valide_le: new Date().toISOString() })
        .eq('id', body.rapprochement_id)
        .select().single()
      if (error) throw error
      return NextResponse.json({ rapprochement: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
