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

// Cron: November 1st at 8AM — ROC (Registrar of Companies) Annual Return reminder
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-roc'

  try {
    const now = new Date()
    const annee = now.getFullYear()

    // Get all active societies
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id, date_incorporation')
      .eq('statut', 'active')

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      // Check if annual return already filed this year
      const { data: declaration } = await supabase
        .from('declarations_fiscales')
        .select('id')
        .eq('societe_id', societe.id)
        .eq('type', 'ROC_ANNUAL_RETURN')
        .gte('date_echeance', `${annee}-01-01`)
        .lte('date_echeance', `${annee}-12-31`)
        .eq('statut', 'soumise')
        .maybeSingle()

      if (declaration) continue

      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'alerte_roc',
        titre: `ROC Annual Return — ${annee}`,
        message: `Rappel: Le dépôt du Annual Return auprès du Registrar of Companies pour ${societe.nom} doit être effectué. Date limite habituelle: 28 novembre ${annee}. Des pénalités s'appliquent en cas de retard.`,
        niveau: 'important',
        canaux: ['app', 'whatsapp', 'email'],
        cron_name: cronName,
      })

      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_roc',
          titre: `ROC Annual Return — ${societe.nom}`,
          message: `Préparer le Annual Return ROC pour ${societe.nom}. Échéance: 28 novembre ${annee}.`,
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
      details: { societes_total: societes?.length || 0, alertes_envoyees: alertesEnvoyees, annee },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_total: societes?.length || 0, alertes_envoyees: alertesEnvoyees, annee },
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
