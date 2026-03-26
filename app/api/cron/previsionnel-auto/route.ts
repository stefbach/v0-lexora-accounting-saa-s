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

// Cron: 1st of month at 7AM — Auto-generate financial forecasts based on historical data
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'previsionnel-auto'

  try {
    const now = new Date()
    const moisCourant = now.toISOString().slice(0, 7) // YYYY-MM
    const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom')
      .eq('statut', 'active')

    if (societesError) throw societesError

    let previsionsGenerees = 0

    for (const societe of societes || []) {
      // Gather last 6 months of revenue data for averaging
      const sixMoisAvant = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10)
      const finMoisPrecedent = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

      const { data: factures } = await supabase
        .from('factures')
        .select('montant_ht, date_facture')
        .eq('societe_id', societe.id)
        .gte('date_facture', sixMoisAvant)
        .lte('date_facture', finMoisPrecedent)

      const { data: depenses } = await supabase
        .from('depenses')
        .select('montant, date_depense')
        .eq('societe_id', societe.id)
        .gte('date_depense', sixMoisAvant)
        .lte('date_depense', finMoisPrecedent)

      // Calculate monthly averages
      const totalRevenus = factures?.reduce((sum, f) => sum + (f.montant_ht || 0), 0) || 0
      const totalDepenses = depenses?.reduce((sum, d) => sum + (d.montant || 0), 0) || 0
      const nbMoisDonnees = Math.max(1, Math.min(6, new Set(factures?.map(f => f.date_facture?.slice(0, 7))).size || 1))

      const revenuMoyenMensuel = totalRevenus / nbMoisDonnees
      const depenseMoyenneMensuelle = totalDepenses / nbMoisDonnees
      const resultatPrevisionnel = revenuMoyenMensuel - depenseMoyenneMensuelle

      // Insert forecast
      const { error: insertError } = await supabase.from('previsionnels').insert({
        societe_id: societe.id,
        mois: `${moisCourant}-01`,
        revenu_prevu: Math.round(revenuMoyenMensuel * 100) / 100,
        depenses_prevues: Math.round(depenseMoyenneMensuelle * 100) / 100,
        resultat_prevu: Math.round(resultatPrevisionnel * 100) / 100,
        base_calcul: `Moyenne sur ${nbMoisDonnees} mois`,
        mois_historiques: nbMoisDonnees,
        genere_par: 'cron',
        created_at: new Date().toISOString(),
      })

      if (!insertError) previsionsGenerees++
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { societes_total: societes?.length || 0, previsions_generees: previsionsGenerees, mois: moisLabel },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_total: societes?.length || 0, previsions_generees: previsionsGenerees, mois: moisLabel },
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
