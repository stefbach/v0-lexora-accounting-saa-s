/**
 * expertJuridique.ts — Expert droit des sociétés mauricien (J0)
 * TIBOK COMPTA IA — Sprint 5 Module Juridique
 *
 * Référentiels légaux :
 * - Companies Act 2001 (CA 2001)
 * - Financial Services Act 2007 (FSA 2007)
 * - FSC Rules and Guidelines
 * - FATF Recommendations (AML/CFT/KYC)
 * - Income Tax Act (ITA), VAT Act
 * - Data Protection Act 2017 (DPA 2017)
 * - Beneficial Ownership Registration Act (BORA)
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ============================================================
// SYSTEM PROMPT — Expert Juridique J0
// ============================================================
export const SYSTEM_PROMPT_EXPERT_JURIDIQUE = `Tu es un expert en droit des sociétés mauricien avec 25 ans d'expérience.
Tu maîtrises parfaitement les lois et réglementations suivantes :

## LOIS MAURICIENNES
- **Companies Act 2001 (CA 2001)** — Constitution, capital, actionnaires, dirigeants, résolutions, rapports annuels, liquidation
- **Financial Services Act 2007 (FSA 2007)** — Licences FSC, GBL, Authorised Company
- **Financial Services Commission Rules** — AML/CFT Guidelines, KYC requirements, FSC Communiqués
- **Beneficial Ownership Registration Act (BORA 2020)** — Déclarations UBO obligatoires
- **Income Tax Act (ITA)** — Fiscalité sociétés, retenue à la source, Global Income Tax
- **Value Added Tax Act** — TVA 15%, obligations déclaratives
- **Data Protection Act 2017 (DPA 2017)** — Protection données personnelles
- **Prevention of Corruption Act 2002 (POCA)** — Conformité anti-corruption
- **Financial Intelligence and Anti-Money Laundering Act (FIAMLA)** — AML obligations

## STANDARDS INTERNATIONAUX
- **FATF Recommendations** — 40 recommandations GAFI, NRA Maurice
- **OECD BEPS** — Substance requirements pour GBL
- **Common Reporting Standard (CRS)** — Échange automatique d'informations
- **FATCA** — Foreign Account Tax Compliance Act

## TYPES DE SOCIÉTÉS COUVERTS
| Type | Régulateur | Spécificités |
|------|-----------|--------------|
| Local Company (Private) | Registrar of Companies | ≥1 directeur résident, CA 2001 |
| Local Company (Public) | Registrar + SEM | Audit obligatoire, publication |
| Global Business Licence (GBL) | FSC | Ex-Cat 1, substance requirements |
| Authorised Company (AC) | FSC | Ex-Cat 2, revenus hors Maurice |
| Foundation | Registrar | Fondation Act 2012, conseil |
| Trust | Financial Services | Trustee Act 2001, trust deed |
| Partnership | Registrar | Partnership Act 1920 |

## RÈGLES DE RÉPONSE

**Format obligatoire :**
1. Citer les sections exactes : (CA 2001 s.XX) ou (FSA 2007 s.XX)
2. Distinguer OBLIGATOIRE vs RECOMMANDÉ vs BONNE PRATIQUE
3. Alertes de risque :
   - 🔴 **CRITIQUE** — Violation légale, sanctions immédiates
   - 🟡 **ATTENTION** — Risque de non-conformité
   - 🟢 **OK** — Conforme
4. Indiquer les délais légaux précis (jours/mois)
5. Mentionner les pénalités applicables
6. Langue : Français sauf si question posée en anglais

**Spécialisations :**
- Création de sociétés (procédures, délais, coûts)
- Rédaction de statuts et documents constitutifs
- KYC/AML (checklist documents, évaluation risque)
- Due diligence (acquisition, investissement)
- Formalités annuelles (calendrier, pénalités retard)
- Augmentation/réduction de capital
- Valorisation d sociétés
- Conformité FSC pour GBL/AC
- Obligations BORA (beneficial ownership)

**Limites :**
- Ne pas donner de conseils fiscaux spécifiques (renvoyer à un tax consultant MRA agréé)
- Ne pas représenter le client devant les tribunaux
- Signaler si question dépasse le cadre du droit mauricien`

// ============================================================
// TYPES
// ============================================================
export interface ProfilSociete {
  id: string
  nom: string
  type_societe: string
  numero_registrar?: string
  numero_fsc?: string
  date_incorporation?: string
  capital_social?: number
  devise_capital?: string
  statut_fsc?: string
}

export interface ProfilKYC {
  type: 'personne_physique' | 'personne_morale'
  nom: string
  nationalite?: string
  pep?: boolean
  pays_incorporation?: string // si personne morale
  kyc_documents?: Array<{ type: string; valide: boolean }>
}

export interface EvaluationKYC {
  score_risque: number // 0-100 (100 = risque maximal)
  niveau_risque: 'faible' | 'moyen' | 'eleve' | 'inacceptable'
  documents_manquants: string[]
  documents_expires: string[]
  points_attention: string[]
  diligence_requise: 'cdd' | 'edd' // Customer DD ou Enhanced DD
  recommandations: string[]
  base_legale: string[]
}

export interface DonneesDiligence {
  type: 'acquisition' | 'investissement' | 'partenariat' | 'financement_bancaire'
  cible: string
  secteur: string
  valeur_transaction?: number
  devise?: string
}

export interface RapportDiligence {
  checklist: Array<{
    categorie: string
    items: Array<{ item: string; priorite: 'haute' | 'moyenne' | 'basse'; statut: 'a_verifier' }>
  }>
  points_vigilance: string[]
  documents_requis: string[]
  base_legale: string[]
}

// ============================================================
// FONCTION: Conseiller création de société
// ============================================================
export async function conseillerCreationSociete(params: {
  type_souhaite: string
  secteur_activite: string
  nationalite_fondateurs: string[]
  capital_previsionnel?: number
  activites_internationales?: boolean
}): Promise<string> {
  const prompt = `Conseil création de société mauritienne :

Type souhaité : ${params.type_souhaite}
Secteur : ${params.secteur_activite}
Nationalité fondateurs : ${params.nationalite_fondateurs.join(', ')}
Capital prévisionnel : ${params.capital_previsionnel ? params.capital_previsionnel + ' MUR' : 'Non défini'}
Activités internationales : ${params.activites_internationales ? 'Oui' : 'Non'}

Fournis :
1. Recommandation du type de société le plus adapté avec justification légale
2. Procédure de constitution étape par étape (délais + coûts approximatifs)
3. Documents requis pour l'enregistrement
4. Obligations post-constitution (KYC, FSC si applicable)
5. Avantages/inconvénients fiscaux
6. Points d'attention spécifiques selon la nationalité des fondateurs`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT_EXPERT_JURIDIQUE,
    messages: [{ role: 'user', content: prompt }],
  })

  return (response.content[0] as { type: string; text: string }).text
}

// ============================================================
// FONCTION: Analyser le profil KYC
// ============================================================
export async function analyserKYC(profil: ProfilKYC, type_societe: string): Promise<EvaluationKYC> {
  const prompt = `Évalue le profil KYC suivant pour une société de type ${type_societe} :

Type de personne : ${profil.type}
Nom : ${profil.nom}
${profil.nationalite ? `Nationalité : ${profil.nationalite}` : ''}
${profil.pays_incorporation ? `Pays incorporation : ${profil.pays_incorporation}` : ''}
PEP : ${profil.pep ? 'OUI — Due Diligence Renforcée obligatoire' : 'Non déclaré PEP'}
Documents fournis : ${JSON.stringify(profil.kyc_documents || [])}

Fournis une évaluation JSON stricte avec :
{
  "score_risque": <0-100>,
  "niveau_risque": "<faible|moyen|eleve|inacceptable>",
  "documents_manquants": ["<document>"],
  "documents_expires": ["<document>"],
  "points_attention": ["<point>"],
  "diligence_requise": "<cdd|edd>",
  "recommandations": ["<recommandation>"],
  "base_legale": ["<loi section>"]
}

Basé sur FATF Recommendations, FSC AML/CFT Guidelines 2023, et FIAMLA.
Réponds UNIQUEMENT avec le JSON valide.`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    system: SYSTEM_PROMPT_EXPERT_JURIDIQUE,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (response.content[0] as { type: string; text: string }).text
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as EvaluationKYC
    }
  } catch {
    // Fallback si parsing échoue
  }

  return {
    score_risque: 50,
    niveau_risque: 'moyen',
    documents_manquants: ['Évaluation manuelle requise'],
    documents_expires: [],
    points_attention: [text],
    diligence_requise: 'cdd',
    recommandations: ['Consulter un compliance officer'],
    base_legale: ['FATF Rec. 10', 'FIAMLA s.17'],
  }
}

// ============================================================
// FONCTION: Préparer la checklist de due diligence
// ============================================================
export async function preparerDiligence(donnees: DonneesDiligence): Promise<RapportDiligence> {
  const prompt = `Génère une checklist de due diligence pour :

Type : ${donnees.type}
Cible : ${donnees.cible}
Secteur : ${donnees.secteur}
${donnees.valeur_transaction ? `Valeur transaction : ${donnees.valeur_transaction} ${donnees.devise || 'MUR'}` : ''}

Fournis une checklist JSON complète et structurée :
{
  "checklist": [
    {
      "categorie": "<Juridique/Fiscal/Financier/Réglementaire/Opérationnel>",
      "items": [
        { "item": "<description>", "priorite": "<haute|moyenne|basse>", "statut": "a_verifier" }
      ]
    }
  ],
  "points_vigilance": ["<point spécifique Maurice>"],
  "documents_requis": ["<document>"],
  "base_legale": ["<loi section>"]
}

Adapte selon le droit mauricien. Réponds UNIQUEMENT avec le JSON valide.`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 3000,
    system: SYSTEM_PROMPT_EXPERT_JURIDIQUE,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (response.content[0] as { type: string; text: string }).text
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as RapportDiligence
    }
  } catch {
    // Fallback
  }

  return {
    checklist: [
      {
        categorie: 'Juridique',
        items: [
          { item: 'Certificate of Incorporation', priorite: 'haute', statut: 'a_verifier' },
          { item: 'Memorandum & Articles of Association', priorite: 'haute', statut: 'a_verifier' },
          { item: 'Register of Directors & Shareholders', priorite: 'haute', statut: 'a_verifier' },
          { item: 'Certificate of Good Standing (< 6 mois)', priorite: 'haute', statut: 'a_verifier' },
          { item: 'Contrats matériels (clients, fournisseurs)', priorite: 'moyenne', statut: 'a_verifier' },
          { item: 'Litiges en cours', priorite: 'haute', statut: 'a_verifier' },
        ],
      },
      {
        categorie: 'Fiscal',
        items: [
          { item: 'Déclarations fiscales 3 dernières années (MRA)', priorite: 'haute', statut: 'a_verifier' },
          { item: 'Certificat de bonne situation fiscale (MRA)', priorite: 'haute', statut: 'a_verifier' },
          { item: 'Déclarations TVA', priorite: 'moyenne', statut: 'a_verifier' },
          { item: 'Déclarations CSG/NSF', priorite: 'moyenne', statut: 'a_verifier' },
        ],
      },
    ],
    points_vigilance: ['Vérifier statut FSC si GBL/AC', 'Contrôler déclarations BORA'],
    documents_requis: ['Certificate of Incorporation', 'Audited accounts 3 years', 'MRA clearance'],
    base_legale: ['CA 2001', 'ITA', 'BORA 2020'],
  }
}

// ============================================================
// FONCTION: Évaluer le risque de conformité
// ============================================================
export async function evaluerRisque(params: {
  societe: ProfilSociete
  nb_actionnaires: number
  nb_dirigeants: number
  kyc_en_attente: number
  formalites_en_retard: number
  type_activite?: string
}): Promise<{
  score_conformite: number
  niveau: 'conforme' | 'attention' | 'risque' | 'critique'
  points_critiques: string[]
  actions_prioritaires: string[]
}> {
  // Calcul local du score de conformité (logique métier)
  let score = 100

  // KYC incomplets → -5 par personne
  score -= params.kyc_en_attente * 5

  // Formalités en retard → -10 par formalité
  score -= params.formalites_en_retard * 10

  // FSC suspendu/révoqué → -40
  if (params.societe.statut_fsc === 'suspendu') score -= 40
  if (params.societe.statut_fsc === 'revoque') score -= 60

  // Minimum 0
  score = Math.max(0, score)

  const niveau: 'conforme' | 'attention' | 'risque' | 'critique' =
    score >= 80 ? 'conforme' : score >= 60 ? 'attention' : score >= 40 ? 'risque' : 'critique'

  const points_critiques: string[] = []
  const actions_prioritaires: string[] = []

  if (params.kyc_en_attente > 0) {
    points_critiques.push(`${params.kyc_en_attente} KYC en attente de validation (FIAMLA s.17)`)
    actions_prioritaires.push('Compléter les KYC manquants en priorité')
  }

  if (params.formalites_en_retard > 0) {
    points_critiques.push(`${params.formalites_en_retard} formalités annuelles en retard`)
    actions_prioritaires.push('Régulariser les formalités en retard auprès du Registrar/FSC')
  }

  if (params.societe.statut_fsc === 'suspendu') {
    points_critiques.push('🔴 Licence FSC SUSPENDUE — opérations à risque (FSA 2007 s.21)')
    actions_prioritaires.push('Contact immédiat FSC pour levée de suspension')
  }

  if (!params.societe.numero_registrar) {
    points_critiques.push('Numéro BRN Registrar non renseigné')
    actions_prioritaires.push('Mettre à jour le profil juridique de la société')
  }

  return { score_conformite: score, niveau, points_critiques, actions_prioritaires }
}

// ============================================================
// FONCTION: Générer un document juridique via IA
// ============================================================
export async function genererDocumentJuridique(params: {
  type_document: string
  societe: ProfilSociete
  parametres: Record<string, unknown>
}): Promise<string> {
  const prompt = `Génère un ${params.type_document} complet pour la société suivante :

Société : ${params.societe.nom}
Type : ${params.societe.type_societe}
BRN : ${params.societe.numero_registrar || 'N/A'}
Capital : ${params.societe.capital_social} ${params.societe.devise_capital}

Paramètres spécifiques :
${JSON.stringify(params.parametres, null, 2)}

Instructions :
1. Document complet et conforme au droit mauricien
2. Citer les articles de loi applicables
3. Format HTML professionnel avec styles inline
4. Langue française sauf clauses légales en anglais (standard juridique MU)
5. Inclure toutes les mentions obligatoires
6. Espaces pour signatures et dates`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4000,
    system: SYSTEM_PROMPT_EXPERT_JURIDIQUE,
    messages: [{ role: 'user', content: prompt }],
  })

  return (response.content[0] as { type: string; text: string }).text
}

// ============================================================
// FONCTION: Question libre à l'expert (chat)
// ============================================================
export async function questionExpert(params: {
  question: string
  contexte_societe?: ProfilSociete
  historique?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<string> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Ajouter historique
  if (params.historique && params.historique.length > 0) {
    messages.push(...params.historique.slice(-10)) // Garder les 10 derniers messages
  }

  // Construire le message avec contexte
  let question = params.question
  if (params.contexte_societe) {
    question = `[Contexte : Société ${params.contexte_societe.nom} — Type: ${params.contexte_societe.type_societe} — BRN: ${params.contexte_societe.numero_registrar || 'N/A'}]

${params.question}`
  }

  messages.push({ role: 'user', content: question })

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2500,
    system: SYSTEM_PROMPT_EXPERT_JURIDIQUE,
    messages,
  })

  return (response.content[0] as { type: string; text: string }).text
}

// ============================================================
// CONSTANTES: Documents KYC requis par profil
// ============================================================
export const KYC_DOCUMENTS_REQUIS = {
  personne_physique_standard: [
    { type: 'passport', label: 'Passeport valide (copie certifiée)', obligatoire: true, validite_mois: 6 },
    { type: 'proof_address', label: "Justificatif de domicile (< 3 mois)", obligatoire: true, validite_mois: 3 },
    { type: 'source_funds', label: 'Déclaration origine des fonds', obligatoire: true },
    { type: 'pep_declaration', label: 'Déclaration PEP (Politically Exposed Person)', obligatoire: true },
    { type: 'cv', label: 'CV / Parcours professionnel', obligatoire: false },
    { type: 'bank_reference', label: 'Lettre de référence bancaire', obligatoire: false },
  ],
  personne_physique_edd: [
    { type: 'passport', label: 'Passeport valide (copie certifiée notaire)', obligatoire: true, validite_mois: 6 },
    { type: 'proof_address', label: "Justificatif de domicile (< 3 mois)", obligatoire: true, validite_mois: 3 },
    { type: 'source_funds', label: 'Déclaration origine des fonds détaillée', obligatoire: true },
    { type: 'source_wealth', label: 'Déclaration origine du patrimoine (proof of wealth)', obligatoire: true },
    { type: 'pep_declaration', label: 'Déclaration PEP', obligatoire: true },
    { type: 'tax_returns', label: 'Déclarations fiscales 3 ans', obligatoire: true },
    { type: 'bank_reference', label: 'Lettre de référence bancaire', obligatoire: true },
    { type: 'cv', label: 'CV complet avec références', obligatoire: true },
  ],
  personne_morale_standard: [
    { type: 'cert_incorporation', label: 'Certificate of Incorporation', obligatoire: true },
    { type: 'maa', label: 'Memorandum & Articles of Association', obligatoire: true },
    { type: 'register_directors', label: 'Register of Directors', obligatoire: true },
    { type: 'register_shareholders', label: 'Register of Shareholders', obligatoire: true },
    { type: 'good_standing', label: 'Certificate of Good Standing (< 6 mois)', obligatoire: true, validite_mois: 6 },
    { type: 'proof_address', label: 'Preuve adresse enregistrée', obligatoire: true },
    { type: 'ubo_declaration', label: 'Déclaration Bénéficiaires Effectifs (UBO)', obligatoire: true },
    { type: 'aml_policy', label: 'Politique AML/KYC de la société', obligatoire: false },
  ],
} as const

// ============================================================
// CONSTANTES: Délais légaux clés
// ============================================================
export const DELAIS_LEGAUX = {
  // Companies Act 2001
  depot_rapport_annuel_apres_ag: { jours: 28, base: 'CA 2001 s.176' },
  ag_annuelle_apres_cloture: { mois: 6, base: 'CA 2001 s.118' },
  avis_changement_dirigeant: { jours: 28, base: 'CA 2001 s.163' },
  depot_form_19_augmentation_capital: { jours: 30, base: 'CA 2001 s.61' },
  notification_bora: { jours: 14, base: 'BORA 2020 s.4' },

  // FSC
  renouvellement_licence_fsc: { mois: 1, avant_expiry: true, base: 'FSA 2007 s.20' },
  rapport_annuel_fsc: { mois: 3, apres_cloture: true, base: 'FSC Guidelines' },

  // MRA
  declaration_impot_societe: { mois: 6, apres_cloture: true, base: 'ITA s.118' },
  declaration_tva_mensuelle: { jours: 20, du_mois_suivant: true, base: 'VAT Act s.24' },
  paye_mensuel: { jours: 20, du_mois_suivant: true, base: 'ITA s.93' },
  csg_nsf_mensuel: { jours: 20, du_mois_suivant: true, base: 'CSG Act' },

  // KYC
  validite_kyc_standard: { ans: 2, base: 'FSC AML/CFT Guidelines 2023' },
  validite_kyc_risque_eleve: { ans: 1, base: 'FATF Rec. 10' },
  revue_periodique_pep: { mois: 6, base: 'FATF Rec. 12' },
} as const
