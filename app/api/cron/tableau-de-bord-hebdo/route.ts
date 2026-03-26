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

// Cron: Every Monday at 8AM — Update weekly dashboards
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'tableau-de-bord-hebdo'

  try {
    const now = new Date()
    const debutSemaine = new Date(now)
    debutSemaine.setDate(now.getDate() - 7)
    const debutSemaineStr = debutSemaine.toISOString().slice(0, 10)
    const finSemaineStr = now.toISOString().slice(0, 10)

    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom')
      .eq('statut', 'active')

    if (societesError) throw societesError

    let tableauxMisAJour = 0

    for (const societe of societes || []) {
      // Weekly revenue
      const { data: factures } = await supabase
        .from('factures')
        .select('montant_ttc')
        .eq('societe_id', societe.id)
        .gte('date_facture', debutSemaineStr)
        .lte('date_facture', finSemaineStr)

      const revenuSemaine = factures?.reduce((sum, f) => sum + (f.montant_ttc || 0), 0) || 0

      // Weekly expenses
      const { data: depenses } = await supabase
        .from('depenses')
        .select('montant')
        .eq('societe_id', societe.id)
        .gte('date_depense', debutSemaineStr)
        .lte('date_depense', finSemaineStr)

      const depensesSemaine = depenses?.reduce((sum, d) => sum + (d.montant || 0), 0) || 0

      // Pending invoices
      const { count: facturesImpayees } = await supabase
        .from('factures')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', societe.id)
        .eq('statut', 'impayee')

      // Current bank balance
      const { data: comptes } = await supabase
        .from('comptes_bancaires')
        .select('solde_actuel')
        .eq('societe_id', societe.id)

      const soldeTotalBancaire = comptes?.reduce((sum, c) => sum + (c.solde_actuel || 0), 0) || 0

      // Upsert dashboard snapshot
      const { error: upsertError } = await supabase.from('tableau_de_bord').upsert({
        societe_id: societe.id,
        semaine_du: debutSemaineStr,
        revenu_semaine: revenuSemaine,
        depenses_semaine: depensesSemaine,
        factures_impayees: facturesImpayees || 0,
        solde_bancaire_total: soldeTotalBancaire,
        nombre_factures_semaine: factures?.length || 0,
        nombre_depenses_semaine: depenses?.length || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'societe_id,semaine_du' })

      if (!upsertError) tableauxMisAJour++
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { societes_total: societes?.length || 0, tableaux_mis_a_jour: tableauxMisAJour },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_total: societes?.length || 0, tableaux_mis_a_jour: tableauxMisAJour },
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
