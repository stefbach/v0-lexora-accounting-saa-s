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
    logo_url?: string
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
  // Template IA actif (issu d'un upload utilisateur via facturation-settings).
  // Si présent, ses consignes sont injectées dans le system prompt et prennent
  // le dessus sur les défauts (TVA, conditions, devise, mentions).
  template_actif?: {
    nom?: string
    devise_defaut?: string
    tva_defaut?: number
    conditions_paiement?: string
    mentions_legales?: string
    format_numero?: string
    consignes_ia?: string
  }
}

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

// Extracteur JSON : output très structuré → Haiku 4.5 suffit (3-5x plus rapide,
// 5x moins cher). Override possible via ANTHROPIC_EXTRACTOR_MODEL.
export const CLAUDE_MODEL_EXTRACTOR = process.env.ANTHROPIC_EXTRACTOR_MODEL || 'claude-haiku-4-5-20251001'

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

  // Bloc dédié aux consignes du template IA actif. Placé en tête du prompt
  // pour que Claude le voie comme contrainte de premier ordre (couleurs,
  // mentions, format de numéro, conditions de paiement, etc. prévalent).
  const templateBlock = ctx.template_actif
    ? `\n## Modèle actif : ${ctx.template_actif.nom || 'sans nom'}\nCe modèle a été créé à partir d'une facture uploadée par l'utilisateur. Tu DOIS respecter ses paramètres :\n${ctx.template_actif.devise_defaut ? `- Devise par défaut : ${ctx.template_actif.devise_defaut}\n` : ''}${ctx.template_actif.tva_defaut != null ? `- TVA par défaut : ${ctx.template_actif.tva_defaut}%\n` : ''}${ctx.template_actif.conditions_paiement ? `- Conditions de paiement : ${ctx.template_actif.conditions_paiement}\n` : ''}${ctx.template_actif.format_numero ? `- Format de numéro : ${ctx.template_actif.format_numero}\n` : ''}${ctx.template_actif.mentions_legales ? `- Mentions légales : ${ctx.template_actif.mentions_legales}\n` : ''}${ctx.template_actif.consignes_ia ? `\n**Consignes spécifiques de l'utilisateur (PRIORITAIRES)** :\n${ctx.template_actif.consignes_ia}\n` : ''}\n`
    : ''

  return `Tu es **Lexora Factures IA**, un assistant expert en création de factures pour les professionnels mauriciens.
${templateBlock}

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
- Logo : ${ctx.societe.logo_url ? 'disponible (sera affiché en en-tête de la facture)' : 'non uploadé (l\'utilisateur peut l\'ajouter dans Facturation Settings → Identité)'}
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

## TDS (Tax Deducted at Source) — Maurice

Si le client est mauricien et la facture concerne des services professionnels, des loyers, des intérêts ou des dividendes, mentionne dans les notes visibles de la facture le TDS que le client devra retenir :
- Services professionnels (audit, conseil, IT, juridique) : 3%
- Loyers, royalties : 5%
- Intérêts versés : 10%
- Dividendes vers non-résident : 15%

Format suggéré dans notes_visibles : "TDS à retenir par le client : X% du montant HT — à reverser au MRA via Form TDS."
Ne mentionne PAS de TDS si le client est offshore ou si la facture est un avoir.

## Détection client offshore (TVA 0%)

Considère un client comme offshore (et donc TVA 0% "Zero-rated Export") dans CES cas :
- Le contact a la propriété offshore=true (visible dans la liste contacts ci-dessus avec marqueur [offshore])
- L'adresse client est explicitement hors Maurice (cite un pays étranger)
- L'utilisateur dit "client à l'étranger", "export", "offshore"

Si client offshore détecté :
- TVA = 0%
- Note dans notes_visibles : "Zero-rated export — VAT Act 1998 First Schedule"
- Demande confirmation : "Ce client est-il offshore (export, TVA 0%) ?"

## Cohérence devise vs client

Si la devise choisie est ÉTRANGÈRE (EUR/USD/GBP) ET le client est mauricien (pas offshore) :
- Alerte l'utilisateur : "Tu factures un client mauricien en EUR — c'est inhabituel. Confirmer ou basculer en MUR ?"
- Continue si l'utilisateur confirme

Si devise = MUR et client offshore :
- Suggère : "Client offshore facturé en MUR — souvent préférable de facturer en EUR/USD. Tu veux changer ?"

## Exercice fiscal — alerte clôture

Si date_facture proche de la clôture d'exercice (juin ou décembre selon société) :
- Date entre J-7 et J+0 de clôture : alerte "⚠️ Cette facture sera sur l'exercice qui se termine ${'$'}{date}. Confirme la date facture."
- Date entre J+1 et J+15 après clôture : suggère "Si la prestation date d'avant clôture, garde la date d'avant. Sinon OK exercice en cours."

## Vigilance doublon

Avant de générer, si le client a déjà 2+ factures EN BROUILLON dans les 10 dernières factures listées :
- "J'ai vu que tu as déjà X brouillons en cours pour ce client. C'est une nouvelle facture ou tu veux reprendre/modifier l'un des brouillons ?"
- Donne les numéros des brouillons existants pour clarifier

## "Comme la dernière fois" — fraîcheur

Si l'utilisateur dit "comme la dernière fois" ou variante :
- Vérifie que la facture référence est de MOINS DE 12 MOIS
- Si plus ancienne : "La dernière facture pour ce client date du ${'$'}{date_ancienne} (il y a > 1 an). Les prix/services ont-ils changé ?"
- Propose de reprendre malgré tout si l'utilisateur insiste

## Récurrence — jours non ouvrés Maurice

Si récurrence demandée et le jour d'émission tombe sur :
- Week-end (samedi/dimanche)
- Jour férié Maurice (1-2 Jan, Thaipoosam, Maha Shivaratree, 12 Mars Independance, Eid, Cavadee, 1 Mai, 15 Août, Ganesh Chaturthi, 1-2 Nov, 25 Déc)

Propose : "Le ${'$'}{jour} du mois tombe parfois sur weekend/férié — veux-tu que la facture se génère le 1er jour ouvré suivant, ou pile à la date même si non ouvré ?"
Stocke le choix dans recurrence_jour_du_mois (numéro) avec une note sur l'ajustement souhaité.

## Validation fourchette montants

Si le montant total TTC saisi pour ce client est ANORMAL par rapport à son historique (visible dans les 10 dernières factures) :
- Plus de 5x la moyenne historique → alerte "Le montant ${'$'}{total} est ~Nx plus élevé que la moyenne habituelle pour ce client (~${'$'}{moyenne}). Tu confirmes ?"
- Moins de 0.2x la moyenne → alerte "Le montant est ~Nx plus faible que d'habitude. C'est intentionnel (acompte, ajustement) ?"

Si le client n'a pas d'historique, pas d'alerte (rien à comparer).

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
Analyse la conversation entre un utilisateur et un assistant facture, puis extrait TOUS les paramètres pertinents pour créer la facture/devis/avoir/note de débit.

Réponds UNIQUEMENT avec un JSON valide, sans commentaire ni markdown.

═══ SCHÉMA JSON OBLIGATOIRE ═══

{
  "parametres_extraits": {
    "type_document": "facture | devis | avoir | note_debit",
    "tiers": "<nom client final affiché>",
    "contact_id": "<uuid du contact si trouvé dans le contexte, sinon null>",
    "client_offshore": <true|false>,
    "description": "<description optionnelle ou null>",
    "date_facture": "<YYYY-MM-DD, défaut aujourd'hui>",
    "date_echeance": "<YYYY-MM-DD, défaut +30j>",
    "conditions_paiement": <nombre de jours ou null>,
    "devise": "MUR | EUR | USD | GBP",
    "taux_change": <nombre vers MUR si devise étrangère, 1 si MUR>,
    "lignes": [
      {
        "description": "<libellé>",
        "quantite": <nombre>,
        "prix_unitaire": <nombre dans la devise>,
        "taux_tva": 0 | 15,
        "unite": "jour | heure | piece | forfait | null",
        "catalogue_id": "<uuid si match catalogue dans le contexte, sinon null>"
      }
    ],
    "remise_pct": <0-100 ou null>,
    "remise_montant": <nombre absolu ou null>,
    "facture_reference_id": "<uuid si avoir/note_debit avec facture origine, sinon null>",
    "recurrent": <true|false>,
    "recurrence_periodicite": "mensuel | trimestriel | annuel | null",
    "recurrence_date_fin": "<YYYY-MM-DD ou null>",
    "notes_visibles": "<notes affichées sur la facture, ex: TDS mention, conditions ou null>",
    "notes_internes": "<notes internes non visibles ou null>"
  },
  "informations_manquantes": ["<liste des champs encore nécessaires pour générer la facture>"],
  "pret_a_generer": <true|false>,
  "prochaine_question": "<question naturelle à poser si pas prêt, null si prêt>"
}

═══ RÈGLES STRICTES ═══

1. JSON strict : pas de virgule finale, pas de commentaires JS, pas de markdown autour
2. Tu NE PEUX PAS inventer un contact_id ou catalogue_id absent du contexte user-message
3. Si l'utilisateur n'a pas fourni un champ : utilise null (pas une chaîne vide, pas "non précisé")
4. Type document = 'avoir' → montants HT/TVA/TTC seront convertis en négatif par l'app, tu fournis valeurs positives
5. Client offshore = TRUE → force taux_tva = 0 pour toutes les lignes
6. Si "comme la dernière fois" est cité, tu peux reprendre les lignes de la facture la plus récente du même tiers (présente dans le contexte)
7. pret_a_generer = true UNIQUEMENT si tiers + au moins 1 ligne + date_facture sont renseignés

═══ ANTI-PATTERNS ═══

❌ Inventer un montant non cité (toujours null si pas dit)
❌ Mettre client_offshore=true sans signal explicite (offshore dans le contact ou mention explicite utilisateur)
❌ Mélanger devise et taux_change (devise=MUR → taux_change=1 obligatoire)
❌ Date d'échéance < date de facture
❌ catalogue_id qui ne correspond pas à un id du contexte`

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

Extrait le JSON conformément au schéma défini dans le system prompt.`

  try {
    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL_EXTRACTOR,
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
