import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { envoyerNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Cron: 28th of month at 8AM — Check for missing bank statements and invoices
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-documents-manquants'

  try {
    const now = new Date()
    const moisCourant = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const finMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id')
      .eq('statut', 'active')

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      const manquants: string[] = []

      // Check for bank statements this month
      const { data: comptes } = await supabase
        .from('comptes_bancaires')
        .select('id, nom_banque')
        .eq('societe_id', societe.id)

      for (const compte of comptes || []) {
        const { data: releve } = await supabase
          .from('releves_bancaires')
          .select('id')
          .eq('compte_bancaire_id', compte.id)
          .gte('date_debut', debutMois)
          .lte('date_fin', finMois)
          .maybeSingle()

        if (!releve) {
          manquants.push(`Relevé bancaire (${compte.nom_banque})`)
        }
      }

      // Check for invoices this month
      const { count: nbFactures } = await supabase
        .from('factures')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', societe.id)
        .gte('date_facture', debutMois)
        .lte('date_facture', finMois)

      if ((nbFactures || 0) === 0) {
        manquants.push('Aucune facture enregistrée')
      }

      if (manquants.length === 0) continue

      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'alerte_documents_manquants',
        titre: `Documents manquants — ${moisCourant}`,
        message: `Documents manquants pour ${societe.nom}:\n${manquants.map(m => `• ${m}`).join('\n')}\n\nVeuillez les soumettre avant la fin du mois.`,
        niveau: 'important',
        canaux: ['app', 'whatsapp'],
        cron_name: cronName,
      })

      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_documents_manquants',
          titre: `Documents manquants — ${societe.nom}`,
          message: `${societe.nom} — ${moisCourant}:\n${manquants.map(m => `• ${m}`).join('\n')}`,
          niveau: 'info',
          canaux: ['app'],
          cron_name: cronName,
        })
      }

      alertesEnvoyees++
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { societes_total: societes?.length || 0, societes_avec_manquants: alertesEnvoyees },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_total: societes?.length || 0, societes_avec_manquants: alertesEnvoyees },
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
