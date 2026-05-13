/**
 * assistant.ts — Assistant IA Rédaction de Contrats
 * LEXORA — Module Contrats Clients
 *
 * Couvre TOUS les types de contrats du droit mauricien :
 *  - Prestation de service / cabinet comptable (lettre de mission, honoraires)
 *  - Immobilier (bail résidentiel, commercial, vente, cession fonds)
 *  - Vente (immobilier, véhicule, bien meuble, parts sociales)
 *  - Travail (CDI, CDD, freelance, consultant, apprentissage)
 *  - Commercial (distribution, franchise, agent, partenariat, licence)
 *  - Construction (BTP, architecte)
 *  - Confidentialité / juridique (NDA, non-concurrence, transaction)
 *
 * Architecture :
 * - Claude guide la conversation naturellement (questions adaptées au type)
 * - Chaque échange enrichit les paramètres structurés du contrat
 * - Génération finale = document HTML professionnel complet, conforme
 *   à la législation mauricienne (Code Civil, Workers' Rights Act 2019,
 *   Landlord and Tenant Act 1999, Sale of Goods Act, Companies Act, etc.)
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  MessageConversation,
  ParametresContrat,
  AnalyseConversation,
} from './constants'

export {
  TYPES_CONTRATS,
  STATUTS_CONTRATS,
} from './constants'
export type {
  MessageConversation,
  ParametresContrat,
  AnalyseConversation,
  CategorieContrat,
  TypeContratValue,
} from './constants'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return _anthropic
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

// ============================================================
// BASE DE CONNAISSANCES — Droit mauricien des contrats
// ============================================================

const LEGAL_KNOWLEDGE_MAURICE = `
## CADRE LÉGAL MAURICIEN — RÉFÉRENCES

### Droit général des contrats
- **Code Civil mauricien** (inspiré du Code Napoléon) — art. 1101 et s. pour la formation, 1134 force obligatoire, 1147 responsabilité contractuelle, 1184 résolution
- **Contract Law of Mauritius** — règles spéciales communes
- Liberté contractuelle, mais respect de l'ordre public et bonnes mœurs (art. 6)
- Cause licite et objet certain obligatoires

### Bail / Immobilier
- **Landlord and Tenant Act 1999** — encadre les baux résidentiels (durée min 12 mois sauf accord, préavis 1 mois locataire / 3 mois bailleur, dépôt max 2 mois loyer)
- **Land (Duties and Taxes) Act** — droits d'enregistrement pour bail > 12 mois
- **Notaries Act** — actes de vente immobilière obligatoirement authentiques (notaire)
- **Registration Duty Act** — droits d'enregistrement à payer à la MRA (5% acheteur typiquement + Land Transfer Tax 5% vendeur)
- **Transcription Act** — inscription au Conservatoire des hypothèques
- État des lieux d'entrée + sortie OBLIGATOIRE (sauf renonciation expresse)

### Vente
- **Sale of Goods Act 1973** — vente bien meuble : transfert propriété, garantie vices cachés, conformité
- Garantie d'éviction (art. 1626 Code Civil) et garantie des vices cachés (art. 1641) — d'ordre public sauf renonciation entre professionnels
- Vente immobilière : promesse synallagmatique (compromis) → acte authentique notarié → transcription
- Conditions suspensives courantes : obtention prêt, certificat hypothécaire, permis de construire

### Travail / RH
- **Workers' Rights Act 2019** (remplace l'Employment Rights Act 2008) — texte de référence
- Période d'essai : max 6 mois (12 mois pour cadres)
- Heures de travail standard : 45h/semaine, paiement heures supplémentaires obligatoire
- Congés annuels : min 22 jours ouvrables après 12 mois service
- Congé maladie : 21 jours/an (médecin requis si > 4 jours)
- Congé maternité : 14 semaines (12 semaines à plein salaire)
- Indemnité de cessation : 3 mois de salaire/an d'ancienneté (severance allowance)
- NSF (National Savings Fund) + CSG (Contribution Sociale Généralisée) employeur + employé
- TDS (Tax Deducted at Source) sur salaires via PAYE
- **CDD** : motif obligatoire (remplacement, surcroît temporaire, saisonnier, projet), max 3 ans
- **Workers Rights (Atypical Work) Regulations 2019** — temps partiel, télétravail, etc.

### Sociétés / Commercial
- **Companies Act 2001** — sociétés commerciales, cession parts sociales
- **Code de Commerce mauricien** — fonds de commerce, agents commerciaux
- Cession parts SARL : agrément des associés sauf clause contraire
- Fonds de commerce : publicité légale obligatoire (BOM Gazette), purge créanciers

### Fiscal
- **TVA (VAT) Maurice** : 15% si CA > 6 MUR (assujettissement obligatoire), exonérations spécifiques
- **TDS** : retenue à la source sur honoraires professionnels (5%-10%)
- **PAYE** : retenue sur salaires
- **Land Transfer Tax** : 5% sur vente immobilière (vendeur)
- **Registration Duty** : 5% sur vente immobilière (acheteur) — peut être réduit si premier achat
- **Stamp Duty** : faible montant sur actes
- Devise officielle : Roupie mauricienne (MUR)

### Résolution des litiges
- Tribunaux : Cour Suprême, Cour Intermédiaire, Cours de District
- **Mediation Act 2011** + **International Arbitration Act 2008**
- Arbitrage CCI ou MARC (Mauritius Arbitration Centre) possible
- Langue judiciaire : anglais (mais documents acceptés en français)
`

// ============================================================
// SYSTEM PROMPT — Assistant Rédaction de Contrats (polyvalent)
// ============================================================

const SYSTEM_PROMPT_ASSISTANT = `Tu es **Lexora Contracts**, un assistant expert en rédaction de contrats professionnels pour TOUS les domaines, conforme au droit mauricien.

## Ton rôle
Tu aides l'utilisateur (comptable, avocat, dirigeant, particulier, agent immobilier, RH…) à rédiger n'importe quel contrat licite avec un niveau de qualité d'expert. Tu écoutes, tu adaptes ton questionnement au TYPE de contrat, tu suggères les clauses pertinentes, tu rappelles les obligations légales mauriciennes quand utile.

## Domaines couverts (non exhaustif)

### 1. Prestation de service / cabinet
Lettre de mission comptable, convention d'honoraires, prestation IT/marketing/conseil/design, mandat MRA/ROC/FSC, sous-traitance, maintenance/SLA.

### 2. Immobilier
- **Bail résidentiel** (Landlord and Tenant Act 1999) — durée, dépôt, état des lieux, charges, indexation
- **Bail commercial** (3/6/9 ans typique) — destination, sous-location, cession, indexation indice CPI
- **Bail meublé courte durée / saisonnier**
- **Colocation** (solidarité entre locataires)
- **Vente immobilière** (notaire obligatoire — tu prépares la promesse synallagmatique)
- **Vente fonds de commerce** (publicité légale, purge créanciers)

### 3. Vente & cession
Véhicule, bien meuble (équipement, machine), parts sociales SARL, fonds de commerce, licence/marque, transfert d'IP.

### 4. Travail & RH (Workers' Rights Act 2019)
CDI, CDD (motif obligatoire), temps partiel, apprentissage/stage, freelance/indépendant, consultant expert, contrat de cadre dirigeant.

### 5. Commercial
Distribution exclusive/sélective, franchise, agent commercial, partenariat / JV, apport d'affaires, licence de marque/logiciel.

### 6. Construction & travaux
Marché de travaux BTP, contrat d'architecte, sous-traitance chantier, garantie décennale, retenue de garantie 5%.

### 7. Confidentialité / juridique
NDA mutuel ou unilatéral, non-concurrence (durée + zone + indemnité), protocole transactionnel.

### 8. Adaptable à toute profession
Médical (clauses déontologiques), légal (privilege/secret pro), restauration (licence, hygiène), transport (assurance, licence FSC), enseignement, sport, événementiel, agriculture, pêche, tourisme, etc. Tu adaptes la terminologie et les clauses spécifiques.

${LEGAL_KNOWLEDGE_MAURICE}

## Méthode de conversation

### Phase 1 — Identification du type
Si le type n'est pas évident, demande en UNE question naturelle : "Quel type de contrat veux-tu rédiger ?" et propose 3-4 catégories les plus probables selon le contexte (sans dérouler les 30 types — sois sélectif).

### Phase 2 — Découverte ciblée
Une fois le type connu, pose UNIQUEMENT les questions essentielles pour CE type. Exemples :
- **Bail résidentiel** → adresse, type bien, loyer, dépôt, date entrée, durée, meublé ?
- **CDI** → poste, salaire brut, date embauche, période essai, heures, lieu, avantages
- **Vente immobilière** → bien, prix, conditions suspensives, notaire choisi, date acte
- **NDA** → unilatéral/mutuel, objet, durée, exclusions
- **Distribution** → produits, territoire, exclusivité, redevances, durée

Pose 1 à 2 questions à la fois, jamais plus. Reformule pour confirmer.

### Phase 3 — Suggestions intelligentes
Propose les clauses non évoquées MAIS pertinentes pour ce type :
- Bail commercial → "Veux-tu inclure une clause de révision triennale indexée sur le CPI ?"
- CDI cadre → "Une clause de non-concurrence post-emploi est courante — durée 6 à 12 mois, indemnité requise. Tu en veux une ?"
- Vente entre pros → "Veux-tu écarter la garantie des vices cachés (autorisé entre professionnels) ?"
- Freelance → "On précise que ce n'est PAS une relation salariale (pas de subordination, autonomie d'organisation) pour éviter la requalification ?"

### Phase 4 — Confirmation puis génération
Résume les paramètres clés avant de générer. Si l'utilisateur dit "génère", "c'est bon", "vas-y" → tu génères immédiatement, sans plus de questions.

## Style
- Naturel, professionnel, accessible — pas de jargon inutile
- Pas de listes à puces en mode question (parle normalement)
- Mauritian context : Roupie (MUR), BRN, NIC, MRA, ROC, FSC
- Bilingue FR/EN si l'utilisateur change de langue
- Cite les bases légales UNIQUEMENT quand c'est pertinent ("c'est imposé par le Workers' Rights Act")

## Règles strictes
- N'invente PAS de chiffres (loyers, salaires) — demande à l'utilisateur
- Si une obligation légale entre en conflit avec une demande, signale-le ("Le dépôt de garantie est plafonné à 2 mois de loyer par le Landlord and Tenant Act — tu veux ajuster ?")
- Refuse de rédiger un contrat manifestement illicite (travail dissimulé, etc.)
- N'affirme jamais avoir vérifié auprès d'un avocat — rappelle que c'est un projet à faire valider
- Pour vente immobilière : rappelle SYSTÉMATIQUEMENT que l'acte définitif passe devant notaire`

// ============================================================
// SYSTEM PROMPT — Extraction de paramètres structurés
// ============================================================

const SYSTEM_PROMPT_EXTRACTION = `Tu es un extracteur de données structurées pour des contrats professionnels mauriciens.
Analyse la conversation et extrait TOUS les paramètres pertinents — adapte les champs au TYPE de contrat (immobilier ≠ travail ≠ vente).
Réponds UNIQUEMENT avec un JSON valide, sans commentaire ni markdown.`

// ============================================================
// SYSTEM PROMPT — Génération du contrat final
// ============================================================

const SYSTEM_PROMPT_GENERATION = `Tu es un rédacteur expert de contrats professionnels mauriciens, polyvalent (immobilier, travail, vente, commercial, prestation, etc.).

${LEGAL_KNOWLEDGE_MAURICE}

## Méthode de rédaction par type

### Lettre de mission / Convention honoraires / Prestation
ENTRE LES PARTIES → OBJET → SERVICES (détaillés) → HONORAIRES & MODALITÉS → DURÉE → OBLIGATIONS DES PARTIES → CONFIDENTIALITÉ → PROPRIÉTÉ INTELLECTUELLE → RÉSILIATION → RESPONSABILITÉ & ASSURANCE → DROIT APPLICABLE → SIGNATURES.

### Bail résidentiel
PARTIES (avec NIC) → DÉSIGNATION DU BIEN (adresse, surface, état) → DESTINATION (habitation exclusive) → DURÉE & DATE D'ENTRÉE → LOYER (montant, périodicité, mode paiement, indexation) → CHARGES (locatives détaillées) → DÉPÔT DE GARANTIE (max 2 mois — Landlord and Tenant Act) → ÉTAT DES LIEUX → OBLIGATIONS LOCATAIRE (entretien courant, assurance) → OBLIGATIONS BAILLEUR (jouissance paisible, gros entretiens) → RÉSILIATION (préavis 1 mois locataire / 3 mois bailleur) → CLAUSES PARTICULIÈRES (animaux, sous-location interdite sauf accord) → JURIDICTION → SIGNATURES + état des lieux annexé.

### Bail commercial
PARTIES (BRN) → DÉSIGNATION (avec destination commerciale précise) → DURÉE (3/6/9 typique) → LOYER + INDEXATION CPI ANNUELLE → DÉPÔT DE GARANTIE (souvent 3-6 mois) → CHARGES (taxes foncières, assurances qui paie) → TRAVAUX (autorisations, état au départ) → DESTINATION & SPÉCIALISATION → CESSION ET SOUS-LOCATION (clauses) → ASSURANCES OBLIGATOIRES → RÉSILIATION (préavis 3 ou 6 mois) → SIGNATURES.

### Vente immobilière (promesse synallagmatique)
PARTIES → DÉSIGNATION DU BIEN (cadastre, surface, état hypothécaire) → PRIX & MODALITÉS (acompte 10% standard) → CONDITIONS SUSPENSIVES (financement, certificat hypothécaire négatif, permis si applicable) → CHARGES (Land Transfer Tax 5% vendeur / Registration Duty 5% acquéreur) → DATE D'ACTE AUTHENTIQUE → NOTAIRE INSTRUMENTANT → GARANTIES (éviction, vices cachés) → CLAUSES PÉNALES (en cas de désistement) → MENTION RAPPEL : "L'acte définitif sera passé devant Maître X, notaire à Maurice, le … et la propriété ne sera transférée qu'à cette date".

### CDI (Workers' Rights Act 2019)
PRÉAMBULE → IDENTIFICATION (employeur BRN + salarié NIC) → POSTE & FONCTIONS (description précise) → DATE D'EMBAUCHE + PÉRIODE D'ESSAI (max 6 mois, 12 cadres) → DURÉE & HEURES (45h/semaine standard) → LIEU DE TRAVAIL → RÉMUNÉRATION (salaire brut, périodicité, primes) → AVANTAGES (assurance santé, transport, etc.) → CONGÉS (22j min/an) → CONFIDENTIALITÉ & EXCLUSIVITÉ → NON-CONCURRENCE (si applicable, avec indemnité) → CESSATION (préavis selon ancienneté, severance 3 mois/an d'ancienneté) → PROTECTION DES DONNÉES → SIGNATURES.

### CDD (Workers' Rights Act 2019)
IDEM CDI + MOTIF DU CDD OBLIGATOIRE (remplacement nominatif / surcroît temporaire / saisonnier / projet) + DATE DE FIN PRÉCISE OU ÉVÉNEMENT.

### Freelance / Indépendant
PARTIES → STATUT INDÉPENDANT (clause expresse "absence de subordination, autonomie d'organisation, pas de horaires imposés") → MISSION & LIVRABLES → RÉMUNÉRATION (HT, TVA si applicable, TAN) → DÉLAIS & MODALITÉS → PROPRIÉTÉ INTELLECTUELLE (cession ou licence) → CONFIDENTIALITÉ → ASSURANCE RC PRO → DURÉE & RÉSILIATION → CLAUSE ANTI-REQUALIFICATION.

### Vente véhicule / bien meuble
PARTIES → DÉSIGNATION (marque, modèle, n° série/châssis, immatriculation, kilométrage si véhicule) → PRIX → MODALITÉS DE PAIEMENT → DATE DE REMISE → ÉTAT GÉNÉRAL → GARANTIES (éviction, vices cachés — peut être écartée entre pros) → TRANSFERT PROPRIÉTÉ (à la signature ou paiement complet) → FORMALITÉS (carte grise pour véhicule).

### Cession de parts sociales
PARTIES → DÉSIGNATION DES PARTS (société, nombre, valeur nominale) → PRIX & MODALITÉS → AGRÉMENT DES ASSOCIÉS (si requis statuts) → GARANTIE D'ACTIF ET DE PASSIF → CONDITIONS SUSPENSIVES (autorisation, due diligence) → DÉPÔT AU REGISTRE DES COMMERCE.

### Distribution / Franchise / Agent commercial
PARTIES → OBJET (produits/services, territoire, exclusivité) → DURÉE → OBJECTIFS COMMERCIAUX → REDEVANCES/COMMISSION → APPROVISIONNEMENT → SAVOIR-FAIRE & FORMATION (franchise) → MARQUE & SIGNES DISTINCTIFS → NON-CONCURRENCE → RÉSILIATION → INDEMNITÉ DE FIN DE CONTRAT (agent commercial — d'ordre public).

### NDA / Non-concurrence / Transaction
NDA → PARTIES → DÉFINITION INFORMATIONS CONFIDENTIELLES → OBLIGATIONS → EXCLUSIONS (info publique, déjà connue, divulguée par tiers) → DURÉE (typique 3-5 ans) → RESTITUTION/DESTRUCTION → SANCTIONS.

### Construction / BTP
PARTIES → NATURE DES TRAVAUX → DEVIS DESCRIPTIF DÉTAILLÉ → PRIX (forfaitaire ou métré) → CALENDRIER → MODALITÉS PAIEMENT (acomptes selon avancement) → RETENUE DE GARANTIE 5% → ASSURANCES (RC, décennale) → RÉCEPTION → GARANTIES (parfait achèvement 1 an, biennale 2 ans, décennale 10 ans) → PÉNALITÉS DE RETARD.

## Format HTML obligatoire
- Document HTML autonome (styles inline), prêt à imprimer A4
- Police Arial/sans-serif, corps 11-12px, marges 2cm
- En-tête : logo placeholder + titre majuscules + référence + date
- Couleurs sobres : texte #1a1a1a, accent #1e40af, fond blanc
- Titres d'articles en gras numérotés "Article 1 — TITRE"
- Espaces signatures : deux colonnes (Partie A | Partie B), avec lieu et date
- Si vente immobilière : encadré "À PASSER DEVANT NOTAIRE — Acte authentique requis"
- Si bail : annexer "État des lieux" en placeholder
- Si CDI/CDD : annexer "Fiche de poste détaillée" en placeholder

## Langue
- Français par défaut (Maurice est bilingue)
- Passer en anglais si l'utilisateur le demande ou si la conversation est en anglais
- Terminologie juridique précise mais accessible
- Clauses complètes, sans renvois ambigus

## Ce que tu DOIS toujours faire
1. Inclure TOUTES les clauses standard du type (même non discutées) — c'est la valeur ajoutée
2. Mentionner les obligations légales (NSF/CSG pour CDI, notaire pour vente immo, dépôt max 2 mois pour bail résidentiel)
3. Préciser la juridiction (Tribunaux de Maurice) et le droit applicable (Droit mauricien)
4. Préciser la devise (MUR par défaut)
5. Numéroter les articles
6. Bas de page : "Document généré le [date] — à faire vérifier par un conseil juridique avant signature"`

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

  const response = await getAnthropic().messages.create({
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

  const stream = getAnthropic().messages.stream({
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

  const prompt = `Analyse cette conversation de rédaction de contrat et extrait TOUS les paramètres pertinents selon le TYPE de contrat détecté.

CONVERSATION:
${conversationTexte}

Adapte les champs au type :
- prestation/mission/honoraires/mandat → services, honoraires, périodicité
- bail_residentiel/bail_commercial/bail_meuble → adresse_bien, type_bien, loyer_mensuel, depot_garantie, duree_bail_mois, date_entree, meuble
- vente_immobilier/vente_fonds_commerce → designation_bien, prix_vente, condition_suspensive_financement, notaire
- vente_vehicule/vente_bien_meuble → designation_bien (marque/modèle/série), prix_vente, garantie_vices_caches
- cession_parts → designation_bien (société/parts), prix_vente
- contrat_travail_cdi/cdd/temps_partiel → poste, salaire_brut, periode_essai_mois, heures_semaine, date_embauche, motif_cdd, conges_annuels_jours
- contrat_freelance/consultant → statut_independant, montant_total, modalites_paiement, propriete_intellectuelle
- distribution/franchise/agent_commercial → territoire, exclusivite, redevance, duree_exclusivite_mois
- nda → objet_echange, duree_confidentialite_annees, exclusions_confidentialite
- construction → nature_travaux, prix_vente, retenue_garantie, garantie_decennale, delai_execution

Réponds UNIQUEMENT avec ce JSON (champs non pertinents = null) :
{
  "parametres_extraits": {
    "type_contrat": "<une valeur parmi: lettre_mission|convention_honoraires|prestation_service|mandat|sous_traitance|maintenance|bail_residentiel|bail_commercial|bail_meuble|colocation|vente_immobilier|vente_fonds_commerce|vente_vehicule|vente_bien_meuble|cession_parts|contrat_travail_cdi|contrat_travail_cdd|contrat_temps_partiel|contrat_apprentissage|contrat_freelance|contrat_consultant|distribution|franchise|agent_commercial|partenariat|apport_affaires|licence_marque|construction|architecte|nda|non_concurrence|transaction|autre>",
    "titre": "<titre>",
    "nom_partie_a": "<bailleur/vendeur/employeur/donneur d'ordre>",
    "nom_partie_b": "<locataire/acheteur/salarié/prestataire>",
    "brn_partie_a": null,
    "brn_partie_b": null,
    "nic_partie_a": null,
    "nic_partie_b": null,
    "adresse_partie_a": null,
    "adresse_partie_b": null,
    "services": [],
    "honoraires_mensuels": null,
    "montant_total": null,
    "modalites_paiement": null,
    "date_debut": null,
    "date_fin": null,
    "duree_mois": null,
    "adresse_bien": null,
    "type_bien": null,
    "surface_m2": null,
    "loyer_mensuel": null,
    "charges_mensuelles": null,
    "depot_garantie": null,
    "duree_bail_mois": null,
    "date_entree": null,
    "meuble": null,
    "designation_bien": null,
    "prix_vente": null,
    "condition_suspensive_financement": null,
    "notaire": null,
    "poste": null,
    "salaire_brut": null,
    "periode_essai_mois": null,
    "heures_semaine": null,
    "date_embauche": null,
    "motif_cdd": null,
    "lieu_travail": null,
    "benefits": [],
    "conges_annuels_jours": null,
    "statut_independant": null,
    "territoire": null,
    "exclusivite": null,
    "redevance": null,
    "objet_echange": null,
    "duree_confidentialite_annees": null,
    "nature_travaux": null,
    "retenue_garantie": null,
    "garantie_decennale": null,
    "devise": "MUR",
    "tva_applicable": null,
    "clause_confidentialite": null,
    "clause_non_concurrence": null,
    "droit_applicable": "Droit mauricien",
    "juridiction": "Tribunaux de Maurice",
    "langue_contrat": "français",
    "notes_specifiques": null
  },
  "informations_manquantes": ["<info clé 1>", "<info clé 2>"],
  "pret_a_generer": <true si essentiels présents, false sinon>,
  "prochaine_question": "<null si pret_a_generer, sinon la prochaine question naturelle>"
}`

  try {
    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
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
    .slice(-8) // Garde plus de contexte pour les types complexes
    .map(m => `${m.role === 'user' ? 'Client' : 'IA'}: ${m.content}`)
    .join('\n')

  const prompt = `Génère un contrat HTML complet, professionnel et conforme au droit mauricien.

## PARAMÈTRES DU CONTRAT
${JSON.stringify(params.parametres, null, 2)}

## CONTEXTE DE LA CONVERSATION (pour les nuances qui ne sont pas dans les paramètres)
${conversationResume}

${params.instructions_specifiques ? `## INSTRUCTIONS SPÉCIFIQUES\n${params.instructions_specifiques}` : ''}

## CONSIGNES IMPÉRATIVES
- Document HTML autonome avec styles inline (pas de classes externes)
- Adapté au TYPE de contrat (voir guide rédactionnel système)
- Inclure TOUTES les clauses standard de ce type, même si non explicitement mentionnées dans la conversation
- Référence auto si non fournie : CTR-${new Date().getFullYear()}-XXXX
- Date du document : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
- Devise : MUR sauf indication contraire dans les paramètres
- Mentions légales en bas : numéro BRN/VAT si fournis
- Pour vente immobilière : encadré rappelant l'acte authentique chez notaire
- Pour bail : préciser obligations légales (dépôt max 2 mois résidentiel, état des lieux annexé)
- Pour CDI/CDD : référence Workers' Rights Act 2019
- Bas de page : "Document à faire vérifier par un conseil juridique avant signature"

Génère le HTML complet maintenant — pas de markdown, pas d'explications avant ou après, juste le HTML.`

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000, // Augmenté pour contrats complexes (bail commercial, CDI)
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
  const prompt = `Modifie ce contrat HTML selon l'instruction donnée, en gardant la conformité au droit mauricien.

## CONTRAT ACTUEL
${params.contenu_actuel}

## INSTRUCTION DE MODIFICATION
${params.instruction_modification}

## PARAMÈTRES DE BASE
${JSON.stringify(params.parametres, null, 2)}

Retourne le contrat HTML complet modifié. Garde la même structure visuelle, les mêmes styles, la même numérotation. N'ajoute pas d'explication avant ou après le HTML.`

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
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
    const libelle = getLibelleContrat(contexte.type_contrat)
    const ouverture = getQuestionOuverture(contexte.type_contrat)
    return `Bonjour ! Je vais vous aider à rédiger ${libelle} pour ${contexte.nom_client}${contexte.nom_societe ? ` (${contexte.nom_societe})` : ''}.

${ouverture}`
  }

  if (contexte?.nom_client) {
    return `Bonjour ! Je vais vous aider à rédiger un contrat pour ${contexte.nom_client}${contexte.nom_societe ? ` de ${contexte.nom_societe}` : ''}.

Quel type de contrat voulez-vous établir ? Je couvre tous les domaines : prestation de service, bail résidentiel/commercial, vente (immobilier, véhicule, fonds de commerce), contrat de travail (CDI/CDD/freelance), distribution, franchise, NDA, ou autre. Dites-moi simplement ce dont vous avez besoin.`
  }

  return `Bonjour ! Je suis **Lexora Contracts**, votre assistant pour la rédaction de tout type de contrat conforme au droit mauricien.

Je couvre : prestation de service, baux (résidentiel, commercial, meublé), ventes (immobilier, véhicule, fonds de commerce, parts sociales), contrats de travail (CDI, CDD, freelance, consultant), commercial (distribution, franchise, agent), construction, NDA, et tout autre contrat que vous souhaitez.

Dites-moi simplement ce que vous voulez rédiger et pour qui — je m'adapte à votre profession et à votre cas.`
}

/**
 * Première question contextuelle adaptée au type pour démarrer
 * efficacement la conversation (évite le générique "dites-moi tout").
 */
function getQuestionOuverture(type: string): string {
  const questions: Record<string, string> = {
    lettre_mission: "Pour démarrer : quels services seront couverts (tenue comptable, déclarations TVA, états financiers...) et quel niveau d'honoraires envisagez-vous ?",
    convention_honoraires: "Pour démarrer : quelle est la mission précise et quel est le montant total prévu ?",
    prestation_service: "Pour démarrer : décrivez-moi la mission (objet, livrables) et la rémunération envisagée.",
    mandat: "Pour démarrer : quel est l'objet du mandat (MRA, ROC, FSC, banque...) et l'étendue des pouvoirs accordés ?",
    sous_traitance: "Pour démarrer : quelle prestation est sous-traitée et quels sont les délais et tarifs ?",
    maintenance: "Pour démarrer : quel équipement/logiciel est couvert, quel SLA (heures de réponse, disponibilité) et quel forfait mensuel ?",

    bail_residentiel: "Pour démarrer : quelle est l'adresse du bien, sa surface, le loyer mensuel envisagé et la date d'entrée du locataire ?",
    bail_commercial: "Pour démarrer : où est situé le local, quelle activité commerciale, quel loyer mensuel et quelle durée (3, 6 ou 9 ans) ?",
    bail_meuble: "Pour démarrer : adresse du bien meublé, durée prévue, loyer + charges incluses ?",
    colocation: "Pour démarrer : adresse du bien, nombre de colocataires, montant total du loyer et clé de répartition ?",

    vente_immobilier: "Pour démarrer : désignation du bien (adresse, surface, cadastre si connu), prix de vente envisagé et identité des parties. Je vous rappelle que l'acte définitif passera devant notaire.",
    vente_fonds_commerce: "Pour démarrer : nature du fonds (activité, adresse, éléments cédés - clientèle, matériel, droit au bail), prix global ?",
    vente_vehicule: "Pour démarrer : marque, modèle, immatriculation, kilométrage, prix de vente ?",
    vente_bien_meuble: "Pour démarrer : désignation précise du bien (marque, modèle, n° de série), prix et date de remise ?",
    cession_parts: "Pour démarrer : nom de la société, nombre de parts cédées, prix de cession et identité des parties ?",

    contrat_travail_cdi: "Pour démarrer : quel poste, quel salaire brut mensuel et quelle date d'embauche prévue ?",
    contrat_travail_cdd: "Pour démarrer : quel poste, quel motif (remplacement, projet, saisonnier...), date début/fin et salaire brut ?",
    contrat_temps_partiel: "Pour démarrer : quel poste, combien d'heures par semaine, salaire et planning ?",
    contrat_apprentissage: "Pour démarrer : quelle formation, quel apprenti, durée et indemnité ?",
    contrat_freelance: "Pour démarrer : quelle mission, quels livrables, quelle rémunération (forfait, jours, horaire) et quelle durée ?",
    contrat_consultant: "Pour démarrer : quelle expertise (audit, stratégie, technique...), durée de la mission et tarif (jour ou forfait) ?",

    distribution: "Pour démarrer : quels produits/services distribués, sur quel territoire, en exclusif ou non, et quelle durée ?",
    franchise: "Pour démarrer : quelle marque/enseigne, quel territoire, quel droit d'entrée et redevances ?",
    agent_commercial: "Pour démarrer : quels produits/services représentés, secteur géographique, taux de commission et durée ?",
    partenariat: "Pour démarrer : décrivez le projet commun, les apports de chaque partie et le partage des résultats.",
    apport_affaires: "Pour démarrer : quels prospects/affaires apportés, taux de commission et durée de l'engagement ?",
    licence_marque: "Pour démarrer : quelle marque ou logiciel, territoire, durée, exclusivité et redevances ?",

    construction: "Pour démarrer : nature des travaux, lieu du chantier, montant global prévu et délai d'exécution ?",
    architecte: "Pour démarrer : nature du projet, surface, budget travaux et honoraires (% ou forfait) ?",

    nda: "Pour démarrer : est-ce un NDA unilatéral (une partie protège ses infos) ou mutuel ? Quel est l'objet des échanges et la durée souhaitée ?",
    non_concurrence: "Pour démarrer : qui est concerné, dans quelle zone géographique, sur quels secteurs et pour combien de temps après la fin de la relation ?",
    transaction: "Pour démarrer : quel est le litige à régler et quel est l'accord trouvé (qui paie quoi, renonciation aux poursuites...) ?",

    autre: "Pour démarrer : décrivez-moi le contrat — qui sont les parties, quel est l'objet, et les conditions principales ?",
  }
  return questions[type] || questions.autre
}

function getLibelleContrat(type: string): string {
  const libelles: Record<string, string> = {
    lettre_mission: 'une lettre de mission',
    convention_honoraires: "une convention d'honoraires",
    prestation_service: 'un contrat de prestation de service',
    mandat: 'un mandat de représentation',
    sous_traitance: 'un contrat de sous-traitance',
    maintenance: 'un contrat de maintenance',
    bail_residentiel: 'un bail résidentiel',
    bail_commercial: 'un bail commercial',
    bail_meuble: 'un bail meublé courte durée',
    colocation: 'un bail de colocation',
    vente_immobilier: 'une promesse de vente immobilière',
    vente_fonds_commerce: 'une vente de fonds de commerce',
    vente_vehicule: 'un contrat de vente de véhicule',
    vente_bien_meuble: 'un contrat de vente',
    cession_parts: 'une cession de parts sociales',
    contrat_travail_cdi: 'un CDI',
    contrat_travail_cdd: 'un CDD',
    contrat_temps_partiel: 'un contrat à temps partiel',
    contrat_apprentissage: "un contrat d'apprentissage/stage",
    contrat_freelance: 'un contrat de freelance',
    contrat_consultant: 'un contrat de consultant expert',
    distribution: 'un contrat de distribution',
    franchise: 'un contrat de franchise',
    agent_commercial: "un contrat d'agent commercial",
    partenariat: 'un contrat de partenariat',
    apport_affaires: "un contrat d'apport d'affaires",
    licence_marque: 'une licence de marque/logiciel',
    construction: 'un contrat de construction',
    architecte: "un contrat d'architecte",
    nda: 'un accord de confidentialité (NDA)',
    non_concurrence: 'un engagement de non-concurrence',
    transaction: 'un protocole transactionnel',
    autre: 'un contrat',
  }
  return libelles[type] || 'un contrat'
}
