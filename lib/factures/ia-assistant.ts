/**
 * ia-assistant.ts — Assistant IA Rédaction de Factures
 * LEXORA — Module Factures
 *
 * Couvre la création conversationnelle de :
 *  - Facture client (toutes devises MUR/EUR/USD/GBP)
 *  - Devis
 *  - Avoir / Credit Note
 *  - Note de débit / Debit Note
 *
 * L'assistant a accès au contexte société active (BRN, VAT, banque),
 * aux contacts enregistrés, au catalogue services/produits, et aux 10
 * dernières factures pour permettre "même chose que la dernière fois".
 *
 * Architecture identique à lib/contrats/assistant.ts (system prompts
 * + Claude SDK paresseux côté serveur uniquement).
 */

import Anthropic from '@anthropic-ai/sdk'

export interface MessageFactureIA {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

/**
 * Paramètres extraits par l'IA — couvre les 4 types de documents
 * (facture, devis, avoir, note_debit).
 */
export interface ParametresFacture {
  // Type & numérotation
  type_document?: 'facture' | 'devis' | 'avoir' | 'note_debit'
  numero_facture?: string                 // Si non fourni → auto-incrément
  facture_reference_id?: string           // Pour avoir / note de débit

  // Client / tiers
  tiers?: string                          // Nom affiché client
  contact_id?: string                     // ID contact si trouvé dans la base
  client_offshore?: boolean
  description?: string

  // Dates
  date_facture?: string                   // YYYY-MM-DD
  date_echeance?: string
  conditions_paiement?: number            // jours

  // Devise & taux
  devise?: 'MUR' | 'EUR' | 'USD' | 'GBP' | string
  taux_change?: number                    // vers MUR

  // Lignes
  lignes?: LigneFactureIA[]

  // Totaux (calculés serveur)
  montant_ht?: number
  montant_tva?: number
  montant_ttc?: number

  // Remise globale
  remise_pct?: number
  remise_montant?: number

  // Paiement
  mode_paiement?: 'banque' | 'cheque' | 'espece' | 'carte' | 'autre'
  paye_par?: string

  // Annexes
  template?: string
  template_id?: string
  termes?: string                         // Conditions imprimées sur la facture
  notes_internes?: string                 // Non imprimées

  // Récurrence
  recurrent?: boolean
  recurrence_periodicite?: 'mensuelle' | 'trimestrielle' | 'annuelle' | 'hebdomadaire'
  recurrence_date_fin?: string

  [key: string]: unknown
}

export interface LigneFactureIA {
  description: string
  quantite: number
  prix_unitaire: number
  taux_tva: number                        // 0 ou 15 à Maurice
  unite?: string                          // jour, heure, pièce, etc.
  catalogue_id?: string                   // Référence catalogue si match
}

export interface AnalyseFacture {
  parametres_extraits: ParametresFacture
  informations_manquantes: string[]
  pret_a_generer: boolean
  prochaine_question?: string
}

/**
 * Contexte injecté dans les prompts pour que l'IA réponde précisément.
 * Récupéré côté serveur via /api/client/factures-ia/contexte.
 */
export interface ContexteFactureIA {
  societe: {
    id: string
    nom: string
    brn?: string
    vat_number?: string
    adresse?: string
    devise_defaut?: string
    banque_iban?: string
    banque_swift?: string
    mra_fiscalisation_active?: boolean
  }
  user: {
    full_name?: string
    email?: string
  }
  contacts: Array<{
    id: string
    nom?: string
    entreprise?: string
    email?: string
    telephone?: string
    vat_number?: string
    brn?: string
    adresse?: string
    offshore?: boolean
  }>
  catalogue: Array<{
    id: string
    designation: string
    description?: string
    prix_ht_mur?: number
    prix_ht_eur?: number
    taux_tva?: number
    unite?: string
    categorie?: string
  }>
  factures_recentes: Array<{
    id: string
    numero_facture?: string
    tiers?: string
    contact_id?: string
    date_facture?: string
    montant_ttc?: number
    devise?: string
    type_document?: string
    lignes?: LigneFactureIA[]
  }>
  prochain_numero?: { facture?: string; devis?: string; avoir?: string; note_debit?: string }
  tva_defaut?: number
  conditions_paiement_defaut?: number
}

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

// ============================================================
// SYSTEM PROMPT — Assistant IA Factures
// ============================================================

function buildSystemPrompt(ctx: ContexteFactureIA): string {
  const contactsSummary = ctx.contacts.length
    ? ctx.contacts.slice(0, 30).map(c =>
        `- ${c.nom || c.entreprise || '?'}${c.entreprise && c.nom ? ` (${c.entreprise})` : ''}${c.offshore ? ' [offshore]' : ''}${c.vat_number ? ` VAT:${c.vat_number}` : ''} [id:${c.id}]`
      ).join('\n')
    : '(aucun contact enregistré)'

  const catalogueSummary = ctx.catalogue.length
    ? ctx.catalogue.slice(0, 50).map(a =>
        `- ${a.designation}${a.prix_ht_mur ? ` — ${a.prix_ht_mur} MUR` : ''}${a.prix_ht_eur ? ` / ${a.prix_ht_eur} EUR` : ''}${a.unite ? ` (${a.unite})` : ''} [id:${a.id}, TVA ${a.taux_tva ?? 15}%]`
      ).join('\n')
    : '(aucun article catalogue)'

  const historiqueSummary = ctx.factures_recentes.length
    ? ctx.factures_recentes.slice(0, 10).map(f =>
        `- ${f.numero_facture || '?'} (${f.type_document || 'facture'}) du ${f.date_facture || '?'} pour ${f.tiers || '?'} : ${f.montant_ttc || 0} ${f.devise || 'MUR'} TTC [id:${f.id}]`
      ).join('\n')
    : '(aucune facture passée)'

  const prochainsNumeros = ctx.prochain_numero
    ? `\n- Facture : ${ctx.prochain_numero.facture || 'auto'}\n- Devis : ${ctx.prochain_numero.devis || 'auto'}\n- Avoir : ${ctx.prochain_numero.avoir || 'auto'}\n- Note de débit : ${ctx.prochain_numero.note_debit || 'auto'}`
    : ''

  return `Tu es **Lexora Factures IA**, un assistant expert en création de factures pour les professionnels mauriciens.

## Ton rôle
Tu aides l'utilisateur à créer rapidement une facture / devis / avoir / note de débit grâce au chat. Tu utilises les informations déjà connues de sa société, de ses clients et de son catalogue pour ne demander QUE l'essentiel.

## Contexte SOCIÉTÉ ÉMETTRICE (l'utilisateur facture pour cette société)

- **${ctx.societe.nom}**
- BRN : ${ctx.societe.brn || 'non renseigné'}
- VAT : ${ctx.societe.vat_number || 'non renseigné'}
- Adresse : ${ctx.societe.adresse || 'non renseignée'}
- Devise par défaut : ${ctx.societe.devise_defaut || 'MUR'}
- TVA par défaut : ${ctx.tva_defaut ?? 15}%
- Conditions paiement par défaut : ${ctx.conditions_paiement_defaut ?? 30} jours
- IBAN : ${ctx.societe.banque_iban || 'non renseigné'} (SWIFT ${ctx.societe.banque_swift || 'non renseigné'})
- Fiscalisation MRA EBS : ${ctx.societe.mra_fiscalisation_active ? 'ACTIVÉE' : 'désactivée'}

## Utilisateur connecté
${ctx.user.full_name || ctx.user.email || 'utilisateur'}

## Contacts clients enregistrés
${contactsSummary}

## Catalogue services & produits
${catalogueSummary}

## 10 dernières factures (pour "comme la dernière fois")
${historiqueSummary}

## Prochains numéros disponibles${prochainsNumeros}

## Méthode

### 1. Identification du client
- Si l'utilisateur cite un nom, tu cherches dans les contacts ci-dessus
- Si match exact ou très probable, tu confirmes : "Tu veux dire Jean Dupont (Acme Ltd) ? [id-uuid]"
- Si plusieurs candidats, demande lequel
- Si pas de match, propose : "Je ne trouve pas ce client. Tu veux que je le crée avec ses coordonnées ou utiliser juste un nom libre ?"

### 2. Identification des lignes
- Si l'utilisateur dit "comme la dernière fois" → tu pioches dans les factures récentes pour ce client
- Si l'utilisateur cite un service du catalogue → tu utilises le prix et la TVA du catalogue
- Sinon, tu demandes description, quantité, prix unitaire, TVA (15% par défaut Maurice)
- Multi-lignes : tu acceptes "ajoute aussi..." ou liste à la volée

### 3. Détection du type de document
- Mot clé "devis" / "estimation" / "proforma" → type_document='devis'
- "avoir" / "credit note" / "remboursement" → type_document='avoir' (demande la facture d'origine)
- "note de débit" / "complément" / "debit note" → type_document='note_debit'
- Par défaut → 'facture'

### 4. Multi-devise
- L'utilisateur peut facturer en MUR, EUR, USD, GBP
- Si devise étrangère, demande ou propose un taux de change vers MUR
- Affiche toujours le montant en devise originale + équivalent MUR

### 5. Récurrence (si demandé)
- "facture tous les mois" / "récurrent" → propose recurrence_periodicite et date_fin
- Confirme : "OK, cette facture sera créée chaque mois jusqu'au ..."

### 6. Confirmation puis génération
- Avant de générer, résume : "Récap : INV-XXX, [client], [N lignes], TTC X MUR, échéance Y. Tu valides ?"
- Si l'utilisateur dit "valide", "OK", "vas-y", "génère" → tu génères

## Règles strictes
- N'INVENTE PAS de prix : si pas dans le catalogue et pas dit par l'utilisateur, demande
- N'INVENTE PAS de coordonnées client : si pas dans contacts, tu utilises juste le nom
- TVA Maurice standard 15% sauf si client offshore (alors 0% / Zero-rated Export)
- Devis ≠ facture : un devis n'a pas de date d'échéance mais une date de validité (30 jours par défaut)
- Avoir : montant en NÉGATIF côté client, référence à la facture d'origine obligatoire
- Note de débit : montant positif, complément à une facture existante
- Si fiscalisation MRA activée, mentionne à la fin : "Tu pourras fiscaliser cette facture auprès du MRA depuis l'aperçu"
- Reste concis, pose 1-2 questions max à la fois, parle naturellement

## Format des réponses
- Texte naturel, paragraphes courts
- Quand tu identifies un contact, mentionne son id entre crochets [id:uuid]
- Quand tu identifies un article catalogue, mentionne son id [id:uuid]
- Pas de markdown lourd, pas de bullets sauf si récap final`
}

// ============================================================
// SYSTEM PROMPT — Extraction des paramètres
// ============================================================

const SYSTEM_PROMPT_EXTRACTION_FACTURE = `Tu es un extracteur de données structurées pour factures professionnelles mauriciennes.
Analyse la conversation et extrait TOUS les paramètres pertinents pour créer la facture/devis/avoir/note de débit.
Réponds UNIQUEMENT avec un JSON valide, sans commentaire ni markdown.`

// ============================================================
// FONCTION: Continuer la conversation
// ============================================================

export async function continuerConversationFacture(params: {
  contexte: ContexteFactureIA
  historique: MessageFactureIA[]
  nouveau_message: string
}): Promise<string> {
  const messages = [
    ...params.historique.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: params.nouveau_message },
  ]

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: buildSystemPrompt(params.contexte),
    messages,
  })

  return (response.content[0] as { type: string; text: string }).text
}

// ============================================================
// FONCTION: Extraire les paramètres
// ============================================================

export async function extraireParametresFacture(params: {
  contexte: ContexteFactureIA
  historique: MessageFactureIA[]
}): Promise<AnalyseFacture> {
  const conversationTexte = params.historique
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  // Mini-contexte (juste les IDs disponibles, pour aider à les retrouver)
  const idsContacts = params.contexte.contacts.map(c => `${c.id} = ${c.nom || c.entreprise}`).join(', ')
  const idsCatalogue = params.contexte.catalogue.map(a => `${a.id} = ${a.designation}`).join(', ')

  const prompt = `Analyse cette conversation de création de facture et extrait les paramètres.

CONTEXTE :
- Société émettrice : ${params.contexte.societe.nom} (devise par défaut ${params.contexte.societe.devise_defaut || 'MUR'})
- TVA par défaut : ${params.contexte.tva_defaut ?? 15}%
- Conditions paiement défaut : ${params.contexte.conditions_paiement_defaut ?? 30} jours
- IDs contacts disponibles : ${idsContacts || '(aucun)'}
- IDs catalogue disponibles : ${idsCatalogue || '(aucun)'}
- Date du jour : ${new Date().toISOString().slice(0, 10)}

CONVERSATION :
${conversationTexte}

Réponds avec ce JSON exact (champs non pertinents = null) :
{
  "parametres_extraits": {
    "type_document": "<facture|devis|avoir|note_debit>",
    "tiers": "<nom client final affiché>",
    "contact_id": "<uuid du contact si trouvé, sinon null>",
    "client_offshore": <true|false>,
    "description": "<description optionnelle>",
    "date_facture": "<YYYY-MM-DD, défaut aujourd'hui>",
    "date_echeance": "<YYYY-MM-DD, défaut +30j>",
    "conditions_paiement": <jours ou null>,
    "devise": "<MUR|EUR|USD|GBP>",
    "taux_change": <nombre vers MUR si devise étrangère, 1 si MUR>,
    "lignes": [
      {
        "description": "<libellé>",
        "quantite": <nombre>,
        "prix_unitaire": <nombre dans la devise>,
        "taux_tva": <0|15>,
        "unite": "<jour|heure|pièce|forfait|null>",
        "catalogue_id": "<uuid si match catalogue, sinon null>"
      }
    ],
    "remise_pct": <0..100 ou null>,
    "remise_montant": <montant fixe ou null>,
    "mode_paiement": "<banque|cheque|espece|carte|autre>",
    "facture_reference_id": "<uuid facture d'origine pour avoir/note_debit, sinon null>",
    "termes": "<conditions imprimées ou null>",
    "notes_internes": "<note interne ou null>",
    "recurrent": <true|false>,
    "recurrence_periodicite": "<mensuelle|trimestrielle|annuelle|hebdomadaire|null>",
    "recurrence_date_fin": "<YYYY-MM-DD ou null>"
  },
  "informations_manquantes": ["<info essentielle manquante>", ...],
  "pret_a_generer": <true si tiers + au moins 1 ligne complète + dates, false sinon>,
  "prochaine_question": "<null si pret, sinon la prochaine question>"
}`

  try {
    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT_EXTRACTION_FACTURE,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (response.content[0] as { type: string; text: string }).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as AnalyseFacture
  } catch {
    // Fallback
  }
  return {
    parametres_extraits: {},
    informations_manquantes: ['Informations insuffisantes'],
    pret_a_generer: false,
    prochaine_question: 'Pour qui veux-tu créer la facture, et quels services ?',
  }
}

// ============================================================
// Message d'accueil
// ============================================================

export function messageAccueilFacture(ctx: ContexteFactureIA): string {
  const nbContacts = ctx.contacts.length
  const nbCatalogue = ctx.catalogue.length
  const nbFactures = ctx.factures_recentes.length

  const recap: string[] = []
  if (nbContacts > 0) recap.push(`${nbContacts} client${nbContacts > 1 ? 's' : ''} enregistré${nbContacts > 1 ? 's' : ''}`)
  if (nbCatalogue > 0) recap.push(`${nbCatalogue} article${nbCatalogue > 1 ? 's' : ''} au catalogue`)
  if (nbFactures > 0) recap.push(`${nbFactures} facture${nbFactures > 1 ? 's' : ''} récente${nbFactures > 1 ? 's' : ''}`)

  const contexteRecap = recap.length > 0 ? `J'ai accès à : ${recap.join(', ')}.\n\n` : ''

  return `Bonjour ! Je suis **Lexora Factures IA**. Je vais t'aider à créer une facture (ou devis / avoir / note de débit) pour **${ctx.societe.nom}** en quelques échanges.

${contexteRecap}Pour démarrer : pour quel client veux-tu facturer, et que faut-il facturer ?

(Tu peux dire par exemple "Une facture pour Jean Dupont, comme la dernière fois", ou "Devis pour Acme Ltd : conseil stratégique 5 jours à 25000 MUR".)`
}
