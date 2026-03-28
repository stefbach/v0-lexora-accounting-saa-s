import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { societe_id, periode } = await request.json()
    if (!societe_id || !periode) return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })

    const { data: societe } = await supabase.from('societes').select('nom, brn, ern, tan_societe').eq('id', societe_id).single()

    const { data: bulletins, error } = await supabase
      .from('bulletins_paie')
      .select('*, employe:employes(code, nom, prenom, tan, nic)')
      .eq('societe_id', societe_id)
      .ilike('periode', `${periode}%`)

    if (error) throw error
    if (!bulletins || bulletins.length === 0) return NextResponse.json({ error: 'Aucun bulletin pour cette période' }, { status: 404 })

    let total_salaires_bruts = 0
    let total_paye_retenu = 0

    const detailLines: string[] = [
      'TAN;Nom;Prénom;NIC;Salaire_Brut;Salaire_Annualisé;PAYE_Mensuel;Statut'
    ]

    for (const b of bulletins) {
      const sb = Number(b.salaire_brut) || 0
      const paye = Number(b.paye) || 0
      const salaireAnnualise = sb * 12

      total_salaires_bruts += sb
      total_paye_retenu += paye

      // TAN : fallback NIC → TAN_MANQUANT
      const tanValue = b.employe?.tan || b.employe?.nic || 'TAN_MANQUANT'

      detailLines.push([
        tanValue,
        b.employe?.nom || '',
        b.employe?.prenom || '',
        b.employe?.nic || '',
        sb.toFixed(2),
        salaireAnnualise.toFixed(2),
        paye.toFixed(2),
        paye > 0 ? 'Taxable' : 'Exonéré',
      ].join(';'))
    }

    const ernPaye = societe?.ern || 'ERN_NON_RENSEIGNE'
    const recapLines = [
      'ERN;Période;Nb_Employés;Total_Salaires_Bruts;Total_PAYE_Retenu',
      [
        ernPaye,
        periode,
        bulletins.length,
        total_salaires_bruts.toFixed(2),
        total_paye_retenu.toFixed(2),
      ].join(';')
    ]

    return NextResponse.json({
      recap_csv: recapLines.join('\n'),
      detail_csv: detailLines.join('\n'),
      totaux: { total_salaires_bruts, total_paye_retenu, nb_employes: bulletins.length },
      societe: societe?.nom,
      periode,
      filename_recap: `PAYE_Recap_${societe?.nom?.replace(/\s+/g, '_')}_${periode}.csv`,
      filename_detail: `PAYE_Detail_${societe?.nom?.replace(/\s+/g, '_')}_${periode}.csv`,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
