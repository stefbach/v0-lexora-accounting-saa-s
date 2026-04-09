import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getAdminClient()

  try {
    const { societe_id, type_simulation, parametres, titre } = await request.json()

    if (!societe_id || !type_simulation || !parametres || !titre) {
      return NextResponse.json({ error: 'societe_id, type_simulation, parametres et titre requis' }, { status: 400 })
    }

    // Get comptes bancaires
    const { data: comptes, error: comptesError } = await supabase
      .from('comptes_bancaires')
      .select('*')
      .eq('societe_id', societe_id)

    if (comptesError) throw comptesError

    // Get latest rapport
    const { data: rapport, error: rapportError } = await supabase
      .from('rapports_mensuels')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })
      .limit(1)
      .single()

    if (rapportError && rapportError.code !== 'PGRST116') throw rapportError

    // Call Claude for scenario analysis (3 scenarios + score 0-100)
    const analyse = await callClaudeJSON(
      `Tu es un expert-comptable mauricien spécialisé en simulation financière.
      Analyse le scénario demandé et retourne un JSON avec:
      - scenario_optimiste (object: { description, impact_tresorerie, impact_resultat, probabilite })
      - scenario_realiste (object: { description, impact_tresorerie, impact_resultat, probabilite })
      - scenario_pessimiste (object: { description, impact_tresorerie, impact_resultat, probabilite })
      - score_viabilite (number 0-100)
      - recommandation (string)
      - risques_identifies (array of strings)
      Retourne uniquement le JSON.`,
      `Société ID: ${societe_id}
      Type de simulation: ${type_simulation}
      Titre: ${titre}
      Paramètres: ${JSON.stringify(parametres)}
      Comptes bancaires: ${JSON.stringify(comptes || [])}
      Dernier rapport mensuel: ${JSON.stringify(rapport || {})}
      Retourne uniquement le JSON.`
    )

    // Save to simulations table using actual schema fields
    const a = analyse as any
    const { data: simulation, error: insertError } = await supabase
      .from('simulations')
      .insert({
        societe_id,
        titre,
        type_simulation,
        parametres_json: parametres,
        scenario_optimiste: a.scenario_optimiste || null,
        scenario_base: a.scenario_realiste || null,
        scenario_pessimiste: a.scenario_pessimiste || null,
        recommandation: a.recommandation || null,
        score_opportunite: a.score_viabilite || null,
        statut: 'genere',
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ success: true, simulation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
