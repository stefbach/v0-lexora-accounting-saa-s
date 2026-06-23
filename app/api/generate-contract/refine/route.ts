import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'
import { retrieveRag } from '@/lib/juridique/rag/store'
import { formatContextePrompt, formatCitations, type CitationSource } from '@/lib/juridique/rag/retriever'
import type { DomaineJuridique } from '@/lib/juridique/referentielMauricien'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CONTRACT_DOMAINES: Record<string, DomaineJuridique[]> = {
  CDI: ['travail', 'fiscal'], CDD: ['travail', 'fiscal'], CDD_partiel: ['travail', 'fiscal'],
  prestataire: ['commercial', 'civil', 'fiscal'], client_saas: ['commercial', 'donnees', 'civil'],
  client_service: ['commercial', 'civil'], nda: ['donnees', 'commercial', 'civil'],
  bail_commercial: ['immobilier', 'civil', 'commercial'],
}

/**
 * POST /api/generate-contract/refine
 * Affine un contrat déjà généré selon une instruction en langage naturel
 * (ajout/retrait/reformulation de clause), en restant ancré sur le RAG.
 * Body: { contract_type, current_text, instruction }
 */
export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
    const { contract_type, current_text, instruction } = body as { contract_type?: string; current_text?: string; instruction?: string }
    if (!current_text || !instruction?.trim()) return NextResponse.json({ error: 'current_text et instruction requis' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

    let sources: CitationSource[] = []
    let rag = ''
    try {
      const passages = await retrieveRag(`${instruction} clauses contrat droit mauricien`, { domaines: contract_type ? CONTRACT_DOMAINES[contract_type] : undefined, k: 5 })
      rag = formatContextePrompt(passages)
      sources = formatCitations(passages)
    } catch {
      rag = '## SOURCES VERROUILLÉES (RAG)\nCorpus momentanément indisponible : reste sur des dispositions sûres du droit mauricien et signale les points à vérifier.'
    }

    const prompt = `${rag}

Voici un CONTRAT existant (projet) :

<<<CONTRAT
${current_text}
CONTRAT>>>

DEMANDE DE MODIFICATION (langage naturel) :
"${instruction.trim()}"

INSTRUCTIONS :
1. Applique fidèlement la demande (ajout, retrait, reformulation ou ajustement de clause) en conservant la structure en articles, le style et les parties du contrat.
2. Ne supprime aucune clause obligatoire conforme. Applique la demande même si elle modifie une clause, sans ajouter de commentaire, d'avertissement ni de « note de vigilance » dans le document.
3. Toute référence légale doit s'appuyer sur les SOURCES VERROUILLÉES ci-dessus avec citations [S1], [S2]… ; n'invente aucune référence.
4. N'ajoute NI bloc de signature, NI mention « projet ».
5. Renvoie le CONTRAT COMPLET mis à jour (pas seulement la clause modifiée), puis une section « ## Sources ».`

    const text = await callClaude(
      "Tu es un juriste expert en droit mauricien qui révise des contrats. Tu renvoies toujours le contrat complet mis à jour, ancré sur les sources fournies.",
      prompt,
      8000,
    )

    return NextResponse.json({ text, sources })
  } catch (e) {
    console.error('[generate-contract/refine]', e)
    return NextResponse.json({ error: e instanceof Error ? (e as Error).message : 'Erreur' }, { status: 500 })
  }
}
