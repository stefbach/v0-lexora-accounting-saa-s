import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'
import { retrieveRag } from '@/lib/juridique/rag/store'
import { formatContextePrompt, formatCitations, type CitationSource } from '@/lib/juridique/rag/retriever'
import type { DomaineJuridique } from '@/lib/juridique/referentielMauricien'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/juridique/societe/refine
 * Affine un acte de société déjà généré (PV, résolution, statuts, courrier…)
 * selon une instruction en langage naturel, en restant ancré sur le RAG.
 * Body: { current_text, instruction, domaines? }
 */
export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => null) as { current_text?: string; instruction?: string; domaines?: DomaineJuridique[] } | null
    if (!body?.current_text || !body?.instruction?.trim()) return NextResponse.json({ error: 'current_text et instruction requis' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

    let sources: CitationSource[] = []
    let rag = ''
    try {
      const passages = await retrieveRag(`${body.instruction} droit des sociétés mauricien Companies Act 2001`, { domaines: body.domaines ?? ['societes', 'commercial'], k: 5 })
      rag = formatContextePrompt(passages)
      sources = formatCitations(passages)
    } catch {
      rag = '## SOURCES VERROUILLÉES (RAG)\nCorpus momentanément indisponible : reste sur des dispositions sûres du Companies Act 2001 et signale les points à vérifier.'
    }

    const prompt = `${rag}

Voici un ACTE de société existant (projet) :

<<<ACTE
${body.current_text}
ACTE>>>

DEMANDE DE MODIFICATION (langage naturel) :
"${body.instruction.trim()}"

INSTRUCTIONS :
1. Applique fidèlement la demande (ajout, retrait, reformulation de clause/résolution/paragraphe) en conservant la structure, le style et la mise en forme de l'acte.
2. Toute référence légale doit s'appuyer sur les SOURCES VERROUILLÉES ci-dessus avec citations [S1], [S2]… ; n'invente aucune référence.
3. N'ajoute NI bloc de signature, NI mention « projet » (ajoutés automatiquement au document).
4. Renvoie l'ACTE COMPLET mis à jour (pas seulement le passage modifié), puis une section « ## Sources ».`

    const text = await callClaude(
      "Tu es un secrétaire juridique mauricien qui révise des actes de société (PV, résolutions, statuts, courriers). Tu renvoies toujours l'acte complet mis à jour, ancré sur les sources fournies.",
      prompt,
      6000,
    )

    return NextResponse.json({ text, sources })
  } catch (e) {
    console.error('[juridique/societe/refine]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
