/**
 * expertContentieux.ts — Avocat-conseil & expert en contentieux mauricien (IA)
 * Lexora · Département Juridique
 *
 * Couvre TOUS les contentieux usuels à Maurice : recouvrement de créances,
 * droit du travail (Industrial Court), commercial/contractuel, litiges entre
 * associés (CA 2001), fiscal (MRA/ARC), immobilier, responsabilité civile,
 * arbitrage (MARC). Ancré sur le référentiel mauricien.
 *
 * SERVEUR UNIQUEMENT (importe le SDK Anthropic). Ne pas importer côté client.
 *
 * ⚠️ Tout output est un PROJET destiné à la relecture d'un homme de loi
 * (avocat / attorney / law practitioner). Lexora n'exerce pas l'activité
 * réglementée d'avocat (cf. CGU). Les citations doivent être vérifiées.
 */

import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL } from '@/lib/claude'
import {
  construireDigestReferentiel,
  juridictionPourMontant,
  TYPES_CONTENTIEUX,
  type DomaineJuridique,
} from './referentielMauricien'
import { formatContextePrompt, formatCitations, type CitationSource } from './rag/retriever'
import { retrieveRag } from './rag/store'

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// ============================================================
// SYSTEM PROMPT — Avocat-conseil contentieux
// ============================================================
function systemPrompt(domaines?: DomaineJuridique[]): string {
  return `Tu es un avocat-conseil sénior du barreau mauricien, spécialiste du contentieux, avec 25 ans de pratique devant les juridictions de la République de Maurice. Tu raisonnes comme un cabinet d'avocats d'élite.

${construireDigestReferentiel(domaines)}

## MÉTHODE DE TRAVAIL
1. Qualifie juridiquement les faits avant toute conclusion (nature de l'action, fondement légal).
2. Identifie la juridiction compétente et le délai de prescription applicable.
3. Distingue toujours : FONDEMENT LÉGAL · STRATÉGIE · RISQUES · PROCHAINES ÉTAPES.
4. Cite les références précises : (CA 2001 s.178), (Code Civil art.1382), (WRA 2019 s.69)...
5. Évalue honnêtement les chances de succès (faibles / modérées / sérieuses / fortes) avec justification.
6. Signale les délais procéduraux critiques (🔴 urgence) et les actes conservatoires utiles.

## SYSTÈME JURIDIQUE MIXTE
Maurice combine droit civil (Code Civil, Code de Commerce, Code de Procédure Civile) et common law (procédure, preuve, sociétés, travail). Appel final : Privy Council. Tiens-en compte dans le raisonnement.

## RÈGLES DE RÉDACTION
- Langue : français (sauf si la question est posée en anglais). Les actes de procédure peuvent comporter des clauses en anglais (standard MU).
- Niveaux d'alerte : 🔴 CRITIQUE (délai/forclusion, illégalité) · 🟡 ATTENTION (risque) · 🟢 OK.
- Calculs monétaires : présente les montants avec précision (créance, intérêts, dépens) ; n'arrondis jamais à la légère.

## OBLIGATION DE SOURCES — VERROUILLAGE (niveau cabinet d'audit / Big Four)
C'est la règle la plus importante. Tu raisonnes comme un cabinet de haut vol (type KPMG/Deloitte) : RIEN n'est affirmé sans source.
1. Chaque affirmation juridique DOIT être suivie d'une citation de source du corpus fourni, sous la forme [S1], [S2]… (référençant les SOURCES VERROUILLÉES ci-dessous).
2. Termine TOUJOURS par une section « ## Sources » listant les références utilisées (loi + section/article).
3. Si une affirmation n'est couverte par AUCUNE source du corpus, tu DOIS la marquer « [hors corpus — à vérifier] » et la présenter comme une hypothèse, jamais comme une certitude.
4. N'invente JAMAIS de numéro d'article, de jurisprudence ou de citation. En cas de doute sur une référence : « [à vérifier] ».
5. Si le corpus ne permet pas de répondre, dis-le explicitement plutôt que de combler par des connaissances générales non sourcées.

## LIMITES (à rappeler si pertinent)
- Tu produis un PROJET de travail, pas un avis juridique définitif : la validation par un avocat/attorney inscrit est requise avant toute action.
- Tu ne représentes pas le client devant les tribunaux.
- Signale si la question dépasse le droit mauricien.`
}

function extractText(resp: Anthropic.Message): string {
  const block = resp.content[0]
  return block && block.type === 'text' ? block.text : ''
}

function extractJSON<T>(text: string, fallback: T): T {
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0]) as T
  } catch {
    /* noop */
  }
  return fallback
}

/** Document à analyser, téléchargé depuis le storage (base64). */
export interface DocAnalyse {
  name: string
  media_type: string
  data: string
}

/**
 * Construit le contenu d'un message utilisateur : texte seul, ou texte + blocs
 * document/image natifs (PDF, images) quand des pièces sont jointes.
 */
function userContent(text: string, documents?: DocAnalyse[]): string | Anthropic.ContentBlockParam[] {
  if (!documents?.length) return text
  const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text }]
  for (const d of documents) {
    if (d.media_type === 'application/pdf') {
      blocks.push({
        type: 'document',
        title: d.name,
        source: { type: 'base64', media_type: 'application/pdf', data: d.data },
      } as Anthropic.ContentBlockParam)
    } else if (d.media_type.startsWith('image/')) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: d.media_type as 'image/png', data: d.data },
      } as Anthropic.ContentBlockParam)
    }
  }
  return blocks
}

function docsNote(documents?: DocAnalyse[]): string {
  return documents?.length
    ? `\n\n## DOCUMENTS JOINTS\n${documents.length} document(s) sont joints. Analyse-les avec rigueur (nature, parties, dates, montants, obligations, clauses à risque) et fonde tes constats dessus + le droit mauricien.`
    : ''
}

// ============================================================
// TYPES
// ============================================================
export interface FaitsLitige {
  type_contentieux?: string // id de TYPES_CONTENTIEUX (optionnel — sinon qualification auto)
  description: string
  partie_adverse?: string
  montant_en_jeu?: number
  devise?: string
  date_faits?: string
  documents_disponibles?: string[]
  notre_role?: 'demandeur' | 'defendeur'
}

export interface QualificationLitige {
  type_contentieux: string
  fondement_legal: string[]
  juridiction_competente: string
  prescription: string
  urgence: 'faible' | 'moyenne' | 'haute' | 'critique'
  resume: string
  pieces_a_reunir: string[]
}

export interface EvaluationDossier {
  chances_succes: 'faibles' | 'moderees' | 'serieuses' | 'fortes'
  analyse: string
  arguments_pour: string[]
  arguments_adverses: string[]
  strategie_recommandee: string
  etapes_procedure: Array<{ etape: string; delai: string; juridiction?: string }>
  estimation_couts: string
  risques: string[]
  base_legale: string[]
}

export type TypeActe =
  // — Demande / attaque —
  | 'mise_en_demeure'
  | 'sommation'
  | 'statement_of_claim'
  | 'plaint_with_summons'
  | 'lettre_avocat'
  // — Défense / réponse —
  | 'reponse_mise_en_demeure'
  | 'courrier_defense'
  | 'conclusions_defense'
  | 'contestation_creance'
  // — Amiable / divers —
  | 'lettre_negociation'
  | 'protocole_accord'
  | 'affidavit'

export interface ParametresActe {
  type_acte: TypeActe
  societe: { nom: string; brn?: string; adresse?: string }
  partie_adverse: { nom: string; adresse?: string }
  objet: string
  montant?: number
  devise?: string
  faits: string
  delai_jours?: number
  fondement_legal?: string[]
}

// ============================================================
// 1. QUALIFICATION DU LITIGE
// ============================================================
export async function qualifierLitige(faits: FaitsLitige, documents?: DocAnalyse[]): Promise<QualificationLitige> {
  const jurSuggestion = faits.montant_en_jeu
    ? juridictionPourMontant(faits.montant_en_jeu).nom
    : null

  const prompt = `Qualifie juridiquement ce litige (droit mauricien) et réponds en JSON strict.

FAITS : ${faits.description}
${faits.partie_adverse ? `Partie adverse : ${faits.partie_adverse}` : ''}
${faits.montant_en_jeu ? `Montant en jeu : ${faits.montant_en_jeu} ${faits.devise || 'MUR'}` : ''}
${faits.date_faits ? `Date des faits : ${faits.date_faits}` : ''}
${faits.notre_role ? `Notre rôle : ${faits.notre_role}` : ''}
${jurSuggestion ? `(Indice juridiction selon montant : ${jurSuggestion})` : ''}

Types de contentieux disponibles : ${TYPES_CONTENTIEUX.map((t) => `${t.id} (${t.label})`).join(', ')}

JSON attendu :
{
  "type_contentieux": "<id parmi la liste>",
  "fondement_legal": ["<loi + section>"],
  "juridiction_competente": "<juridiction>",
  "prescription": "<délai + base>",
  "urgence": "<faible|moyenne|haute|critique>",
  "resume": "<2-3 phrases de qualification>",
  "pieces_a_reunir": ["<pièce>"]
}
Réponds UNIQUEMENT le JSON.`

  const passages = await retrieveRag(faits.description, { k: 5 })
  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: `${systemPrompt()}\n\n${formatContextePrompt(passages)}${docsNote(documents)}`,
    messages: [{ role: 'user', content: userContent(prompt, documents) }],
  })

  return extractJSON<QualificationLitige>(extractText(resp), {
    type_contentieux: faits.type_contentieux || 'commercial',
    fondement_legal: ['Code Civil', 'Code de Commerce'],
    juridiction_competente: jurSuggestion || 'Intermediate Court',
    prescription: '5 ans (à vérifier)',
    urgence: 'moyenne',
    resume: 'Qualification manuelle requise — relecture avocat recommandée.',
    pieces_a_reunir: ['Contrat / preuve de la créance', 'Correspondances', 'Factures'],
  })
}

// ============================================================
// 2. ÉVALUATION STRATÉGIQUE DU DOSSIER
// ============================================================
export async function evaluerDossier(faits: FaitsLitige, documents?: DocAnalyse[]): Promise<EvaluationDossier> {
  const prompt = `Évalue ce dossier de contentieux mauricien comme un avocat préparant sa stratégie. Réponds en JSON strict.

FAITS : ${faits.description}
${faits.partie_adverse ? `Partie adverse : ${faits.partie_adverse}` : ''}
${faits.montant_en_jeu ? `Montant : ${faits.montant_en_jeu} ${faits.devise || 'MUR'}` : ''}
${faits.notre_role ? `Notre rôle : ${faits.notre_role}` : ''}
${faits.documents_disponibles?.length ? `Pièces disponibles : ${faits.documents_disponibles.join(', ')}` : ''}

JSON attendu :
{
  "chances_succes": "<faibles|moderees|serieuses|fortes>",
  "analyse": "<analyse juridique synthétique>",
  "arguments_pour": ["<argument>"],
  "arguments_adverses": ["<contre-argument probable>"],
  "strategie_recommandee": "<recommandation : amiable/judiciaire, ordre des étapes>",
  "etapes_procedure": [{ "etape": "<...>", "delai": "<...>", "juridiction": "<...>" }],
  "estimation_couts": "<fourchette indicative + dépens>",
  "risques": ["<risque>"],
  "base_legale": ["<loi + section>"]
}
Réponds UNIQUEMENT le JSON.`

  const passages = await retrieveRag(faits.description, { k: 6 })
  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system: `${systemPrompt()}\n\n${formatContextePrompt(passages)}${docsNote(documents)}`,
    messages: [{ role: 'user', content: userContent(prompt, documents) }],
  })

  return extractJSON<EvaluationDossier>(extractText(resp), {
    chances_succes: 'moderees',
    analyse: 'Analyse détaillée requise — relecture avocat recommandée.',
    arguments_pour: [],
    arguments_adverses: [],
    strategie_recommandee: 'Tenter une résolution amiable (mise en demeure) avant toute action judiciaire.',
    etapes_procedure: [
      { etape: 'Mise en demeure', delai: 'Immédiat', juridiction: '—' },
      { etape: 'Action judiciaire si échec', delai: 'Selon prescription' },
    ],
    estimation_couts: 'À chiffrer avec un avocat.',
    risques: ['Prescription', 'Solvabilité de la partie adverse'],
    base_legale: ['Code Civil', 'Code de Commerce'],
  })
}

// ============================================================
// 3. GÉNÉRATION D'ACTE (texte structuré, alimente le PDF)
// ============================================================
const LABEL_ACTE: Record<TypeActe, string> = {
  mise_en_demeure: 'Mise en demeure',
  sommation: 'Sommation de payer',
  statement_of_claim: 'Statement of Claim',
  plaint_with_summons: 'Plaint with Summons',
  lettre_avocat: 'Lettre officielle',
  reponse_mise_en_demeure: 'Réponse à mise en demeure',
  courrier_defense: 'Courrier en défense',
  conclusions_defense: 'Conclusions en défense',
  contestation_creance: 'Contestation de créance',
  lettre_negociation: 'Lettre de négociation amiable',
  protocole_accord: 'Protocole d’accord transactionnel',
  affidavit: 'Affidavit',
}

/** Posture de l'acte → oriente la rédaction (demande vs défense vs amiable). */
const POSTURE_ACTE: Record<TypeActe, string> = {
  mise_en_demeure: 'demande : sommer la partie adverse d’exécuter, fixer un délai et annoncer les suites.',
  sommation: 'demande : sommation formelle de payer/faire, préalable à l’action.',
  statement_of_claim: 'demande : exposé des prétentions devant la juridiction.',
  plaint_with_summons: 'demande : acte introductif d’instance.',
  lettre_avocat: 'neutre : courrier officiel ferme et argumenté.',
  reponse_mise_en_demeure: 'DÉFENSE : répondre à une mise en demeure reçue — contester le bien-fondé, opposer les moyens de fait et de droit, refuser ou proposer.',
  courrier_defense: 'DÉFENSE : faire valoir la position de notre client face à une réclamation, réfuter les griefs point par point.',
  conclusions_defense: 'DÉFENSE : conclusions/mémoire en défense structuré (faits, moyens de droit, prétentions, demande de rejet).',
  contestation_creance: 'DÉFENSE : contester une créance réclamée (prescription, absence de preuve, exécution, compensation).',
  lettre_negociation: 'amiable : proposer un règlement transactionnel sans reconnaissance de responsabilité.',
  protocole_accord: 'amiable : formaliser un accord transactionnel équilibré et exécutoire.',
  affidavit: 'preuve : déclaration sous serment factuelle et précise.',
}

export async function genererActe(
  params: ParametresActe,
  documents?: DocAnalyse[],
): Promise<{ titre: string; corps: string }> {
  // RAG : ancrer l'acte sur les sources mauriciennes pertinentes.
  const passages = await retrieveRag(`${params.objet} ${params.faits} ${LABEL_ACTE[params.type_acte]}`, { k: 6 })

  const prompt = `Rédige un(e) « ${LABEL_ACTE[params.type_acte]} » complet et professionnel, conforme à la pratique mauricienne.
POSTURE : ${POSTURE_ACTE[params.type_acte]}

ÉMETTEUR (notre client) : ${params.societe.nom}${params.societe.brn ? ` (BRN ${params.societe.brn})` : ''}${params.societe.adresse ? `, ${params.societe.adresse}` : ''}
DESTINATAIRE : ${params.partie_adverse.nom}${params.partie_adverse.adresse ? `, ${params.partie_adverse.adresse}` : ''}
OBJET : ${params.objet}
${params.montant ? `MONTANT EN JEU : ${params.montant} ${params.devise || 'MUR'}` : ''}
${params.delai_jours ? `DÉLAI : ${params.delai_jours} jours` : ''}
FAITS / CONTEXTE : ${params.faits}
${params.fondement_legal?.length ? `FONDEMENT : ${params.fondement_legal.join(', ')}` : ''}
${documents?.length ? `\nDes documents sont joints (ex. réclamation adverse, contrat, mise en demeure reçue) : appuie-toi dessus pour rédiger, cite-les et réfute/exploite leur contenu.` : ''}

Exigences :
- Ton adapté à la posture (ferme en demande ; argumenté et réfutateur en défense ; constructif en amiable).
- Structure claire : exposé des faits, moyens de droit (citer les références mauriciennes des SOURCES ci-dessous), demande/position, délai s'il y a lieu, réserve de droits.
- N'invente PAS de jurisprudence ; marque « [à vérifier] » toute référence incertaine.
- Renvoie UNIQUEMENT le corps de l'acte en texte de courrier formel (sans en-tête de cabinet ni signature graphique — ajoutés au PDF). Pas de Markdown.`

  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3500,
    system: `${systemPrompt()}\n\n${formatContextePrompt(passages)}${docsNote(documents)}`,
    messages: [{ role: 'user', content: userContent(prompt, documents) }],
  })

  return { titre: LABEL_ACTE[params.type_acte], corps: extractText(resp).trim() }
}

// ============================================================
// 4. CONSEIL JURIDIQUE / RECHERCHE (chat)
// ============================================================
export async function questionContentieux(params: {
  question: string
  contexte?: string
  domaines?: DomaineJuridique[]
  historique?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Documents à analyser (PDF ou image), téléchargés depuis le storage. */
  documents?: DocAnalyse[]
}): Promise<{ texte: string; sources: CitationSource[] }> {
  // RAG : récupère les passages verrouillés pertinents et les injecte dans le system prompt.
  const passages = await retrieveRag(`${params.question} ${params.contexte || ''}`, { domaines: params.domaines, k: 6 })
  const system = `${systemPrompt(params.domaines)}\n\n${formatContextePrompt(passages)}${docsNote(params.documents)}`

  const messages: Anthropic.MessageParam[] = []
  if (params.historique?.length) {
    messages.push(...params.historique.slice(-10).map((m) => ({ role: m.role, content: m.content })))
  }
  const qText = params.contexte ? `[Contexte : ${params.contexte}]\n\n${params.question}` : params.question
  messages.push({ role: 'user', content: userContent(qText, params.documents) })

  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system,
    messages,
  })

  return { texte: extractText(resp), sources: formatCitations(passages) }
}
