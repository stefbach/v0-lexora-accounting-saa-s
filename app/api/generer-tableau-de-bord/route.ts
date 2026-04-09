import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { callClaudeJSON } from '@/lib/claude'
import { getTauxChange } from '@/lib/taux-change'

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
    const { societe_id, periode, type_periode } = await request.json()

    if (!societe_id || !periode || !type_periode) {
      return NextResponse.json({ error: 'societe_id, periode et type_periode requis' }, { status: 400 })
    }

    // Get comptes bancaires for the société
    const { data: comptes, error: comptesError } = await supabase
      .from('comptes_bancaires')
      .select('*')
      .eq('societe_id', societe_id)

    if (comptesError) throw comptesError

    // Calculate trésorerie consolidée in MUR
    const tauxChange = await getTauxChange()
    let tresorerieConsolidee = 0
    const detailParCompte = (comptes || []).map((c: any) => {
      const taux = tauxChange[c.devise] || 1
      const soldeMur = (c.solde_actuel || 0) * taux
      tresorerieConsolidee += soldeMur
      return { banque: c.banque, devise: c.devise, solde: c.solde_actuel, solde_mur: Math.round(soldeMur * 100) / 100 }
    })

    // Call Claude for financial ratios analysis
    const ratios = await callClaudeJSON(
      `Tu es un expert-comptable mauricien. Analyse les données financières et retourne un JSON avec:
      - ratio_liquidite (number)
      - ratio_endettement (number)
      - marge_nette (number)
      - score_sante (number 0-100)
      - recommandations (array of strings, max 3)
      - tendance ("hausse" | "stable" | "baisse")`,
      `Société ID: ${societe_id}
      Période: ${periode} (${type_periode})
      Trésorerie consolidée MUR: ${Math.round(tresorerieConsolidee)}
      Comptes bancaires: ${JSON.stringify(detailParCompte)}
      Retourne uniquement le JSON.`
    )

    // Save to tableaux_de_bord table
    const { data: tableau, error: insertError } = await supabase
      .from('tableaux_de_bord')
      .insert({
        societe_id,
        periode,
        type_periode,
        tresorerie_consolidee: Math.round(tresorerieConsolidee * 100) / 100,
        tresorerie_par_compte: detailParCompte,
        ratio_liquidite: (ratios as any).ratio_liquidite || null,
        score_liquidite: null,
        score_rentabilite: null,
        score_sante_global: (ratios as any).score_sante || null,
        marge_nette_pct: (ratios as any).marge_nette || null,
        recommandations: (ratios as any).recommandations || null,
        tendance: (ratios as any).tendance || null,
        genere_par: 'api',
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ success: true, tableau_de_bord: tableau })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
