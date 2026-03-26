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
    const { client_id, societe_id, periode } = await request.json()

    if (!client_id || !societe_id || !periode) {
      return NextResponse.json({ error: 'client_id, societe_id et periode requis' }, { status: 400 })
    }

    // Get rapport
    const { data: rapport } = await supabase
      .from('rapports_mensuels')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('mois', periode)
      .single()

    // Get TVA
    const { data: tva } = await supabase
      .from('tva')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })
      .limit(1)
      .single()

    // Get comptes bancaires
    const { data: comptes } = await supabase
      .from('comptes_bancaires')
      .select('*')
      .eq('societe_id', societe_id)

    // Call Claude for simple language summary
    const brief = await callClaudeJSON<{
      resume_texte: string
      conseil_texte: string
      alertes: string[]
    }>(
      `Tu es un conseiller financier mauricien qui parle en langage simple et accessible.
      Génère un brief client compréhensible par un non-comptable. Retourne un JSON avec:
      - resume_texte (string: résumé de la situation financière en 3-5 phrases simples)
      - conseil_texte (string: conseil principal en 1-2 phrases)
      - alertes (array of strings: points d'attention urgents, max 3)
      Utilise un ton professionnel mais accessible. Pas de jargon comptable.
      Retourne uniquement le JSON.`,
      `Client ID: ${client_id}
      Société ID: ${societe_id}
      Période: ${periode}
      Rapport mensuel: ${JSON.stringify(rapport || {})}
      Dernière TVA: ${JSON.stringify(tva || {})}
      Comptes bancaires: ${JSON.stringify(comptes || [])}
      Retourne uniquement le JSON.`
    )

    return NextResponse.json({
      success: true,
      resume_texte: brief.resume_texte,
      conseil_texte: brief.conseil_texte,
      alertes: brief.alertes,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
