import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Cron: 1st of month at 7AM — Auto-generate financial forecasts based on historical data
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
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
      // Gather last 6 months of ecritures via dossiers
      const sixMoisAvant = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10)
      const finMoisPrecedent = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

      // ⚠️ V2 ONLY (mig 230). Schéma : numero_compte, debit_mur, credit_mur.
      // (Avant : lecture V1 avec colonnes fantômes `montant`, `compte_debit`,
      // `compte_credit` qui n'existent pas → tout retournait 0.)
      const { data: ecrituresData } = await supabase
        .from('ecritures_comptables_v2')
        .select('numero_compte, debit_mur, credit_mur, date_ecriture')
        .eq('societe_id', societe.id)
        .gte('date_ecriture', sixMoisAvant)
        .lte('date_ecriture', finMoisPrecedent)
      const ecritures = ecrituresData || []

      // Calculate monthly averages from ecritures (class 7 = revenue, class 6 = expenses)
      const totalRevenus = ecritures
        .filter(e => e.numero_compte?.startsWith('7'))
        .reduce((sum, e) => sum + ((Number(e.credit_mur) || 0) - (Number(e.debit_mur) || 0)), 0)
      const totalDepenses = ecritures
        .filter(e => e.numero_compte?.startsWith('6'))
        .reduce((sum, e) => sum + ((Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)), 0)
      const nbMoisDonnees = Math.max(1, Math.min(6, new Set(ecritures.map(e => e.date_ecriture?.slice(0, 7))).size || 1))

      const revenuMoyenMensuel = totalRevenus / nbMoisDonnees
      const depenseMoyenneMensuelle = totalDepenses / nbMoisDonnees
      const resultatPrevisionnel = revenuMoyenMensuel - depenseMoyenneMensuelle

      // Get current bank balances for tresorerie
      const { data: comptes } = await supabase
        .from('comptes_bancaires')
        .select('banque, devise, solde_actuel')
        .eq('societe_id', societe.id)

      const tresorerieConsolidee = comptes?.reduce((sum, c) => sum + (c.solde_actuel || 0), 0) || 0
      const tresorerieParCompte = (comptes || []).map((c: any) => ({
        banque: c.banque, devise: c.devise, solde: c.solde_actuel,
      }))

      // Insert forecast using actual previsionnels schema
      const dateDebut = `${moisCourant}-01`
      const dateFin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

      const { error: insertError } = await supabase.from('previsionnels').insert({
        societe_id: societe.id,
        type_periode: 'mensuel',
        date_debut: dateDebut,
        date_fin: dateFin,
        prev_ca: Math.round(revenuMoyenMensuel * 100) / 100,
        prev_charges: Math.round(depenseMoyenneMensuelle * 100) / 100,
        prev_resultat: Math.round(resultatPrevisionnel * 100) / 100,
        prev_tresorerie_consolidee: tresorerieConsolidee,
        prev_tresorerie_par_compte: tresorerieParCompte,
        prev_detail_json: { base_calcul: `Moyenne sur ${nbMoisDonnees} mois`, mois_historiques: nbMoisDonnees },
        genere_par: 'cron',
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
    })

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
