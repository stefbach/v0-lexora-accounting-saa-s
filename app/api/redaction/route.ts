import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'
import { retrieveRag } from '@/lib/juridique/rag/store'
import { formatContextePrompt, formatCitations, type CitationSource } from '@/lib/juridique/rag/retriever'
import type { DomaineJuridique } from '@/lib/juridique/referentielMauricien'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface Body {
  mode: 'email' | 'courrier'
  brief?: string
  ton?: string
  langue?: string
  longueur?: string
  objet?: string
  domaine?: string
  expediteur?: { nom?: string; contact?: string }
  destinataire?: { nom?: string }
}

/** Domaines RAG du SaaS mobilisés selon la compétence choisie. */
const DOMAINE_RAG: Record<string, DomaineJuridique[] | undefined> = {
  juridique: ['societes', 'commercial', 'civil', 'procedure'],
  rh: ['travail'],
  fiscal: ['fiscal'],
  recouvrement: ['commercial', 'civil', 'procedure'],
  commercial: ['commercial', 'civil'],
  general: undefined,
}

const LANG: Record<string, string> = {
  fr: 'en français', en: 'in formal English', fr_en: 'en français puis en anglais (bilingue)',
}

export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const b = await request.json().catch(() => null) as Body | null
    if (!b?.brief?.trim()) return NextResponse.json({ error: 'Décrivez votre demande (champ vide).' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

    const mode = b.mode === 'courrier' ? 'courrier' : 'email'
    const domaine = b.domaine || 'general'

    // RAG : mobilise le corpus du SaaS si une compétence technique est choisie.
    let sources: CitationSource[] = []
    let rag = ''
    const domaines = DOMAINE_RAG[domaine]
    if (domaines) {
      try {
        const passages = await retrieveRag(`${b.objet || ''} ${b.brief}`, { domaines, k: 5 })
        if (passages.length) { rag = `\n\n${formatContextePrompt(passages)}\n`; sources = formatCitations(passages) }
      } catch { /* RAG optionnel */ }
    }

    const formatInstr = mode === 'email'
      ? `Format EMAIL prêt à copier-coller : commence par une ligne « Objet : … », puis le corps (salutation, message structuré, formule de politesse, signature). N'ajoute ni adresses ni en-tête postal.`
      : `Format COURRIER (lettre) : rédige UNIQUEMENT le corps de la lettre (de la salutation « Madame, Monsieur, » jusqu'à la formule de politesse incluse). N'ajoute PAS l'en-tête expéditeur/destinataire ni le bloc de signature ni la date (ajoutés automatiquement à la mise en page).`

    const ragNote = sources.length
      ? `\nLorsque tu avances un point technique (juridique, fiscal, RH…), appuie-toi sur les SOURCES VERROUILLÉES ci-dessus et indique discrètement la référence entre parenthèses (ex. (WRA 2019 s.38)). N'invente aucune référence.`
      : ''

    const prompt = `Tu es un assistant de rédaction professionnel pour une entreprise à Maurice. Tu transformes des notes « en vrac » en écrit professionnel impeccable.
${rag}
Rédige un ${mode} professionnel ${LANG[b.langue || 'fr'] || LANG.fr}, à partir de ces éléments fournis en vrac :
"""
${b.brief.trim()}
"""

Paramètres :
- Ton : ${b.ton || 'professionnel et courtois'}
- Longueur : ${b.longueur || 'moyenne'} (court = 4-6 lignes, moyen = 2-3 paragraphes, détaillé = complet)
${b.objet ? `- Objet imposé : ${b.objet}` : ''}
${b.expediteur?.nom ? `- Expéditeur : ${b.expediteur.nom}${b.expediteur.contact ? ` (${b.expediteur.contact})` : ''}` : ''}
${b.destinataire?.nom ? `- Destinataire : ${b.destinataire.nom}` : ''}

Consignes :
1. ${formatInstr}
2. Style clair, direct, sans fautes, sans formules creuses ni emojis. Adapte le registre au ton demandé. Tu peux mettre en gras les éléments importants (montants, dates, références) en les entourant de **double astérisque** ; ils seront convertis en vrai gras (n'en abuse pas).
3. Utilise [À COMPLETER] pour toute information manquante essentielle (montant, date, nom).${ragNote}
4. Ne renvoie QUE le texte final, sans commentaire ni explication.`

    const text = await callClaude(
      "Tu es un assistant de rédaction professionnel (emails et courriers d'entreprise) précis, élégant et concis.",
      prompt,
      3000,
    )

    return NextResponse.json({ text: text.trim(), sources })
  } catch (e) {
    console.error('[redaction]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
