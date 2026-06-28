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

// Cron: 25th of month at 8AM — CSG/NSF declaration reminders
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-csg-mensuelle'

  try {
    const now = new Date()
    const moisSuivant = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const moisLabel = moisSuivant.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    // Get all societies with client_id — pas de filtre statut/nombre_employes (colonnes inexistantes)
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id')

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      if (!societe.client_id) continue

      // Check if CSG declaration already exists for this month in declarations_annuelles
      const { data: declaration } = await supabase
        .from('declarations_annuelles')
        .select('id')
        .eq('societe_id', societe.id)
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
        .lte('created_at', new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString())
        .maybeSingle()

      if (declaration) continue

      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'alerte_csg_nsf',
        titre: `CSG/NSF — Déclaration à préparer`,
        message: `Rappel: Les déclarations CSG et NSF pour ${societe.nom} sont dues début ${moisLabel}. Veuillez préparer les fiches de paie et données salariales.`,
        niveau: 'important',
        canaux: ['app', 'whatsapp'],
        cron_name: cronName,
      })

      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_csg_nsf',
          titre: `CSG/NSF — ${societe.nom}`,
          message: `Préparer les déclarations CSG/NSF pour ${societe.nom}. Échéance début ${moisLabel}.`,
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
      details: { societes_traitees: societes?.length || 0, alertes_envoyees: alertesEnvoyees },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_traitees: societes?.length || 0, alertes_envoyees: alertesEnvoyees },
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
