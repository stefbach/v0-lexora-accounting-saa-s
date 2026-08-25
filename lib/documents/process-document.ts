/**
 * Pipeline métier d'extraction OCR/catégorisation d'un document (facture
 * fournisseur/client, relevé bancaire, ticket, etc.) via Claude vision.
 *
 * Extrait de l'ancien `app/api/documents/process/route.ts` (traitement
 * synchrone dans la requête HTTP) pour être appelé depuis le worker de la
 * file d'attente asynchrone (`lib/documents/queue.ts`), en dehors du cycle
 * requête/réponse HTTP. Logique métier reprise telle quelle — seul le
 * découplage HTTP change — à une exception près : cette fonction NE marque
 * PLUS `documents.statut='erreur'` en cas d'échec, puisqu'un échec ici peut
 * être retenté (retry/backoff géré par le worker). C'est le worker qui
 * passe `documents.statut='erreur'` uniquement après épuisement des
 * tentatives (dead_letter).
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'
import { getTauxChange } from '@/lib/taux-change'
import { processReleveBancaire } from '@/lib/bank/process-releve'
import { autoCreateNoteDeFrais } from '@/lib/expenses/auto-create'
import { isBalanced, balanceDelta, round2 } from '@/lib/money'

// Mapping types canoniques étendus (cf. migration 283).
const ALLOWED_TYPE_DOCUMENT = new Set([
  'facture_fournisseur',
  'facture_client',
  'releve_bancaire',
  'fiche_paie',
  'charges_sociales',
  'contrat',
  'ticket',
  'recu',
  'bon_livraison',
  'autre',
])

// MIME images supportés par Anthropic vision. HEIC/HEIF fallback en jpeg.
const SUPPORTED_IMAGE_MIMES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

const ANTHROPIC_IMAGE_SOFT_LIMIT_BYTES = 5 * 1024 * 1024
const ANTHROPIC_IMAGE_HARD_LIMIT_BYTES = 10 * 1024 * 1024

function parseDateAny(raw: any): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0'), yy = m[3]
    return `${yy}-${mm}-${dd}`
  }
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

const DEVISE_SYMBOL_MAP: Record<string, string> = {
  '€': 'EUR', 'EUR': 'EUR', 'EURO': 'EUR', 'EUROS': 'EUR',
  '$': 'USD', 'USD': 'USD', 'US$': 'USD',
  '£': 'GBP', 'GBP': 'GBP',
  'Rs': 'MUR', 'MUR': 'MUR', 'RS': 'MUR', 'RUPEES': 'MUR',
  'ZAR': 'ZAR', 'R': 'ZAR',
}

function normalizeDevise(raw: any): string {
  if (!raw) return 'MUR'
  const s = String(raw).trim().toUpperCase()
  for (const [k, v] of Object.entries(DEVISE_SYMBOL_MAP)) {
    if (s === k.toUpperCase() || s.startsWith(k.toUpperCase())) return v
  }
  return s.slice(0, 5)
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export interface ProcessDocumentParams {
  documentId: string
  storagePath: string
  nomFichier: string
  /** Type imposé par une source de confiance (ex. robot bancaire : on SAIT que
   *  c'est un relevé). Court-circuite la classification LLM (qui, sur un PDF de
   *  relevé MCB, retombait à tort sur « autre ») et route vers l'extracteur
   *  relevé. Déclenche aussi un modèle plus fort pour l'extraction. */
  forcedType?: string
}

export type ProcessDocumentResult =
  | {
      ok: true
      type_document: string
      societe_detectee: string
      format_detecte: string
      confiance_extraction: number | null
      description_libre: string | null
      categorie_suggeree: string | null
      statut: 'traite' | 'en_attente_revue'
      processing_time_ms: number
      warnings?: string[]
    }
  | { ok: false; error: string }

export async function processDocument(params: ProcessDocumentParams): Promise<ProcessDocumentResult> {
  const { documentId, storagePath, nomFichier, forcedType } = params
  const startTime = Date.now()
  const pipelineWarnings: string[] = []
  const supabase = getSupabase()

  try {
    // Récupère le contexte société pour aider Claude à distinguer
    // facture_client (émise par MA société) vs facture_fournisseur (reçue).
    const { data: docCtx } = await supabase
      .from('documents')
      .select('dossier_id, dossiers!inner(societe_id, societes!inner(nom, brn))')
      .eq('id', documentId)
      .maybeSingle()
    const myCompany = (docCtx as any)?.dossiers?.societes?.nom || null
    const myBrn = (docCtx as any)?.dossiers?.societes?.brn || null

    // Step 1: Update status
    await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', documentId)

    // Step 2: Download file
    const { data: fileData, error: dlError } = await supabase.storage.from('documents').download(storagePath)
    if (dlError || !fileData) {
      return { ok: false, error: `Download failed: ${dlError?.message}` }
    }

    // Step 3: Prepare content
    const ext = nomFichier.split('.').pop()?.toLowerCase() || ''
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)
    const isPdf = ext === 'pdf'
    const isVisual = isPdf || isImage
    const isExcel = ['xlsx', 'xls'].includes(ext)
    const arrayBuffer = await fileData.arrayBuffer()
    const fileSizeBytes = arrayBuffer.byteLength
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const imageTooLarge = isImage && fileSizeBytes > ANTHROPIC_IMAGE_SOFT_LIMIT_BYTES
    const imageHardOversize = isImage && fileSizeBytes > ANTHROPIC_IMAGE_HARD_LIMIT_BYTES
    if (imageTooLarge) {
      console.warn(
        `[process-document] Image volumineuse (${Math.round(fileSizeBytes / 1024)} ko) > ${Math.round(ANTHROPIC_IMAGE_SOFT_LIMIT_BYTES / 1024)} ko — qualité OCR potentiellement dégradée`,
      )
    }

    let excelText = ''
    let excelSheetCount = 0
    let excelSheetNames: string[] = []
    let excelChosenSheet = ''
    if (isExcel) {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' })
        excelSheetNames = wb.SheetNames
        excelSheetCount = wb.SheetNames.length

        const FACTURE_KEYWORDS = [
          'facture', 'invoice', 'tva', 'vat', 'ht', 'ttc', 'total',
          'devise', 'eur', 'mur', 'montant', 'destinataire', 'emetteur',
          'client', 'fournisseur', 'brn', 'siret', 'n°', 'reference',
        ]

        let best: { name: string; csv: string; score: number } | null = null
        for (const name of wb.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: ';' })
          const lower = csv.toLowerCase()
          let score = 0
          for (const kw of FACTURE_KEYWORDS) {
            if (lower.includes(kw)) score += 1
          }
          if (/\d{3,}/.test(csv)) score += 2
          if (csv.length < 200) score -= 3
          if (/(recap|récap|cumul|annuel|yearly|ytd)/i.test(name) ||
              /(recap|récap|cumul|annuel|yearly|ytd)/i.test(lower.slice(0, 500))) {
            score -= 4
          }
          if (!best || score > best.score) {
            best = { name, csv, score }
          }
        }

        const chosen = best || { name: wb.SheetNames[0], csv: '', score: 0 }
        excelChosenSheet = chosen.name
        const compactedCsv = chosen.csv
          .split('\n')
          .filter(line => line.replace(/[;\s,]/g, '').length > 0)
          .join('\n')
        excelText = `=== Feuille analysée : ${chosen.name} (score indices facture: ${chosen.score}/${FACTURE_KEYWORDS.length + 2}) ===\n${compactedCsv.slice(0, 24000)}`

        if (excelSheetCount > 1) {
          excelText = `[INFO : ce fichier Excel contient ${excelSheetCount} feuilles (${wb.SheetNames.join(', ')}). On a sélectionné automatiquement la feuille "${chosen.name}" qui contient le plus d'indices facture (score ${chosen.score}). NE PAS additionner les montants entre feuilles ; analyser uniquement cette feuille.]\n\n${excelText}`
        }
      } catch (e: any) {
        return { ok: false, error: `Parse XLSX failed: ${e?.message}` }
      }
    }

    const imageMime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' =
      SUPPORTED_IMAGE_MIMES[ext] || 'image/jpeg'

    // Step 4: Call Anthropic
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const contentBlock = isPdf
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: imageMime, data: base64 } }

    // Modèle : haiku par défaut ; modèle plus fort pour un relevé bancaire imposé
    // (robot bancaire) — les relevés sont denses et haiku retournait une
    // extraction vide (format « inconnu ») sur les PDF de relevé MCB.
    const ocrModel = forcedType === 'releve_bancaire' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
    const response = await anthropic.messages.create({
      model: ocrModel,
      max_tokens: 8192,
      temperature: 0,
      system: `Tu es un expert-comptable mauricien chargé d'identifier ET d'extraire le contenu de N'IMPORTE QUEL document commercial :
- factures A4 structurées (PDF logiciels comptables)
- tickets de caisse POS thermiques (Winners, Carrefour, KFC, Total, Munching, etc.)
- reçus manuscrits (taxi, pourboire, achat informel)
- bons de livraison
- notes de frais sur post-it / photos mobiles inclinées ou floues
- factures simplifiées sans en-tête
- relevés bancaires, fiches de paie, contrats, cartes de visite, etc.

CONTEXTE UTILISATEUR :
- Société active : "${myCompany || 'INCONNU'}"${myBrn ? ` (BRN ${myBrn})` : ''}

================================================================================
ÉTAPE 1 — IDENTIFIER LE TYPE DE PIÈCE (routing.type_document)
================================================================================
Valeurs autorisées :
- "facture_fournisseur" : facture structurée REÇUE par "${myCompany || 'ma société'}" (achat).
- "facture_client"      : facture structurée ÉMISE par "${myCompany || 'ma société'}" (vente).
- "releve_bancaire"     : extrait/relevé bancaire (MCB, SBM, AfrAsia, ABC Banking, MauBank, Barclays, BOM, etc.).
- "charges_sociales"    : déclaration NSF / CSG / PAYE / fiche cotisations MRA.
- "fiche_paie"          : bulletin de salaire / payslip.
- "contrat"             : contrat commercial, NDA, bail, accord signé.
- "ticket"              : ticket de caisse / reçu POS thermique. Court, articles + total, pas de BRN client.
- "recu"                : reçu manuscrit (écriture humaine visible, encre/stylo).
- "bon_livraison"       : bon de livraison / delivery note (pas de paiement, juste preuve de remise).
- "autre"               : carte de visite, flyer, document non comptable, photo sans contenu commercial.

Indices de classification :
- Pièce A4 avec en-tête + BRN + TVA détaillée + "Invoice"/"Facture" + numéro → facture_*.
- Ticket thermique étroit, monospace, footer "Merci de votre visite" → "ticket".
- Manuscrit visible (encre/stylo) → "recu".
- "Delivery Note" / "Bon de livraison" / "Goods Received Note" sans montant final → "bon_livraison".

================================================================================
ÉTAPE 2 — FACTURE CLIENT vs FOURNISSEUR (seulement pour facture_*)
================================================================================
- type_document="facture_client" SI l'émetteur est "${myCompany || 'la société active'}" (VENTE).
- type_document="facture_fournisseur" SI le destinataire/acheteur est "${myCompany || 'la société active'}" (ACHAT).
- Si MA société ne figure ni comme émetteur ni comme destinataire → préfère facture_fournisseur par défaut.

================================================================================
ÉTAPE 3 — FORMAT DÉTECTÉ (routing.format_detecte)
================================================================================
- "facture_structuree" : PDF généré par logiciel (Stripe, Sage, Odoo, Xero, QuickBooks…).
- "ticket_caisse"      : impression thermique POS.
- "recu_manuscrit"     : écriture humaine.
- "photo_mobile"       : photo téléphone, perspective inclinée, ombre, fond visible.
- "scan_pdf"           : PDF scanné depuis papier (qualité variable).
- "inconnu"            : autre.

================================================================================
ÉTAPE 4 — RÈGLES TVA / MONTANTS (factures structurées uniquement)
================================================================================
- Si la facture mentionne un montant de TVA → renseigne montant_tva et taux_tva (15% standard MU).
- Si HORS TAXE / EXPORT / EXEMPTÉE / inter-UE / "VAT 0%" → montant_tva=0, taux_tva=0, montant_ht = montant_ttc.
- Si "montant net"/"subtotal" sans TVA et total final = ce montant → HORS TAXE : taux_tva=0.
- NE METS JAMAIS taux_tva=15 par défaut.

================================================================================
ÉTAPE 5 — RÈGLES POUR TICKETS / REÇUS / PETITS DOCUMENTS
================================================================================
- Pour un ticket < 200 MUR (~5 EUR) : NE CHERCHE PAS de décomposition HT/TVA.
  Renseigne uniquement montant_ttc = total payé ; laisse montant_ht=0, montant_tva=0, taux_tva=0.
- Pour un ticket > 200 MUR : si la TVA est imprimée → renseigne-la, sinon laisse 0.
- Pour les reçus manuscrits : ne déduis JAMAIS HT/TVA d'un montant unique ; mets juste montant_ttc.
- Pour un bon de livraison ou une carte de visite : montants à 0 ; renseigne juste description_libre.

================================================================================
ÉTAPE 6 — RELEVÉ BANCAIRE
================================================================================
- Signes : logo banque + IBAN MUxxx + colonnes Date/Description/Débit/Crédit/Solde + période ~1 mois.
- titulaire / nom_societe = COMPAGNIE propriétaire du compte. JAMAIS le nom de la banque.
- banque = nom de la banque (MCB, SBM, etc.).
- Lis TOUTES les lignes (exhaustivité prioritaire).
- Chaque ligne : "debit" OU "credit" > 0, l'autre à 0. Jamais les deux.
- Format montants : nombre JSON pur (ex 1234.56). Pas de séparateur de milliers.
- devise : lis "Currency"/"Devise" en en-tête. À Maurice = MUR par défaut.
- NE renvoie PAS "ecritures_comptables" pour un relevé — elles seront générées par le rapprochement.

================================================================================
ÉTAPE 7 — CATÉGORIE SUGGÉRÉE (notes de frais, tickets, reçus, petites pièces)
================================================================================
Valeurs : repas | taxi | essence | hotel | deplacement | fournitures | telecom | loyer | divers | null
- repas        : restaurant, fast-food, traiteur, café, snack (KFC, MCD, Munching…).
- taxi         : taxi, Uber, VTC, transport individuel.
- essence      : Total, Engen, Shell, Vivo, BP — carburant.
- hotel        : hôtel, AirBnB, guest house, nuit pro.
- deplacement  : avion, train, bus, péage, parking, location voiture.
- fournitures  : supermarché (Winners, Carrefour, Intermart, Jumbo), papeterie, hardware.
- telecom      : Orange, Emtel, MyT, recharges mobile, internet.
- loyer        : loyer bureau/local.
- divers       : si rien d'autre ne colle.
- null         : pour facture_*, releve_bancaire, fiche_paie, contrat, autre, bon_livraison.

================================================================================
ÉTAPE 8 — DESCRIPTION_LIBRE & CONFIANCE_EXTRACTION (TOUJOURS RENSEIGNÉS)
================================================================================
- description_libre : 1 phrase synthétique. Ex : "Ticket Winners Phoenix courses bureau 850 MUR", "Reçu manuscrit taxi aéroport 350 Rs".
- confiance_extraction (0-100) :
  - 90-100 : pièce nette, tous champs cohérents.
  - 60-89  : extraction correcte mais quelques champs ambigus.
  - 30-59  : pièce difficile (manuscrit partiel, photo inclinée).
  - 0-29   : illisible / inexploitable.

================================================================================
SCHÉMA DE SORTIE — UN SEUL JSON (sans markdown, sans backticks), schéma adaptatif :
================================================================================

POUR UNE FACTURE :
{
  "routing": { "societe": "...", "type_document": "facture_fournisseur|facture_client", "confiance_type": 0-100, "format_detecte": "facture_structuree|scan_pdf|photo_mobile" },
  "extraction": {
    "emetteur": "", "destinataire": "", "date_document": "", "date_echeance": "",
    "numero_reference": "", "devise": "", "taux_tva": 0, "montant_ht": 0,
    "montant_tva": 0, "montant_ttc": 0,
    "categorie_suggeree": null, "description_libre": "", "confiance_extraction": 0-100,
    "lignes": [{"description": "", "montant": 0}],
    "ecritures_comptables": [{"compte": "", "libelle": "", "debit": 0, "credit": 0}]
  }
}

POUR UN RELEVÉ BANCAIRE :
{
  "routing": { "societe": "<titulaire>", "type_document": "releve_bancaire", "confiance_type": 0-100, "format_detecte": "facture_structuree|scan_pdf" },
  "extraction": {
    "banque": "MCB|SBM|...",
    "titulaire": "<nom compagnie>",
    "nom_societe": "<nom compagnie>",
    "brn": "",
    "iban": "MU...",
    "numero_compte": "",
    "devise": "MUR|EUR|USD|...",
    "periode_debut": "YYYY-MM-DD",
    "periode_fin": "YYYY-MM-DD",
    "solde_ouverture": 0,
    "solde_cloture": 0,
    "total_debits": 0,
    "total_credits": 0,
    "categorie_suggeree": null, "description_libre": "", "confiance_extraction": 0-100,
    "transactions": [
      {"date": "YYYY-MM-DD", "libelle": "...", "debit": 0, "credit": 0, "reference": "", "tiers_detecte": ""}
    ]
  }
}

POUR UN TICKET / REÇU / PHOTO MOBILE :
{
  "routing": { "societe": "<vendor>", "type_document": "ticket|recu", "confiance_type": 0-100, "format_detecte": "ticket_caisse|recu_manuscrit|photo_mobile" },
  "extraction": {
    "emetteur": "<nom vendor>", "destinataire": "",
    "date_document": "YYYY-MM-DD", "date_echeance": "",
    "numero_reference": "", "devise": "MUR",
    "taux_tva": 0, "montant_ht": 0, "montant_tva": 0, "montant_ttc": 0,
    "categorie_suggeree": "repas|taxi|essence|hotel|deplacement|fournitures|telecom|divers",
    "description_libre": "",
    "confiance_extraction": 0-100,
    "lignes": [{"description": "", "montant": 0}]
  }
}

POUR LES AUTRES TYPES (charges_sociales, fiche_paie, contrat, bon_livraison, autre) :
{
  "routing": { "societe": "...", "type_document": "...", "confiance_type": 0-100, "format_detecte": "..." },
  "extraction": {
    "emetteur": "", "destinataire": "", "date_document": "", "numero_reference": "",
    "devise": "", "montant_ttc": 0,
    "categorie_suggeree": null, "description_libre": "", "confiance_extraction": 0-100,
    "ecritures_comptables": [{"compte": "", "libelle": "", "debit": 0, "credit": 0}]
  }
}

RAPPELS IMPORTANTS :
- NE METS PAS d'ecritures_comptables pour ticket/recu/bon_livraison/autre — la couche métier les ignore.
- Pour un relevé bancaire, NE renvoie PAS "ecritures_comptables" — rapprochement séparé.
- Si la pièce est illisible / pas un document commercial : type_document="autre", confiance_extraction < 30, description_libre = ce que tu vois.
- NE METS JAMAIS taux_tva=15 par défaut si la TVA n'est pas explicitement mentionnée.`,
      messages: [{
        role: 'user',
        content: isVisual
          ? [contentBlock, { type: 'text' as const, text: 'Analyse ce document.' }]
          : isExcel
            ? `Voici le contenu d'un fichier Excel/CSV exporté d'un logiciel comptable. Séparateur : ";".

DÉTECTION FACTURE — OBLIGATOIRE :
Ce fichier est une facture si tu vois N'IMPORTE LEQUEL de ces indices :
- Le mot "Facture", "Invoice", "TVA", "VAT", "BRN"
- Un en-tête émetteur (nom société, adresse)
- Un destinataire (Nom, Adresse, RCS)
- Une ligne "Montant Total", "Net à payer", "Total TTC"
- Des prix unitaires + quantités
NE CLASSE PAS en "autre" si tu vois ces indices. Force facture_client ou facture_fournisseur.

RÈGLES STRICTES pour les montants :
1. Cherche la ligne "Montant Total", "Net à payer" ou "Total TTC" (UNE seule, la finale en bas).
2. **DEVISE PRINCIPALE** : si la facture affiche deux colonnes (ex: "EUR" et "MUR"), la DEVISE PRINCIPALE est celle où apparaissent les **prix unitaires des lignes** (souvent EUR pour une facture export française). NE PAS prendre le montant MUR comme montant_ttc — c'est juste la conversion locale.
3. montant_ttc = le montant final dans la devise principale (ex: 19 349.32 EUR, PAS 1 026 481 MUR même si c'est plus grand).
4. devise = la devise principale (ex: "EUR" si les prix sont en EUR avec MUR comme conversion).
5. Si tu vois "Taux Euro en Roupie" ou "Taux de change" → confirme que la devise principale est EUR et que MUR est la conversion calculée.
6. Pour le HT : prends "Base H.T." ou "Total HT" dans la devise principale.
7. Pour la TVA : si "Taux de TVA" = 0% ou si HT == TTC → taux_tva = 0 (hors taxe / export).

CONTENU :
${excelText}`
            : `Analyse ce document: ${await fileData.text()}`
      }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('')

    let parsed: any = {}
    let parseError: string | null = null
    try {
      parsed = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          parsed = JSON.parse(match[0])
        } catch (e: any) {
          parseError = `JSON malformé: ${e?.message?.slice(0, 200)}`
        }
      } else {
        parseError = 'Aucun bloc JSON trouvé dans la réponse Claude'
      }
      if (!parsed || Object.keys(parsed).length === 0) {
        parsed = { routing: { type_document: 'autre', societe: 'INCONNU', confiance_type: 0 }, extraction: {} }
      }
    }

    // Type imposé par une source de confiance (robot bancaire) prioritaire sur la
    // classification LLM : sur un PDF de relevé MCB, le modèle retombait à tort
    // sur « autre » → aucun relevé créé. Le robot SAIT que c'est un relevé.
    let typeDoc = (forcedType && ALLOWED_TYPE_DOCUMENT.has(forcedType))
      ? forcedType
      : parsed.routing?.type_document || 'autre'
    if (!ALLOWED_TYPE_DOCUMENT.has(typeDoc)) {
      console.warn(`[process-document] type_document inconnu "${typeDoc}" → "autre"`)
      typeDoc = 'autre'
    }
    const societe = parsed.routing?.societe || 'INCONNU'
    const formatDetecte = parsed.routing?.format_detecte || 'inconnu'
    const extraction = parsed.extraction || {}
    const duration = Date.now() - startTime

    const rawConf = Number(extraction.confiance_extraction)
    const confianceExtraction = Number.isFinite(rawConf)
      ? Math.max(0, Math.min(100, Math.round(rawConf)))
      : null
    const descriptionLibre = typeof extraction.description_libre === 'string'
      ? extraction.description_libre.slice(0, 500)
      : null
    const categorieSuggeree = typeof extraction.categorie_suggeree === 'string'
      ? extraction.categorie_suggeree.toLowerCase().trim()
      : null

    // Post-validation : si Claude classe en client/fournisseur, on vérifie
    // que sa décision est cohérente avec MA société active.
    if (myCompany && (typeDoc === 'facture_client' || typeDoc === 'facture_fournisseur')) {
      const normalize = (s: any) => {
        const str = typeof s === 'string' ? s
          : (s?.nom || s?.name || s?.raison_sociale || '')
        return String(str)
          .toLowerCase()
          .replace(/\s*(ltd|limited|sarl|sas|sa|co|company|cie|llc)\s*/gi, '')
          .replace(/[^a-z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
      const me = normalize(myCompany)
      const emet = normalize(extraction.emetteur)
      const dest = normalize(extraction.destinataire)
      const matchesMe = (s: string) =>
        s && me && (s === me || s.includes(me) || me.includes(s))
      if (matchesMe(dest) && !matchesMe(emet)) {
        if (typeDoc !== 'facture_fournisseur') {
          console.warn(`[process-document] override: dest='${dest}' = me → forcing facture_fournisseur (Claude said ${typeDoc})`)
          typeDoc = 'facture_fournisseur'
        }
      } else if (matchesMe(emet) && !matchesMe(dest)) {
        if (typeDoc !== 'facture_client') {
          console.warn(`[process-document] override: emet='${emet}' = me → forcing facture_client (Claude said ${typeDoc})`)
          typeDoc = 'facture_client'
        }
      }
    }

    const isPetitePiece =
      typeDoc === 'ticket' ||
      typeDoc === 'recu' ||
      formatDetecte === 'photo_mobile' ||
      formatDetecte === 'recu_manuscrit'
    const isBonLivraison = typeDoc === 'bon_livraison'
    const isReleveBancaire = typeDoc === 'releve_bancaire'

    // Step 5: Save results
    const lowConfidence = confianceExtraction !== null && confianceExtraction < 50
    const finalStatut: 'traite' | 'en_attente_revue' = lowConfidence ? 'en_attente_revue' : 'traite'

    const n8nResult: any = {
      routing: parsed.routing,
      extraction,
      metadata: {
        processing_time_ms: duration,
        model: ocrModel,
        format_detecte: formatDetecte,
        confiance_extraction: confianceExtraction,
        file_size_bytes: fileSizeBytes,
        image_oversize: imageTooLarge || undefined,
        image_hard_oversize: imageHardOversize || undefined,
        excel_sheet_count: excelSheetCount || undefined,
        excel_sheet_names: excelSheetNames.length > 0 ? excelSheetNames : undefined,
        excel_chosen_sheet: excelChosenSheet || undefined,
      },
    }
    if (isExcel && (typeDoc === 'autre' || confianceExtraction === 0)) {
      n8nResult.debug_excel_content = excelText.slice(0, 6000)
      n8nResult.debug_claude_raw = text.slice(0, 4000)
      if (parseError) n8nResult.debug_parse_error = parseError
    }
    if (lowConfidence) {
      n8nResult.warning = 'Extraction peu fiable, vérification manuelle conseillée'
    }

    const updateData: any = {
      type_document: typeDoc,
      statut: finalStatut,
      n8n_result: n8nResult,
    }
    if (societe !== 'INCONNU') updateData.societe_detectee = societe
    if (confianceExtraction !== null) updateData.confiance_type = confianceExtraction
    if (isPetitePiece) {
      updateData.categorie = 'frais_employe'
    } else if (isBonLivraison) {
      updateData.categorie = 'bon_livraison'
    }

    await supabase.from('documents').update(updateData).eq('id', documentId)

    // Step 6: Auto-create accounting entries
    const isFactureType = typeDoc === 'facture_client' || typeDoc === 'facture_fournisseur'
    const skipClaudeEcritures =
      isFactureType || isReleveBancaire || isPetitePiece || isBonLivraison || typeDoc === 'autre'
    const ecritures = skipClaudeEcritures ? [] : (extraction.ecritures_comptables || [])
    {
      const { data: doc } = await supabase.from('documents').select('dossier_id, uploaded_by').eq('id', documentId).single()
      if (doc?.dossier_id) {
        const { data: dossierRow } = await supabase
          .from('dossiers').select('societe_id').eq('id', doc.dossier_id).maybeSingle()
        const societeId = dossierRow?.societe_id || null

        const journalMap: Record<string, string> = { facture_fournisseur: 'ACH', facture_client: 'VTE', releve_bancaire: 'BNQ' }
        const entries = ecritures
          .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
          .map((e: any) => ({
            dossier_id: doc.dossier_id,
            societe_id: societeId,
            date_ecriture: extraction.date_document || new Date().toISOString().split('T')[0],
            journal: journalMap[typeDoc] || 'OD',
            numero_piece: extraction.numero_reference || null,
            numero_compte: String(e.compte),
            libelle: e.libelle || nomFichier,
            debit_mur: round2(e.debit),
            credit_mur: round2(e.credit),
            piece_justificative: documentId,
          }))
        if (entries.length > 0 && societeId) {
          // Garde-fou R1 : ne jamais insérer un lot d'écritures IA déséquilibré
          // (Claude peut renvoyer des montants qui ne bouclent pas). Un grand
          // livre déséquilibré est bien plus coûteux à corriger qu'un document
          // laissé en revue manuelle.
          const debits = entries.map((e: { debit_mur: number }) => e.debit_mur)
          const credits = entries.map((e: { credit_mur: number }) => e.credit_mur)
          if (!isBalanced(debits, credits)) {
            console.warn(
              `[process-document] Écritures IA déséquilibrées (écart ${balanceDelta(
                debits,
                credits,
              )}) pour document ${documentId} — insertion annulée, document laissé en revue.`,
            )
            await supabase.from('documents').update({ statut: 'en_attente_revue' }).eq('id', documentId)
          } else {
            // Idempotence au retry : purge les écritures OD non lettrées déjà
            // posées pour ce document avant de réinsérer, sinon un échec après
            // cet insert ferait doubler les écritures au prochain passage du worker.
            await supabase
              .from('ecritures_comptables_v2')
              .delete()
              .eq('piece_justificative', documentId)
              .eq('journal', journalMap[typeDoc] || 'OD')
              .is('lettre', null)
            await supabase.from('ecritures_comptables_v2').insert(entries)
          }
        } else if (entries.length > 0 && !societeId) {
          console.warn(`[process-document] Skipping ecritures insert: dossier ${doc.dossier_id} has no societe_id`)
        }

        const rawTtc = Number(extraction.montant_ttc) || 0
        const rawHt = Number(extraction.montant_ht) || 0
        const rawTva = Number(extraction.montant_tva) || 0
        const hasAnyAmount = rawTtc > 0 || rawHt > 0 || rawTva > 0

        // Step 6b: Auto-create row in `factures`
        if (societeId && isFactureType && hasAnyAmount) {
          const { data: existing } = await supabase
            .from('factures')
            .select('id')
            .eq('document_id', documentId)
            .maybeSingle()
          if (!existing) {
            const tiersName = typeDoc === 'facture_fournisseur'
              ? (extraction.emetteur || extraction.fournisseur || extraction.tiers || null)
              : (extraction.destinataire || extraction.client || extraction.tiers || null)
            const tiersStr = typeof tiersName === 'string'
              ? tiersName
              : (tiersName?.nom || tiersName?.name || tiersName?.raison_sociale || null)
            const dateF = extraction.date_document || extraction.date_facture || null
            const dateValid = parseDateAny(dateF) || new Date().toISOString().split('T')[0]
            const dateEcheance = parseDateAny(extraction.date_echeance)

            const dateWarnings: string[] = []
            {
              const facDate = new Date(dateValid + 'T00:00:00')
              const today   = new Date()
              const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
              if (facDate.getTime() > today.getTime() + 24 * 3600 * 1000) {
                dateWarnings.push(`Date dans le futur : ${dateValid}`)
              }
              if (facDate.getTime() < sixMonthsAgo.getTime()) {
                dateWarnings.push(`Date suspecte : ${dateValid} (> 6 mois dans le passé). Vérifie le millésime — confusion OCR fréquente entre 2025/2026 en début d'année.`)
              }
              if (facDate.getFullYear() !== today.getFullYear()
                  && facDate.getMonth() === today.getMonth()
                  && Math.abs(today.getFullYear() - facDate.getFullYear()) === 1) {
                dateWarnings.push(`Millésime probablement erroné : ${dateValid} alors que nous sommes en ${today.getFullYear()}.`)
              }
            }
            const ht = rawHt
            const tva = rawTva
            const ttc = rawTtc || (ht + tva) || 0
            const devise = normalizeDevise(extraction.devise)
            const explicitTaux = extraction.taux_tva !== undefined ? Number(extraction.taux_tva) : null
            const taux = explicitTaux !== null && !isNaN(explicitTaux)
              ? explicitTaux
              : (ht > 0 && tva > 0 ? Number(((tva / ht) * 100).toFixed(2)) : 0)
            const extractedLignes = Array.isArray(extraction.lignes) ? extraction.lignes : []
            const lignes = extractedLignes.length > 0
              ? extractedLignes.map((l: any) => ({
                  id: crypto.randomUUID(),
                  description: String(l.description || l.libelle || 'Prestation').slice(0, 500),
                  quantite: Number(l.quantite ?? l.qte ?? 1) || 1,
                  unite: String(l.unite || 'Unité').slice(0, 50),
                  prix_unitaire: Number(l.prix_unitaire ?? l.pu ?? l.montant_ht ?? 0) || 0,
                  taux_tva: Number(l.taux_tva ?? l.tva ?? taux) || 0,
                  montant_ht: Number(l.montant_ht ?? l.total_ht ?? ((Number(l.quantite) || 1) * (Number(l.prix_unitaire) || 0))) || 0,
                }))
              : [{
                  id: crypto.randomUUID(),
                  description: 'Prestation — voir PDF original pour le détail',
                  quantite: 1,
                  unite: 'Forfait',
                  prix_unitaire: ht > 0 ? ht : ttc,
                  taux_tva: taux,
                  montant_ht: ht > 0 ? ht : ttc,
                }]
            let tauxChange = 1
            let montantMur = ttc
            if (devise !== 'MUR') {
              try {
                const rates = await getTauxChange()
                const r = rates[devise]
                if (r && r > 0) {
                  tauxChange = r
                  montantMur = ttc * r
                }
              } catch (e: any) {
                console.warn('[process-document] getTauxChange failed:', e?.message)
              }
            }
            const typeFacture = typeDoc === 'facture_fournisseur' ? 'fournisseur' : 'client'
            let numeroFacture = extraction.numero_reference || extraction.numero_facture || null
            if (numeroFacture) {
              numeroFacture = String(numeroFacture).trim().slice(0, 100)
              const { data: existingNum } = await supabase
                .from('factures')
                .select('numero_facture')
                .eq('societe_id', societeId)
                .eq('type_facture', typeFacture)
                .like('numero_facture', `${numeroFacture}%`)
              const existingNumbers = new Set((existingNum || []).map((r: any) => r.numero_facture))
              if (existingNumbers.has(numeroFacture)) {
                let suffix = 2
                let candidate = `${numeroFacture}-${suffix}`
                while (existingNumbers.has(candidate)) {
                  suffix++
                  candidate = `${numeroFacture}-${suffix}`
                }
                numeroFacture = candidate
              }
            }
            const { data: facInserted, error: facErr } = await supabase.from('factures').insert({
              societe_id: societeId,
              dossier_id: doc.dossier_id,
              numero_facture: numeroFacture,
              type_facture: typeFacture,
              tiers: tiersStr,
              description: nomFichier,
              date_facture: dateValid,
              date_echeance: dateEcheance,
              devise,
              taux_change: tauxChange,
              montant_ht: ht,
              montant_tva: tva,
              montant_ttc: ttc,
              taux_tva: taux,
              montant_mur: montantMur,
              statut: 'en_attente',
              document_id: documentId,
              lignes,
            }).select('id').single()
            if (facErr) {
              console.error('[process-document] Insert factures failed:', facErr.message)
            } else if (facInserted) {
              if (dateWarnings.length > 0) {
                pipelineWarnings.push(...dateWarnings)
                try {
                  await supabase.from('alertes').insert({
                    societe_id: societeId,
                    type_alerte: 'date_facture_suspecte',
                    niveau: 'important',
                    titre: `Date suspecte sur ${nomFichier}`,
                    description: dateWarnings.join(' • ') +
                      ` Vérifie la facture ${numeroFacture || facInserted.id.slice(0, 8)} dans /client/factures et corrige la date si besoin.`,
                    montant_mur: montantMur,
                    statut: 'active',
                    metadata: {
                      facture_id: facInserted.id,
                      document_id: documentId,
                      date_extraite: dateValid,
                      warnings: dateWarnings,
                    },
                  })
                } catch (alErr: any) {
                  console.warn('[process-document] Insert alerte date_facture_suspecte failed:', alErr?.message)
                }
              }
              const ecrRes = await createEcrituresForFacture(supabase, {
                id: facInserted.id,
                societe_id: societeId,
                numero_facture: numeroFacture || `DOC-${facInserted.id.slice(0, 8)}`,
                tiers: tiersStr || 'INCONNU',
                date_facture: dateValid,
                montant_ht: ht,
                montant_tva: tva,
                montant_ttc: ttc,
                type_facture: typeFacture,
                devise,
                taux_change: tauxChange,
                montant_mur: montantMur,
              })
              if (!ecrRes.ok) {
                console.error('[process-document] createEcrituresForFacture failed:', ecrRes.error)
              }
            }
          }
        } else if (societeId && isFactureType && !hasAnyAmount) {
          console.warn(`[process-document] Skip facture INSERT : document ${documentId} sans aucun montant détecté`)
        }

        // Step 6c: Auto-persist relevé bancaire
        if (societeId && isReleveBancaire) {
          try {
            const releveRes = await processReleveBancaire({
              supabase,
              documentId,
              dossierId: doc.dossier_id,
              societeId,
              nomFichier,
              extraction,
            })
            if (releveRes.ok) {
              console.warn(
                `[process-document] releve_bancaire: ${releveRes.nb_transactions} tx → releve ${releveRes.releve_id}, compte ${releveRes.compte_bancaire_id}${releveRes.created_account ? ' (compte créé)' : ''}`,
              )
            } else {
              console.warn(`[process-document] releve_bancaire skipped: ${releveRes.reason}`)
            }
          } catch (e: any) {
            console.error('[process-document] processReleveBancaire threw:', e?.message)
          }
        }

        // Step 6d: Auto-création de note de frais
        if (societeId && isPetitePiece && (confianceExtraction === null || confianceExtraction >= 30)) {
          try {
            const noteRes = await autoCreateNoteDeFrais(supabase, {
              societe_id: societeId,
              dossier_id: doc.dossier_id,
              user_id: doc.uploaded_by || null,
              resolve_employe_from_user: true,
              vendor: typeof extraction.emetteur === 'string'
                ? extraction.emetteur
                : (extraction.emetteur?.nom || extraction.emetteur?.name || null),
              date_facture: parseDateAny(extraction.date_document || extraction.date_facture),
              montant_ttc: rawTtc || null,
              devise: normalizeDevise(extraction.devise),
              categorie: categorieSuggeree,
              description: descriptionLibre,
              document_id: documentId,
              ocr_raw: { routing: parsed.routing, extraction },
              ocr_source: 'documents-process',
              ocr_confidence: confianceExtraction !== null ? confianceExtraction / 100 : null,
              statut: 'brouillon',
            })
            if (noteRes.ok) {
              console.warn(`[process-document] note_de_frais auto-créée ${noteRes.id} (${typeDoc}, catégorie=${categorieSuggeree || 'divers'})`)
            } else {
              console.warn(`[process-document] note_de_frais skip: ${noteRes.error}`)
            }
          } catch (e: any) {
            console.error('[process-document] autoCreateNoteDeFrais threw:', e?.message)
          }
        }
      }
    }

    return {
      ok: true,
      type_document: typeDoc,
      societe_detectee: societe,
      format_detecte: formatDetecte,
      confiance_extraction: confianceExtraction,
      description_libre: descriptionLibre,
      categorie_suggeree: categorieSuggeree,
      statut: finalStatut,
      processing_time_ms: duration,
      warnings: pipelineWarnings.length > 0 ? pipelineWarnings : undefined,
    }
  } catch (e: any) {
    const msg = e?.message || 'Unknown error'
    console.error(`[process-document] ERROR: ${msg}`, e?.stack)
    return { ok: false, error: msg }
  }
}
