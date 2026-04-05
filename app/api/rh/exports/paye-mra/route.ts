import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    const { societe_id, periode } = await request.json()
    if (!societe_id || !periode) return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })

    const { data: societe } = await supabase.from('societes').select('*').eq('id', societe_id).single()

    // Fetch bulletins (no FK join — avoids schema cache issues)
    const { data: bulletins, error } = await supabase
      .from('bulletins_paie')
      .select('*')
      .eq('societe_id', societe_id)
      .ilike('periode', `${periode}%`)

    if (error) throw error
    if (!bulletins || bulletins.length === 0) return NextResponse.json({ error: 'Aucun bulletin pour cette période' }, { status: 404 })

    // Fetch employee data separately
    const empIds = [...new Set(bulletins.map(b => b.employe_id).filter(Boolean))]
    const { data: employes } = empIds.length > 0
      ? await supabase.from('employes').select('*').in('id', empIds)
      : { data: [] }
    const empMap = new Map((employes || []).map((e: any) => [e.id, e]))

    let total_salaires_bruts = 0
    let total_paye_retenu = 0

    const detailLines: string[] = [
      'TAN;Nom;Prénom;NIC;Salaire_Brut;Salaire_Annualisé;PAYE_Mensuel;Statut'
    ]

    for (const b of bulletins) {
      const emp = empMap.get(b.employe_id)
      const sb = Number(b.salaire_brut) || 0
      const paye = Number(b.paye) || 0
      const salaireAnnualise = sb * 12

      total_salaires_bruts += sb
      total_paye_retenu += paye

      // TAN : fallback NIC → TAN_MANQUANT
      const tanValue = emp?.tan_number || emp?.nic_number || 'TAN_MANQUANT'

      detailLines.push([
        tanValue,
        emp?.nom || '',
        emp?.prenom || '',
        emp?.nic_number || '',
        sb.toFixed(2),
        salaireAnnualise.toFixed(2),
        paye.toFixed(2),
        paye > 0 ? 'Taxable' : 'Exonéré',
      ].join(';'))
    }

    const ern_csv = societe?.ern || `[ERN_MANQUANT_-_BRN:${societe?.brn || '?'}]`
    const recapLines = [
      'ERN;Période;Nb_Employés;Total_Salaires_Bruts;Total_PAYE_Retenu',
      [
        ern_csv,
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
