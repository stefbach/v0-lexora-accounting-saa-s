import { NextResponse } from 'next/server'
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
      // ⚠️ V2 ONLY (mig 230). Schéma : numero_compte, debit_mur, credit_mur.
      // (Avant : lecture V1 avec colonnes fantômes `montant`, `compte_debit`,
      // `compte_credit` qui n'existent pas → tout retournait 0.)
      const { data: ecrituresData } = await supabase
        .from('ecritures_comptables_v2')
        .select('numero_compte, debit_mur, credit_mur, journal, libelle')
        .eq('societe_id', societe.id)
        .gte('date_ecriture', debutMois)
        .lte('date_ecriture', finMois)
      const ecritures = ecrituresData || []

      // Classify revenue (class 7 = credit-debit) and expenses (class 6 = debit-credit)
      const totalRevenus = ecritures
        .filter(e => e.numero_compte?.startsWith('7'))
        .reduce((sum, e) => sum + ((Number(e.credit_mur) || 0) - (Number(e.debit_mur) || 0)), 0)

      const totalDepenses = ecritures
        .filter(e => e.numero_compte?.startsWith('6'))
        .reduce((sum, e) => sum + ((Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)), 0)

      const resultatNet = totalRevenus - totalDepenses

      // Group expenses by journal
      const depensesParJournal: Record<string, number> = {}
      for (const e of ecritures.filter(e => e.numero_compte?.startsWith('6'))) {
        const cat = e.journal || 'Autres'
        depensesParJournal[cat] = (depensesParJournal[cat] || 0) + ((Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0))
      }

      // Insert rapport using actual schema (periode + data JSONB)
      const { error: insertError } = await supabase.from('rapports_mensuels').insert({
        client_id: societe.client_id,
        societe_id: societe.id,
        periode: debutMois,
        type_rapport: 'mensuel',
        data: {
          revenus: totalRevenus,
          depenses: totalDepenses,
          resultat_net: resultatNet,
          depenses_par_journal: depensesParJournal,
          nombre_ecritures: ecritures.length,
          genere_par: 'cron',
        },
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
    })

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
