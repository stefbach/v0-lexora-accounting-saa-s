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

// Cron: Every day at 2AM — Update comptes_bancaires.solde_actuel from latest releves_bancaires
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'maj-soldes-bancaires'

  try {
    // Get all active bank accounts
    const { data: comptes, error: comptesError } = await supabase
      .from('comptes_bancaires')
      .select('id, societe_id, banque')

    if (comptesError) throw comptesError

    let updatedCount = 0

    for (const compte of comptes || []) {
      // Get the latest bank statement for this account
      const { data: dernier, error: releveError } = await supabase
        .from('releves_bancaires')
        .select('solde_cloture, date_fin')
        .eq('compte_bancaire_id', compte.id)
        .order('date_fin', { ascending: false })
        .limit(1)
        .single()

      if (releveError || !dernier) continue

      // Update the current balance
      const { error: updateError } = await supabase
        .from('comptes_bancaires')
        .update({
          solde_actuel: dernier.solde_cloture,
          date_dernier_releve: dernier.date_fin,
          solde_dernier_releve: dernier.solde_cloture,
        })
        .eq('id', compte.id)

      if (!updateError) updatedCount++
    }

    // Log cron execution
    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { comptes_total: comptes?.length || 0, comptes_mis_a_jour: updatedCount },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: {
        comptes_total: comptes?.length || 0,
        comptes_mis_a_jour: updatedCount,
      },
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
