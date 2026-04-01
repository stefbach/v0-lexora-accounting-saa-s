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

// Cron: 21st of month at 8AM — Alert for overdue TVA declarations
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-tva-retard'

  try {
    const now = new Date()
    const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    // Get societies that need to file TVA and haven't yet
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id')
      .eq('statut_tva', true)

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      // Check if TVA declaration already submitted
      const { data: declaration } = await supabase
        .from('declarations_annuelles')
        .select('id')
        .eq('societe_id', societe.id)
        .eq('type_declaration', 'tva')
        .gte('date_echeance', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
        .lte('date_echeance', new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))
        .eq('statut', 'soumis')
        .maybeSingle()

      if (declaration) continue

      // Critical alert to client
      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'alerte_tva_retard',
        titre: `URGENT — TVA en retard`,
        message: `La déclaration TVA pour ${societe.nom} (${moisLabel}) est en retard! L'échéance était le 20. Des pénalités peuvent s'appliquer. Veuillez régulariser immédiatement.`,
        niveau: 'critique',
        canaux: ['app', 'whatsapp', 'email'],
        cron_name: cronName,
      })

      // Critical alert to accountant
      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_tva_retard',
          titre: `URGENT — TVA en retard — ${societe.nom}`,
          message: `La déclaration TVA de ${societe.nom} pour ${moisLabel} n'a pas été soumise. Échéance dépassée le 20.`,
          niveau: 'critique',
          canaux: ['app', 'email'],
          cron_name: cronName,
        })
      }

      alertesEnvoyees++
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      details: { societes_en_retard: alertesEnvoyees, societes_assujetties: societes?.length || 0 },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_en_retard: alertesEnvoyees, societes_assujetties: societes?.length || 0 },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'error',
      details: { error: message },
      executed_at: new Date().toISOString(),
    }).then(() => {})

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
