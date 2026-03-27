import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Cron: 2nd of month at 7AM — Generate P&L reports for previous month
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'rapport-mensuel'

  try {
    const now = new Date()
    const moisPrecedent = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const finMoisPrecedent = new Date(now.getFullYear(), now.getMonth(), 0)
    const moisLabel = moisPrecedent.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    const debutMois = moisPrecedent.toISOString().slice(0, 10)
    const finMois = finMoisPrecedent.toISOString().slice(0, 10)

    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id')
      .eq('statut', 'active')

    if (societesError) throw societesError

    let rapportsGeneres = 0

    for (const societe of societes || []) {
      // Revenue
      const { data: revenus } = await supabase
        .from('factures')
        .select('montant_ht, montant_ttc, tva')
        .eq('societe_id', societe.id)
        .gte('date_facture', debutMois)
        .lte('date_facture', finMois)

      const totalRevenusHT = revenus?.reduce((sum, f) => sum + (f.montant_ht || 0), 0) || 0
      const totalRevenusTTC = revenus?.reduce((sum, f) => sum + (f.montant_ttc || 0), 0) || 0
      const totalTVACollectee = revenus?.reduce((sum, f) => sum + (f.tva || 0), 0) || 0

      // Expenses
      const { data: depenses } = await supabase
        .from('depenses')
        .select('montant, categorie')
        .eq('societe_id', societe.id)
        .gte('date_depense', debutMois)
        .lte('date_depense', finMois)

      const totalDepenses = depenses?.reduce((sum, d) => sum + (d.montant || 0), 0) || 0

      // Group expenses by category
      const depensesParCategorie: Record<string, number> = {}
      for (const d of depenses || []) {
        const cat = d.categorie || 'Autres'
        depensesParCategorie[cat] = (depensesParCategorie[cat] || 0) + (d.montant || 0)
      }

      // Insert rapport
      const { error: insertError } = await supabase.from('rapports_mensuels').insert({
        societe_id: societe.id,
        mois: debutMois,
        revenus_ht: totalRevenusHT,
        revenus_ttc: totalRevenusTTC,
        tva_collectee: totalTVACollectee,
        depenses_total: totalDepenses,
        resultat_net: totalRevenusHT - totalDepenses,
        depenses_par_categorie: depensesParCategorie,
        nombre_factures: revenus?.length || 0,
        nombre_depenses: depenses?.length || 0,
        genere_par: 'cron',
        created_at: new Date().toISOString(),
      })

      if (!insertError) rapportsGeneres++
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { societes_total: societes?.length || 0, rapports_generes: rapportsGeneres, mois: moisLabel },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_total: societes?.length || 0, rapports_generes: rapportsGeneres, mois: moisLabel },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'error',
      details: { error: message },
      executed_at: new Date().toISOString(),
    }).catch(() => {})

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
