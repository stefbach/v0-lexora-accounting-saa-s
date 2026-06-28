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

// Cron: Every Monday at 8AM — Update weekly dashboards
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
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
      // Get ecritures comptables for the week via société
      // ⚠️ V2 ONLY (mig 230). Schéma : numero_compte, debit_mur, credit_mur.
      // (Avant : lecture de V1 avec colonnes fantômes `montant`, `compte_debit`,
      // `compte_credit` qui n'existent pas → tout retournait 0 silencieusement.)
      const { data: ecrituresData } = await supabase
        .from('ecritures_comptables_v2')
        .select('numero_compte, debit_mur, credit_mur')
        .eq('societe_id', societe.id)
        .gte('date_ecriture', debutSemaineStr)
        .lte('date_ecriture', finSemaineStr)
      const ecritures = ecrituresData || []

      // Revenue (credit on class 7) and expenses (debit on class 6)
      const revenuSemaine = ecritures
        .filter(e => e.numero_compte?.startsWith('7'))
        .reduce((sum, e) => sum + ((Number(e.credit_mur) || 0) - (Number(e.debit_mur) || 0)), 0)

      const depensesSemaine = ecritures
        .filter(e => e.numero_compte?.startsWith('6'))
        .reduce((sum, e) => sum + ((Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)), 0)

      // Current bank balances
      const { data: comptes } = await supabase
        .from('comptes_bancaires')
        .select('banque, devise, solde_actuel')
        .eq('societe_id', societe.id)

      const tresorerieParCompte = (comptes || []).map((c: any) => ({
        banque: c.banque,
        devise: c.devise,
        solde: c.solde_actuel,
      }))
      const tresorerieConsolidee = comptes?.reduce((sum, c) => sum + (c.solde_actuel || 0), 0) || 0

      // Insert weekly dashboard using actual tableaux_de_bord schema
      const periodeStr = `${debutSemaineStr}/${finSemaineStr}`
      const { error: upsertError } = await supabase.from('tableaux_de_bord').insert({
        societe_id: societe.id,
        periode: periodeStr,
        type_periode: 'hebdomadaire',
        tresorerie_consolidee: tresorerieConsolidee,
        tresorerie_par_compte: tresorerieParCompte,
        ca_ht: revenuSemaine,
        benefice_net: revenuSemaine - depensesSemaine,
        score_sante_global: null,
        recommandations: null,
        tendance: null,
        genere_par: 'cron',
      })

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
    })

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
