import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { societe_id, periode, banque = 'MCB', format = 'csv' } = await request.json()

    const { data: bulletins } = await supabase
      .from('bulletins_paie')
      .select('*, employe:employes(nom,prenom,code,bank_account,bank_name)')
      .eq('societe_id', societe_id)
      .eq('periode', periode)
      .eq('statut', 'valide')

    if (!bulletins?.length) return NextResponse.json({ error: 'Aucun bulletin validé pour cette période' }, { status: 404 })

    let content = ''
    const date = new Date().toISOString().split('T')[0]

    if (banque === 'MCB') {
      // Format MCB Juice Pro / MCB Internet Banking
      content = 'Account Number,Beneficiary Name,Amount,Currency,Reference,Date\n'
      for (const b of bulletins) {
        const emp = b.employe as any
        content += `${emp?.bank_account || ''},${emp?.prenom || ''} ${emp?.nom || ''},${b.salaire_net.toFixed(2)},MUR,SALARY ${periode},${date}\n`
      }
    } else if (banque === 'SBM') {
      // Format SBM
      content = `BATCH SALARY PAYMENT|${date}|${bulletins.length}\n`
      for (const b of bulletins) {
        const emp = b.employe as any
        content += `${emp?.bank_account || ''}|${emp?.prenom || ''} ${emp?.nom || ''}|${b.salaire_net.toFixed(2)}|MUR\n`
      }
    }

    const total = bulletins.reduce((s, b) => s + b.salaire_net, 0)
    return NextResponse.json({
      content,
      filename: `virements_salaires_${periode}_${banque}.${format}`,
      nb_beneficiaires: bulletins.length,
      montant_total: total,
      banque,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
