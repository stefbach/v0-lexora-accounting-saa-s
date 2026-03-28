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

// Cron: December 1st at 8AM — 13th month bonus (prime de fin d'année) reminder
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-treizieme-mois'

  try {
    const now = new Date()
    const annee = now.getFullYear()

    // Get societies with employees
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id, nombre_employes')
      .eq('statut', 'actif')
      .gt('nombre_employes', 0)

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'alerte_treizieme_mois',
        titre: `13ème mois — Décembre ${annee}`,
        message: `Rappel: Le paiement du 13ème mois (End of Year Bonus) pour les ${societe.nombre_employes} employé(s) de ${societe.nom} doit être effectué avant le 31 décembre ${annee}. Veuillez préparer la provision nécessaire.`,
        niveau: 'important',
        canaux: ['app', 'whatsapp'],
        cron_name: cronName,
      })

      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_treizieme_mois',
          titre: `13ème mois — ${societe.nom}`,
          message: `Préparer le calcul du 13ème mois pour ${societe.nom} (${societe.nombre_employes} employés). Paiement avant le 31/12/${annee}.`,
          niveau: 'important',
          canaux: ['app'],
          cron_name: cronName,
        })
      }

      alertesEnvoyees++
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { societes_avec_employes: societes?.length || 0, alertes_envoyees: alertesEnvoyees, annee },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_avec_employes: societes?.length || 0, alertes_envoyees: alertesEnvoyees, annee },
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
