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

// Cron: July 1st, October 1st, January 1st at 8AM — APS (Advance Payment System) quarterly tax reminder
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-aps'

  try {
    const now = new Date()
    const mois = now.getMonth() // 0=Jan, 6=Jul, 9=Oct
    const annee = now.getFullYear()

    // Determine APS quarter
    let trimestre: string
    let echeance: string
    if (mois === 0) {
      trimestre = 'T3 (Octobre-Décembre)'
      echeance = `31 janvier ${annee}`
    } else if (mois === 6) {
      trimestre = 'T1 (Avril-Juin)'
      echeance = `31 juillet ${annee}`
    } else if (mois === 9) {
      trimestre = 'T2 (Juillet-Septembre)'
      echeance = `31 octobre ${annee}`
    } else {
      // Should not run in other months, but handle gracefully
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        details: { message: 'Pas un mois APS, aucune action' },
      })
    }

    // Get all active societies subject to APS
    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id')
      .eq('statut', 'active')
      .eq('assujetti_aps', true)

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      // Check if APS already declared for this quarter
      const { data: declaration } = await supabase
        .from('declarations_fiscales')
        .select('id')
        .eq('societe_id', societe.id)
        .eq('type', 'APS')
        .gte('date_echeance', `${annee}-${String(mois + 1).padStart(2, '0')}-01`)
        .lte('date_echeance', `${annee}-${String(mois + 1).padStart(2, '0')}-31`)
        .eq('statut', 'soumise')
        .maybeSingle()

      if (declaration) continue

      await envoyerNotification({
        destinataire_id: societe.client_id,
        destinataire_type: 'client',
        societe_id: societe.id,
        type: 'alerte_aps',
        titre: `APS — ${trimestre}`,
        message: `Rappel: Le paiement trimestriel APS (Advance Payment System) pour ${societe.nom} est dû. Trimestre: ${trimestre}. Date limite: ${echeance}.`,
        niveau: 'important',
        canaux: ['app', 'whatsapp', 'email'],
        cron_name: cronName,
      })

      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_aps',
          titre: `APS — ${societe.nom} — ${trimestre}`,
          message: `Préparer la déclaration APS pour ${societe.nom}. ${trimestre}, échéance: ${echeance}.`,
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
      details: { societes_assujetties: societes?.length || 0, alertes_envoyees: alertesEnvoyees, trimestre },
      executed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { societes_assujetties: societes?.length || 0, alertes_envoyees: alertesEnvoyees, trimestre },
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
