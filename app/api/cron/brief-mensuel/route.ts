import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { envoyerNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Cron: 1st of month at 8AM — Generate monthly summaries for all clients
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'brief-mensuel'

  try {
    const now = new Date()
    const moisPrecedent = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const moisLabel = moisPrecedent.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    // Get all active societies
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id')
      .eq('statut', 'active')

    if (societesError) throw societesError

    let briefsGeneres = 0

    for (const societe of societes || []) {
      // Get revenue for the previous month
      const { data: factures } = await supabase
        .from('factures')
        .select('montant_ttc')
        .eq('societe_id', societe.id)
        .gte('date_facture', moisPrecedent.toISOString().slice(0, 10))
        .lt('date_facture', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))

      const totalFactures = factures?.reduce((sum, f) => sum + (f.montant_ttc || 0), 0) || 0

      // Get expenses for the previous month
      const { data: depenses } = await supabase
        .from('depenses')
        .select('montant')
        .eq('societe_id', societe.id)
        .gte('date_depense', moisPrecedent.toISOString().slice(0, 10))
        .lt('date_depense', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))

      const totalDepenses = depenses?.reduce((sum, d) => sum + (d.montant || 0), 0) || 0

      // Send notification to client
      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'brief_mensuel',
        titre: `Brief mensuel — ${moisLabel}`,
        message: `Résumé pour ${societe.nom} — ${moisLabel}:\n• Chiffre d'affaires: ${totalFactures.toLocaleString('fr-FR')} MUR\n• Dépenses: ${totalDepenses.toLocaleString('fr-FR')} MUR\n• Résultat net: ${(totalFactures - totalDepenses).toLocaleString('fr-FR')} MUR`,
        niveau: 'info',
        canaux: ['app'],
        cron_name: cronName,
      })

      briefsGeneres++
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { societes_total: societes?.length || 0, briefs_generes: briefsGeneres, mois: moisLabel },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_total: societes?.length || 0, briefs_generes: briefsGeneres, mois: moisLabel },
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
