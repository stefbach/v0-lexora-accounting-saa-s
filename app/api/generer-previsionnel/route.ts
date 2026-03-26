import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callClaudeJSON } from '@/lib/claude'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  const supabase = getAdminClient()

  try {
    const { societe_id, type_periode, date_debut } = await request.json()

    if (!societe_id || !type_periode || !date_debut) {
      return NextResponse.json({ error: 'societe_id, type_periode et date_debut requis' }, { status: 400 })
    }

    // Get 3 months history from rapports_mensuels
    const troisMoisAvant = new Date(date_debut)
    troisMoisAvant.setMonth(troisMoisAvant.getMonth() - 3)

    const { data: rapports, error: rapportsError } = await supabase
      .from('rapports_mensuels')
      .select('*')
      .eq('societe_id', societe_id)
      .gte('mois', troisMoisAvant.toISOString().slice(0, 10))
      .order('mois', { ascending: false })
      .limit(3)

    if (rapportsError) throw rapportsError

    // Get comptes bancaires
    const { data: comptes, error: comptesError } = await supabase
      .from('comptes_bancaires')
      .select('*')
      .eq('societe_id', societe_id)

    if (comptesError) throw comptesError

    // Call Claude for forecast J+30/60/90
    const prevision = await callClaudeJSON(
      `Tu es un expert-comptable mauricien spécialisé en prévisionnel financier.
      À partir de l'historique fourni, génère un prévisionnel avec:
      - prevision_j30 (object: { revenus, depenses, resultat, tresorerie_estimee })
      - prevision_j60 (object: { revenus, depenses, resultat, tresorerie_estimee })
      - prevision_j90 (object: { revenus, depenses, resultat, tresorerie_estimee })
      - tendance_generale ("hausse" | "stable" | "baisse")
      - risques (array of strings, max 3)
      - opportunites (array of strings, max 3)
      - confiance (number 0-100)
      Retourne uniquement le JSON.`,
      `Société ID: ${societe_id}
      Type période: ${type_periode}
      Date début: ${date_debut}
      Historique rapports (3 derniers mois): ${JSON.stringify(rapports || [])}
      Comptes bancaires: ${JSON.stringify(comptes || [])}
      Retourne uniquement le JSON.`
    )

    // Save to previsionnels table
    const { data: saved, error: insertError } = await supabase
      .from('previsionnels')
      .insert({
        societe_id,
        type_periode,
        date_debut,
        historique_utilise: rapports,
        previsions: prevision,
        genere_le: new Date().toISOString(),
        genere_par: 'api',
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ success: true, previsionnel: saved })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
