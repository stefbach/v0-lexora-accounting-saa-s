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
import { retrieve, formatContextePrompt, formatCitations, type CitationSource } from './rag/retriever'

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

## LIMITES (à rappeler si pertinent)
- Tu produis un PROJET de travail, pas un avis juridique définitif : la validation par un avocat/attorney inscrit est requise avant toute action.
- Tu ne représentes pas le client devant les tribunaux.
- Marque toute citation dont tu n'es pas certain par « [à vérifier] ».
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
  | 'mise_en_demeure'
  | 'sommation'
  | 'statement_of_claim'
  | 'plaint_with_summons'
  | 'affidavit'
  | 'lettre_avocat'
  | 'protocole_accord'

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
export async function qualifierLitige(faits: FaitsLitige): Promise<QualificationLitige> {
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

  const passages = retrieve(faits.description, { k: 5 })
  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: `${systemPrompt()}\n\n${formatContextePrompt(passages)}`,
    messages: [{ role: 'user', content: prompt }],
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
export async function evaluerDossier(faits: FaitsLitige): Promise<EvaluationDossier> {
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

  const passages = retrieve(faits.description, { k: 6 })
  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system: `${systemPrompt()}\n\n${formatContextePrompt(passages)}`,
    messages: [{ role: 'user', content: prompt }],
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
  affidavit: 'Affidavit',
  lettre_avocat: 'Lettre officielle',
  protocole_accord: 'Protocole d’accord transactionnel',
}

export async function genererActe(params: ParametresActe): Promise<{ titre: string; corps: string }> {
  const prompt = `Rédige un(e) « ${LABEL_ACTE[params.type_acte]} » complet et professionnel, conforme à la pratique mauricienne.

ÉMETTEUR (notre client) : ${params.societe.nom}${params.societe.brn ? ` (BRN ${params.societe.brn})` : ''}${params.societe.adresse ? `, ${params.societe.adresse}` : ''}
DESTINATAIRE : ${params.partie_adverse.nom}${params.partie_adverse.adresse ? `, ${params.partie_adverse.adresse}` : ''}
OBJET : ${params.objet}
${params.montant ? `MONTANT RÉCLAMÉ : ${params.montant} ${params.devise || 'MUR'}` : ''}
${params.delai_jours ? `DÉLAI ACCORDÉ : ${params.delai_jours} jours` : ''}
FAITS : ${params.faits}
${params.fondement_legal?.length ? `FONDEMENT : ${params.fondement_legal.join(', ')}` : ''}

Exigences :
- Ton ferme, courtois et juridiquement rigoureux.
- Structure claire : exposé des faits, fondement légal (citer les références mauriciennes), demande/injonction, délai, conséquences à défaut.
- Mentions obligatoires et formule de réserve de droits.
- N'invente PAS de jurisprudence ; marque « [à vérifier] » toute référence incertaine.
- Renvoie UNIQUEMENT le corps de l'acte en texte (sans en-tête de cabinet ni signature graphique — ils seront ajoutés au PDF). Pas de Markdown, du texte de courrier formel.`

  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system: systemPrompt(),
    messages: [{ role: 'user', content: prompt }],
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
  documents?: Array<{ name: string; media_type: string; data: string }>
}): Promise<{ texte: string; sources: CitationSource[] }> {
  // RAG : récupère les passages verrouillés pertinents et les injecte dans le system prompt.
  const passages = retrieve(`${params.question} ${params.contexte || ''}`, { domaines: params.domaines, k: 6 })
  const docsNote = params.documents?.length
    ? `\n\n## DOCUMENTS JOINTS\n${params.documents.length} document(s) sont joints à analyser. Analyse-les avec rigueur : identifie la nature, les parties, dates, montants, obligations et risques ; relie tes constats au droit mauricien (référentiel + sources RAG) ; signale toute clause problématique ou pièce manquante.`
    : ''
  const system = `${systemPrompt(params.domaines)}\n\n${formatContextePrompt(passages)}${docsNote}`

  const messages: Anthropic.MessageParam[] = []
  if (params.historique?.length) {
    messages.push(...params.historique.slice(-10).map((m) => ({ role: m.role, content: m.content })))
  }
  const qText = params.contexte ? `[Contexte : ${params.contexte}]\n\n${params.question}` : params.question

  if (params.documents?.length) {
    // Dernier message = blocs de contenu (texte + documents/images natifs).
    const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: qText }]
    for (const d of params.documents) {
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
    messages.push({ role: 'user', content: blocks })
  } else {
    messages.push({ role: 'user', content: qText })
  }

  const resp = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system,
    messages,
  })

  return { texte: extractText(resp), sources: formatCitations(passages) }
}
