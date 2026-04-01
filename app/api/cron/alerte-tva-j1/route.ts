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

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'alerte-tva-j1'

  try {
    const now = new Date()
    const moisPrecedent = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const periode = moisPrecedent.toISOString().slice(0, 7)
    const moisLabel = moisPrecedent.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    const dateLimit = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-20`

    const { data: societes, error: societesError } = await supabase
      .from('societes')
      .select('id, nom, client_id, comptable_id')
      .eq('statut_tva', true)

    if (societesError) throw societesError

    let alertesEnvoyees = 0

    for (const societe of societes || []) {
      const { data: existing } = await supabase
        .from('tva_mensuelle')
        .select('id')
        .eq('societe_id', societe.id)
        .eq('periode', periode)
        .maybeSingle()

      if (!existing) {
        await supabase.from('tva_mensuelle').insert({
          societe_id: societe.id,
          client_id: societe.client_id,
          periode,
          date_limite: dateLimit,
          statut_declaration: 'a_faire',
          tva_collectee: 0,
          tva_deductible: 0,
          tva_nette: 0,
        })
      }

      if (societe.comptable_id) {
        await envoyerNotification({
          destinataire_id: societe.comptable_id,
          destinataire_type: 'comptable',
          societe_id: societe.id,
          type: 'alerte_tva',
          titre: `TVA ${societe.nom} — ${moisLabel} à déclarer`,
          message: `La déclaration TVA de ${societe.nom} pour ${moisLabel} est disponible. Date limite: ${dateLimit}.`,
          niveau: 'important',
          canaux: ['app'],
          cron_name: cronName,
        })
        alertesEnvoyees++
      }
    }

    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'success',
      nb_societes_traitees: societes?.length || 0,
      nb_alertes_creees: alertesEnvoyees,
      details: { periode },
    })

    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), alertes: alertesEnvoyees })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue'
    await supabase.from('cron_logs').insert({ cron_name: cronName, statut: 'error', erreurs: { message: msg } })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
