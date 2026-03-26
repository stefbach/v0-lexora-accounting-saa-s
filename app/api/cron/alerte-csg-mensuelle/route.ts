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

// Cron: 25th of month at 8AM — CSG/NSF declaration reminders
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-csg-mensuelle'

  try {
    const now = new Date()
    const moisSuivant = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const moisLabel = moisSuivant.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    // Get societies with employees (subject to CSG/NSF)
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id, nombre_employes')
      .eq('statut', 'active')
      .gt('nombre_employes', 0)

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      // Check if CSG declaration already exists
      const { data: declaration } = await supabase
        .from('declarations_fiscales')
        .select('id')
        .eq('societe_id', societe.id)
        .in('type', ['CSG', 'NSF'])
        .gte('date_echeance', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
        .lte('date_echeance', new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))
        .eq('statut', 'soumise')
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
          message: `Préparer les déclarations CSG/NSF pour ${societe.nom} (${societe.nombre_employes} employés). Échéance début ${moisLabel}.`,
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
      details: { societes_avec_employes: societes?.length || 0, alertes_envoyees: alertesEnvoyees },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_avec_employes: societes?.length || 0, alertes_envoyees: alertesEnvoyees },
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
