/**
 * assistant.ts — Assistant IA Rédaction de Contrats
 * LEXORA — Module Contrats Clients
 *
 * Architecture :
 * - Claude guide la conversation naturellement (pose des questions, affine)
 * - Chaque échange enrichit les paramètres structurés du contrat
 * - Génération finale = document HTML professionnel complet
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

// ============================================================
// TYPES
// ============================================================

export interface MessageConversation {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface ParametresContrat {
  type_contrat?: string
  titre?: string
  nom_client?: string
  nom_societe_client?: string
  nom_cabinet?: string
  services?: string[]
  honoraires_mensuels?: number
  honoraires_annuels?: number
  modalites_paiement?: string
  date_debut?: string
  date_fin?: string
  duree_mois?: number
  periodicite_facturation?: string
  delai_paiement?: number
  clause_resiliation?: string
  clause_confidentialite?: boolean
  clause_propriete_intellectuelle?: boolean
  droit_applicable?: string
  juridiction?: string
  [key: string]: unknown
}

export interface AnalyseConversation {
  parametres_extraits: ParametresContrat
  informations_manquantes: string[]
  pret_a_generer: boolean
  prochaine_question?: string
}

// ============================================================
// SYSTEM PROMPT — Assistant Rédaction de Contrats
// ============================================================

const SYSTEM_PROMPT_ASSISTANT = `Tu es un assistant expert en rédaction de contrats professionnels pour Lexora, un cabinet comptable mauricien.

## Ton rôle
Tu aides les comptables et administrateurs à rédiger des contrats clients complets, professionnels et juridiquement solides, adaptés à la législation mauricienne.

## Types de contrats que tu maîtrises
- **Lettre de mission comptable** — Mission comptable, tenue de livres, établissement des états financiers
- **Convention d'honoraires** — Missions ponctuelles (audit, conseil, déclarations fiscales)
- **Contrat de prestation de service** — Missions techniques, consulting, IT, développement
- **NDA / Accord de confidentialité** — Protection des informations échangées
- **Mandat de représentation** — Représentation auprès de la MRA, ROC, FSC
- **Contrat de sous-traitance** — Relations entre cabinets comptables

## Contexte légal mauritien
- Droit des contrats : Contract Law (basé sur droit français)
- Honoraires comptables : pas de tarif réglementé mais référence ICAEW/ACCA
- TVA Maurice : 15% sur les services (si assujetti)
- Délais de paiement standard : 30 jours
- Résolution des litiges : tribunaux mauriciens, arbitrage possible
- Langues admises : anglais ou français (les deux)

## Mode de fonctionnement

### Phase 1 — Découverte naturelle
- Pose des questions conversationnelles, une ou deux à la fois maximum
- Adapte ton ton (formel mais accessible)
- Reformule ce que tu comprends pour confirmer
- Suggère des options quand pertinent ("préfères-tu un forfait mensuel ou à l'acte ?")

### Phase 2 — Confirmation des paramètres
- Une fois les infos clés collectées, résume les paramètres du contrat
- Demande validation avant de générer
- Propose des clauses additionnelles pertinentes ("veux-tu inclure une clause de renouvellement tacite ?")

### Phase 3 — Génération
- Génère un contrat HTML complet, professionnel et directement utilisable
- Utilise un style sobre, professionnel, en-tête avec logo placeholder
- Cite les bases légales mauriciennes si pertinent

## Règles de conversation
- NE pose JAMAIS plus de 2 questions à la fois
- Confirme ta compréhension avant de passer à la suite
- Si l'utilisateur donne des infos incomplètes, demande uniquement ce qui est essentiel
- Propose des valeurs par défaut raisonnables quand pertinent
- Reste naturel — pas de listes à points pour les questions, parle normalement
- Si l'utilisateur dit "génère" ou "c'est bon", génère immédiatement sans plus de questions

## Format des réponses
- Conversations : texte naturel, paragraphes courts
- Génération finale : HTML complet avec styles inline professionnels`

// ============================================================
// SYSTEM PROMPT — Extraction de paramètres structurés
// ============================================================

const SYSTEM_PROMPT_EXTRACTION = `Tu es un extracteur de données structurées pour des contrats professionnels.
Analyse la conversation et extrait les paramètres du contrat.
Réponds UNIQUEMENT avec un JSON valide, sans commentaire ni markdown.`

// ============================================================
// SYSTEM PROMPT — Génération du contrat final
// ============================================================

const SYSTEM_PROMPT_GENERATION = `Tu es un expert en rédaction de contrats professionnels mauriciens.
Génère un contrat HTML complet et professionnel basé sur les paramètres fournis.

## Format HTML requis
- Structure complète : en-tête, corps, signatures, date
- Styles inline professionnels (pas de classes CSS externes)
- Palette : blanc/gris clair, texte #1a1a1a, accent #1e40af
- Police : Arial/sans-serif
- Marges adaptées pour impression A4
- Numérotation des articles
- Espaces signatures bien formatés

## Structure obligatoire
1. En-tête (logo placeholder, titre, référence, date)
2. ENTRE LES PARTIES (coordonnées complètes)
3. Articles numérotés (objet, services, honoraires, durée, résiliation, confidentialité, droit applicable)
4. Signatures (deux colonnes : client | cabinet)
5. Mentions légales si applicable (TVA, numéro cabient, etc.)

## Langue
- Français par défaut sauf si précisé autrement
- Terminologie juridique précise mais compréhensible
- Clauses complètes et sans ambiguïté`

// ============================================================
// FONCTION: Continuer la conversation
// ============================================================

export async function continuerConversation(params: {
  historique: MessageConversation[]
  nouveau_message: string
  contexte_client?: {
    nom_client?: string
    nom_societe?: string
    email?: string
    nom_cabinet?: string
  }
}): Promise<string> {
  const messages = [
    ...params.historique.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: params.contexte_client
        ? `[Contexte disponible: Client="${params.contexte_client.nom_client || ''}", Société="${params.contexte_client.nom_societe || ''}", Cabinet="${params.contexte_client.nom_cabinet || 'Lexora'}"]
        
${params.nouveau_message}`
        : params.nouveau_message,
    },
  ]

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT_ASSISTANT,
    messages,
  })

  return (response.content[0] as { type: string; text: string }).text
}

// ============================================================
// FONCTION: Stream de la conversation (pour UX temps réel)
// ============================================================

export async function* streamConversation(params: {
  historique: MessageConversation[]
  nouveau_message: string
  contexte_client?: {
    nom_client?: string
    nom_societe?: string
    email?: string
    nom_cabinet?: string
  }
}): AsyncGenerator<string> {
  const messages = [
    ...params.historique.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: params.contexte_client
        ? `[Contexte: Client="${params.contexte_client.nom_client || ''}", Société="${params.contexte_client.nom_societe || ''}", Cabinet="${params.contexte_client.nom_cabinet || 'Lexora'}"]

${params.nouveau_message}`
        : params.nouveau_message,
    },
  ]

  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT_ASSISTANT,
    messages,
  })

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text
    }
  }
}

// ============================================================
// FONCTION: Extraire les paramètres structurés depuis la conversation
// ============================================================

export async function extraireParametres(
  historique: MessageConversation[]
): Promise<AnalyseConversation> {
  const conversationTexte = historique
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const prompt = `Analyse cette conversation de rédaction de contrat et extrait les paramètres.

CONVERSATION:
${conversationTexte}

Réponds avec ce JSON exact:
{
  "parametres_extraits": {
    "type_contrat": "<lettre_mission|convention_honoraires|prestation_service|nda|mandat|autre>",
    "titre": "<titre du contrat>",
    "nom_client": "<prénom nom>",
    "nom_societe_client": "<nom société cliente>",
    "nom_cabinet": "<nom cabinet comptable>",
    "services": ["<service 1>", "<service 2>"],
    "honoraires_mensuels": <nombre ou null>,
    "honoraires_annuels": <nombre ou null>,
    "montant_total": <nombre ou null>,
    "modalites_paiement": "<description>",
    "date_debut": "<YYYY-MM-DD ou null>",
    "date_fin": "<YYYY-MM-DD ou null>",
    "duree_mois": <nombre ou null>,
    "periodicite_facturation": "<mensuel|trimestriel|annuel|ponctuel>",
    "delai_paiement": <jours ou null>,
    "devise": "MUR",
    "tva_applicable": <true|false>,
    "clause_resiliation": "<description ou null>",
    "clause_confidentialite": <true|false>,
    "droit_applicable": "Droit mauricien",
    "notes_specifiques": "<autres clauses mentionnées>"
  },
  "informations_manquantes": ["<info manquante 1>", "<info manquante 2>"],
  "pret_a_generer": <true si les infos essentielles sont là, false sinon>,
  "prochaine_question": "<null si pret_a_generer, sinon la prochaine question à poser>"
}`

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (response.content[0] as { type: string; text: string }).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AnalyseConversation
    }
  } catch {
    // Fallback
  }

  return {
    parametres_extraits: {},
    informations_manquantes: ['Informations insuffisantes'],
    pret_a_generer: false,
    prochaine_question: 'Pouvez-vous préciser le type de contrat souhaité ?',
  }
}

// ============================================================
// FONCTION: Générer le contrat final (HTML complet)
// ============================================================

export async function genererContrat(params: {
  parametres: ParametresContrat
  historique: MessageConversation[]
  instructions_specifiques?: string
}): Promise<string> {
  const conversationResume = params.historique
    .slice(-6) // Derniers échanges seulement
    .map(m => `${m.role === 'user' ? 'Client' : 'IA'}: ${m.content}`)
    .join('\n')

  const prompt = `Génère un contrat HTML complet et professionnel.

## PARAMÈTRES DU CONTRAT
${JSON.stringify(params.parametres, null, 2)}

## CONTEXTE DE LA CONVERSATION (pour les nuances)
${conversationResume}

${params.instructions_specifiques ? `## INSTRUCTIONS SPÉCIFIQUES\n${params.instructions_specifiques}` : ''}

## CONSIGNES
- Document HTML autonome avec styles inline
- Professionnel et complet, prêt à imprimer/signer
- Référence auto si non fournie : CTR-${new Date().getFullYear()}-XXXX
- Date : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
- Inclure TOUTES les clauses standard même si non mentionnées explicitement
- Numérotation : Article 1, Article 2, etc.

Génère le HTML complet maintenant.`

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT_GENERATION,
    messages: [{ role: 'user', content: prompt }],
  })

  return (response.content[0] as { type: string; text: string }).text
}

// ============================================================
// FONCTION: Modifier une section du contrat
// ============================================================

export async function modifierContrat(params: {
  contenu_actuel: string
  instruction_modification: string
  parametres: ParametresContrat
}): Promise<string> {
  const prompt = `Modifie ce contrat HTML selon l'instruction donnée.

## CONTRAT ACTUEL
${params.contenu_actuel}

## INSTRUCTION DE MODIFICATION
${params.instruction_modification}

## PARAMÈTRES DE BASE
${JSON.stringify(params.parametres, null, 2)}

Retourne le contrat HTML complet modifié. Garde la même structure et les mêmes styles.`

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT_GENERATION,
    messages: [{ role: 'user', content: prompt }],
  })

  return (response.content[0] as { type: string; text: string }).text
}

// ============================================================
// FONCTION: Message d'accueil initial
// ============================================================

export function messageAccueil(contexte?: {
  nom_client?: string
  nom_societe?: string
  type_contrat?: string
}): string {
  if (contexte?.type_contrat && contexte?.nom_client) {
    return `Bonjour ! Je vais vous aider à rédiger ${getLibelleContrat(contexte.type_contrat)} pour ${contexte.nom_client}${contexte.nom_societe ? ` (${contexte.nom_societe})` : ''}.

Pour commencer, pouvez-vous me décrire les services inclus dans cette mission et les honoraires envisagés ?`
  }

  if (contexte?.nom_client) {
    return `Bonjour ! Je vais vous aider à rédiger un contrat pour ${contexte.nom_client}${contexte.nom_societe ? ` de ${contexte.nom_societe}` : ''}.

Quel type de contrat souhaitez-vous établir ? (lettre de mission comptable, convention d'honoraires, NDA, prestation de service...)`
  }

  return `Bonjour ! Je suis votre assistant pour la rédaction de contrats clients.

Quel type de contrat souhaitez-vous rédiger, et pour quel client ?`
}

function getLibelleContrat(type: string): string {
  const libelles: Record<string, string> = {
    lettre_mission: 'une lettre de mission',
    convention_honoraires: "une convention d'honoraires",
    prestation_service: 'un contrat de prestation de service',
    nda: 'un accord de confidentialité (NDA)',
    mandat: 'un mandat de représentation',
    autre: 'un contrat',
  }
  return libelles[type] || 'un contrat'
}

// ============================================================
// TYPES CONTRATS — Labels et icônes
// ============================================================

export const TYPES_CONTRATS = [
  { value: 'lettre_mission', label: 'Lettre de mission', description: 'Mission comptable récurrente' },
  { value: 'convention_honoraires', label: "Convention d'honoraires", description: 'Mission ponctuelle' },
  { value: 'prestation_service', label: 'Prestation de service', description: 'Services techniques ou consulting' },
  { value: 'nda', label: 'NDA / Confidentialité', description: 'Protection des informations' },
  { value: 'mandat', label: 'Mandat de représentation', description: 'Représentation MRA, ROC, FSC' },
  { value: 'autre', label: 'Autre contrat', description: 'Format libre' },
] as const

export const STATUTS_CONTRATS = [
  { value: 'brouillon', label: 'Brouillon', color: 'gray' },
  { value: 'en_revision', label: 'En révision', color: 'yellow' },
  { value: 'valide', label: 'Validé', color: 'blue' },
  { value: 'envoye', label: 'Envoyé', color: 'purple' },
  { value: 'signe', label: 'Signé', color: 'green' },
  { value: 'archive', label: 'Archivé', color: 'gray' },
  { value: 'resilie', label: 'Résilié', color: 'red' },
] as const
