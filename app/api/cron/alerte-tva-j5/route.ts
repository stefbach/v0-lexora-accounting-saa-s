import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
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

// Cron: 15th of month at 8AM — Alert for TVA declarations due in 5 days (20th)
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-tva-j5'

  try {
    const now = new Date()
    const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    // Get societies that need to file TVA
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id')
      .eq('statut', 'active')
      .eq('assujetti_tva', true)

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      // Check if TVA declaration already exists for this month
      const { data: declaration } = await supabase
        .from('declarations_fiscales')
        .select('id')
        .eq('societe_id', societe.id)
        .eq('type', 'TVA')
        .gte('date_echeance', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
        .lte('date_echeance', new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))
        .eq('statut', 'soumise')
        .maybeSingle()

      if (declaration) continue // Already submitted

      // Notify client
      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'alerte_tva',
        titre: `TVA — Échéance dans 5 jours`,
        message: `Rappel: La déclaration TVA pour ${societe.nom} (${moisLabel}) est due le 20. Veuillez soumettre vos documents dans les plus brefs délais.`,
        niveau: 'important',
        canaux: ['app', 'whatsapp'],
        cron_name: cronName,
      })

      // Notify accountant
      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_tva',
          titre: `TVA — ${societe.nom} — J-5`,
          message: `La déclaration TVA de ${societe.nom} pour ${moisLabel} n'a pas encore été soumise. Échéance le 20.`,
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
      details: { societes_assujetties: societes?.length || 0, alertes_envoyees: alertesEnvoyees },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_assujetties: societes?.length || 0, alertes_envoyees: alertesEnvoyees },
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
