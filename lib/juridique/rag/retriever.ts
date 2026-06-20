/**
 * retriever.ts — Moteur de récupération du RAG juridique (lexical/BM25-léger).
 * Lexora · Département Juridique
 *
 * Récupère, pour une requête, les passages les plus pertinents du corpus
 * verrouillé. Aucune dépendance externe (pas d'embeddings requis) → robuste,
 * déterministe, fonctionne sans migration ni provider tiers. La couche est
 * conçue pour être remplaçable par un backend vectoriel (pgvector) plus tard
 * sans changer l'interface `retrieve()`.
 *
 * Pur TS → importable côté client (browser de sources) comme serveur (prompts).
 */
import { CORPUS_JURIDIQUE, type PassageCorpus } from './corpus'
import type { DomaineJuridique } from '../referentielMauricien'

export interface PassagePertinent extends PassageCorpus {
  score: number
}

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'à', 'au', 'aux', 'en', 'dans',
  'pour', 'par', 'sur', 'que', 'qui', 'quoi', 'dont', 'est', 'sont', 'ce', 'cette', 'ces', 'son',
  'sa', 'ses', 'mon', 'ma', 'mes', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'se', 'ne',
  'pas', 'plus', 'avec', 'sans', 'mais', 'donc', 'si', 'comme', 'avoir', 'être', 'faire', 'the',
  'a', 'an', 'of', 'to', 'in', 'is', 'are', 'for', 'and', 'or', 'my', 'we',
])

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents (diacritiques combinants)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

// IDF pré-calculé sur le corpus (un seul passage par calcul de module).
const DOC_TOKENS: Array<{ p: PassageCorpus; tokens: Set<string> }> = CORPUS_JURIDIQUE.map((p) => ({
  p,
  tokens: new Set(tokenize(`${p.titre} ${p.texte} ${p.source} ${p.reference}`)),
}))

const IDF: Map<string, number> = (() => {
  const df = new Map<string, number>()
  for (const d of DOC_TOKENS) for (const tk of d.tokens) df.set(tk, (df.get(tk) || 0) + 1)
  const N = DOC_TOKENS.length
  const idf = new Map<string, number>()
  for (const [tk, f] of df) idf.set(tk, Math.log(1 + N / f))
  return idf
})()

/**
 * Récupère les passages les plus pertinents pour la requête.
 * @param query  question / faits
 * @param opts.domaines  filtre optionnel par domaines juridiques
 * @param opts.k  nombre de passages (défaut 5)
 * @param opts.minScore  seuil minimal (défaut 0.5)
 */
export function retrieve(
  query: string,
  opts: { domaines?: DomaineJuridique[]; k?: number; minScore?: number } = {},
): PassagePertinent[] {
  const { domaines, k = 5, minScore = 0.5 } = opts
  const qTokens = tokenize(query)
  if (qTokens.length === 0) return []
  const qSet = new Set(qTokens)

  const scored = DOC_TOKENS
    .filter((d) => !domaines || domaines.includes(d.p.domaine))
    .map((d) => {
      let score = 0
      for (const tk of qSet) if (d.tokens.has(tk)) score += IDF.get(tk) || 0.5
      // léger bonus si le code/source de loi est mentionné dans la requête
      if (qSet.has(d.p.source.toLowerCase().replace(/[^a-z0-9]/g, ''))) score += 1
      return { ...d.p, score }
    })
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  return scored
}

/**
 * Met en forme les passages récupérés pour injection dans un prompt système.
 * C'est le contexte « verrouillé » sur lequel l'IA doit fonder sa réponse.
 */
export function formatContextePrompt(passages: PassagePertinent[]): string {
  if (passages.length === 0) {
    return `## SOURCES VERROUILLÉES (RAG — corpus juridique mauricien)
AUCUN passage pertinent n'a été trouvé dans le corpus verrouillé. RÈGLE STRICTE : tu ne dois PAS émettre d'affirmation juridique au fond. Réponds uniquement que le corpus est insuffisant sur ce point, indique quelles informations ou pièces seraient nécessaires, et recommande l'escalade vers un avocat / attorney inscrit. N'utilise pas de connaissances générales non sourcées.`
  }
  const blocs = passages
    .map(
      (p, i) =>
        `[S${i + 1}] ${p.source} ${p.reference} — ${p.titre} (revu ${p.maj})\n${p.texte}`,
    )
    .join('\n\n')
  return `## SOURCES VERROUILLÉES (RAG — corpus juridique mauricien)
Fonde ta réponse EXCLUSIVEMENT sur ces passages. RÈGLE STRICTE : chaque affirmation juridique doit porter une citation [S1], [S2]… correspondant à ces sources, et tu dois terminer par une section « ## Sources » qui les liste. Tout point non couvert par ces sources doit être marqué « [hors corpus — à vérifier] » et présenté comme une hypothèse — jamais comme une certitude. N'invente aucune référence.

${blocs}`
}

/** Liste de citations structurée à renvoyer au client (affichage des sources). */
export interface CitationSource {
  ref: string // ex: 'S1'
  source: string
  reference: string
  titre: string
  url?: string
  maj: string
}

export function formatCitations(passages: PassagePertinent[]): CitationSource[] {
  return passages.map((p, i) => ({
    ref: `S${i + 1}`,
    source: p.source,
    reference: p.reference,
    titre: p.titre,
    url: p.url,
    maj: p.maj,
  }))
}
