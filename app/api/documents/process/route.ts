import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'
import { getTauxChange } from '@/lib/taux-change'
import { processReleveBancaire } from '@/lib/bank/process-releve'
import { autoCreateNoteDeFrais } from '@/lib/expenses/auto-create'

// Mapping types canoniques étendus (cf. migration 283).
// On accepte désormais ticket / recu / bon_livraison en plus des classiques,
// pour gérer les photos Telegram de pièces commerciales non structurées.
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

// MIME images supportés par Anthropic vision. HEIC/HEIF fallback en jpeg
// (best-effort, sinon le call lèvera une erreur métier propre).
const SUPPORTED_IMAGE_MIMES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

// Limite vision Anthropic recommandée (~5 Mo en base64 ≈ ~3.7 Mo binaire).
// Au-dessus on log un warning ; on ne resize pas (sharp non installé).
const ANTHROPIC_IMAGE_SOFT_LIMIT_BYTES = 5 * 1024 * 1024
const ANTHROPIC_IMAGE_HARD_LIMIT_BYTES = 10 * 1024 * 1024

function parseDateAny(raw: any): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  // Déjà ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0'), yy = m[3]
    return `${yy}-${mm}-${dd}`
  }
  // YYYY/MM/DD
  m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/)
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  // Fallback : Date.parse
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
  // Match prefix/exact
  for (const [k, v] of Object.entries(DEVISE_SYMBOL_MAP)) {
    if (s === k.toUpperCase() || s.startsWith(k.toUpperCase())) return v
  }
  return s.slice(0, 5)
}

export const maxDuration = 300

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  // Auth : soit session web (auth.getUser), soit X-Internal-Token (bot Telegram, n8n)
  const internalToken = request.headers.get('x-internal-token')
  const isInternal = !!internalToken && internalToken === process.env.INTERNAL_API_TOKEN
  if (!isInternal) {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  let documentId = ''

  try {
    const body = await request.json()
    documentId = body.document_id
    const storagePath = body.storage_path
    const nomFichier = body.nom_fichier

    if (!documentId || !storagePath || !nomFichier) {
      return NextResponse.json({ error: 'Paramètres manquants', received: body }, { status: 400 })
    }

    const supabase = getSupabase()

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
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: `Download failed: ${dlError?.message}` } }).eq('id', documentId)
      return NextResponse.json({ error: 'Download failed', details: dlError?.message }, { status: 500 })
    }

    // Step 3: Prepare content
    // On accepte un panel large d'images mobiles (jpg/jpeg/png/webp/gif/heic).
    // HEIC : Anthropic vision ne le supporte pas nativement ; on bascule en
    // image/jpeg (best-effort, sinon erreur métier remontée par le catch).
    const ext = nomFichier.split('.').pop()?.toLowerCase() || ''
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)
    const isPdf = ext === 'pdf'
    const isVisual = isPdf || isImage
    const isExcel = ['xlsx', 'xls'].includes(ext)
    const arrayBuffer = await fileData.arrayBuffer()
    const fileSizeBytes = arrayBuffer.byteLength
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Avertissement si fichier trop volumineux pour la vision Anthropic.
    // Sans `sharp` installé, on ne peut pas resize côté serveur — on log
    // et on poursuit ; le call Anthropic peut échouer naturellement et
    // sera attrapé par le try/catch principal.
    const imageTooLarge = isImage && fileSizeBytes > ANTHROPIC_IMAGE_SOFT_LIMIT_BYTES
    const imageHardOversize = isImage && fileSizeBytes > ANTHROPIC_IMAGE_HARD_LIMIT_BYTES
    if (imageTooLarge) {
      console.warn(
        `[process] Image volumineuse (${Math.round(fileSizeBytes / 1024)} ko) > ${Math.round(ANTHROPIC_IMAGE_SOFT_LIMIT_BYTES / 1024)} ko — qualité OCR potentiellement dégradée`,
      )
    }

    // Pour les fichiers Excel, on parse le contenu en CSV/texte pour Claude
    // (vision Anthropic n'accepte pas les xlsx).
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

        // Détection intelligente : on cherche la feuille qui contient le plus
        // d'indices "facture". Évite de tomber sur une feuille de garde vide
        // ou un récap annuel qui contient un cumul cumulé.
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
          // Bonus si la feuille contient des chiffres (= a des données)
          if (/\d{3,}/.test(csv)) score += 2
          // Malus si la feuille est trop courte (= probablement vide ou garde)
          if (csv.length < 200) score -= 3
          // Malus si "recap", "cumul", "annuel" → probablement pas la facture cherchée
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
        excelText = `=== Feuille analysée : ${chosen.name} (score indices facture: ${chosen.score}/${FACTURE_KEYWORDS.length + 2}) ===\n${chosen.csv.slice(0, 24000)}`

        if (excelSheetCount > 1) {
          excelText = `[INFO : ce fichier Excel contient ${excelSheetCount} feuilles (${wb.SheetNames.join(', ')}). On a sélectionné automatiquement la feuille "${chosen.name}" qui contient le plus d'indices facture (score ${chosen.score}). NE PAS additionner les montants entre feuilles ; analyser uniquement cette feuille.]\n\n${excelText}`
        }
      } catch (e: any) {
        await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: `Parse XLSX failed: ${e?.message}` } }).eq('id', documentId)
        return NextResponse.json({ error: 'Parse XLSX failed', details: e?.message }, { status: 500 })
      }
    }

    // Détection MIME pour Anthropic vision (HEIC fallback jpeg).
    const imageMime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' =
      SUPPORTED_IMAGE_MIMES[ext] || 'image/jpeg'

    // Step 4: Call Anthropic
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const contentBlock = isPdf
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: imageMime, data: base64 } }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // 8k tokens : prévoit ~150 lignes de relevé bancaire en format compact.
      // Pour une facture / ticket, la réponse fait quelques centaines de tokens.
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
            ? `Voici le contenu d'un fichier Excel/CSV exporté d'un logiciel comptable. Sépareur de colonnes : ";".

RÈGLES STRICTES pour l'extraction des montants :
1. Le montant_ttc = UN SEUL montant final (le grand total de la facture). NE PAS additionner plusieurs lignes "Total" ou "Sous-total".
2. Si plusieurs montants candidats existent, choisis le PLUS GRAND qui apparaît UNE SEULE FOIS dans le document (= le grand total final), pas la somme des sous-totaux.
3. Si le fichier contient un récap ou un cumul annuel d'une part, ET le détail d'une seule facture d'autre part, prends UNIQUEMENT le total de la facture individuelle (pas le cumul).
4. Si tu n'es pas sûr, choisis le montant le plus petit cohérent plutôt que de risquer un cumul. Mets confiance_extraction faible (<60) pour signaler le doute.

DÉTECTION FACTURE :
Ce type d'export contient TRÈS souvent une facture. Cherche : en-tête émetteur, BRN, n° facture, destinataire, date, montants HT/TVA/TTC. Si tu vois "Facture"/"Invoice"/"N°"/"Montant" → c'est une facture, ne classe PAS en "autre". Applique la règle émetteur=MA société → facture_client.

CONTENU :
${excelText}`
            : `Analyse ce document: ${await fileData.text()}`
      }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('')

    let parsed: any = {}
    try {
      parsed = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
    } catch {
      parsed = { routing: { type_document: 'autre', societe: 'INCONNU', confiance_type: 0 }, extraction: {} }
    }

    let typeDoc = parsed.routing?.type_document || 'autre'
    // Whitelist défensif : si Claude renvoie un type non reconnu, on retombe
    // sur "autre" pour ne pas violer la CHECK constraint SQL.
    if (!ALLOWED_TYPE_DOCUMENT.has(typeDoc)) {
      console.warn(`[process] type_document inconnu "${typeDoc}" → "autre"`)
      typeDoc = 'autre'
    }
    const societe = parsed.routing?.societe || 'INCONNU'
    const formatDetecte = parsed.routing?.format_detecte || 'inconnu'
    const extraction = parsed.extraction || {}
    const duration = Date.now() - startTime

    // Confiance d'extraction (0-100) : permet au front d'alerter
    // l'utilisateur que le document mérite une revue manuelle.
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
    // que sa décision est cohérente avec MA société active. Si destinataire
    // = MA société → forcer fournisseur. Si émetteur = MA société → forcer
    // client. Évite les erreurs de classement quand le logo de l'autre
    // partie est plus visible.
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
          console.log(`[process] override: dest='${dest}' = me → forcing facture_fournisseur (Claude said ${typeDoc})`)
          typeDoc = 'facture_fournisseur'
        }
      } else if (matchesMe(emet) && !matchesMe(dest)) {
        if (typeDoc !== 'facture_client') {
          console.log(`[process] override: emet='${emet}' = me → forcing facture_client (Claude said ${typeDoc})`)
          typeDoc = 'facture_client'
        }
      }
    }

    // Catégorisation métier : ticket / recu / photo_mobile / recu_manuscrit =
    // "petite pièce" → alimente les notes de frais (PAS la table factures).
    const isPetitePiece =
      typeDoc === 'ticket' ||
      typeDoc === 'recu' ||
      formatDetecte === 'photo_mobile' ||
      formatDetecte === 'recu_manuscrit'
    const isBonLivraison = typeDoc === 'bon_livraison'
    const isReleveBancaire = typeDoc === 'releve_bancaire'

    // Step 5: Save results
    // Si confiance d'extraction faible (< 50), on classe quand même mais
    // on met le document en "en_attente_revue" pour signaler à l'utilisateur
    // qu'une vérification manuelle est conseillée avant tout impact comptable.
    const lowConfidence = confianceExtraction !== null && confianceExtraction < 50
    const finalStatut = lowConfidence ? 'en_attente_revue' : 'traite'

    const n8nResult: any = {
      routing: parsed.routing,
      extraction,
      metadata: {
        processing_time_ms: duration,
        model: 'claude-haiku-4-5-20251001',
        format_detecte: formatDetecte,
        confiance_extraction: confianceExtraction,
        file_size_bytes: fileSizeBytes,
        image_oversize: imageTooLarge || undefined,
        image_hard_oversize: imageHardOversize || undefined,
      },
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
    // ⚠️ Pour les factures (client/fournisseur), on SAUTE les écritures
    // brutes de Claude (elles sont souvent en devise étrangère sans conversion
    // MUR → fausses sur debit_mur/credit_mur). C'est `createEcrituresForFacture`
    // (helper canonique) qui génère les bonnes écritures avec conversion devise.
    // Pour relevé bancaire → on SAUTE aussi : les écritures BNQ seront générées
    // par le rapprochement automatique après matching des transactions.
    // Pour ticket/recu/bon_livraison/autre → pas d'écritures Claude (ces types
    // n'alimentent pas le grand-livre directement).
    // Pour charges sociales, fiches paie, etc. → on garde les écritures Claude.
    const isFactureType = typeDoc === 'facture_client' || typeDoc === 'facture_fournisseur'
    const skipClaudeEcritures =
      isFactureType || isReleveBancaire || isPetitePiece || isBonLivraison || typeDoc === 'autre'
    const ecritures = skipClaudeEcritures ? [] : (extraction.ecritures_comptables || [])
    {
      const { data: doc } = await supabase.from('documents').select('dossier_id, uploaded_by').eq('id', documentId).single()
      if (doc?.dossier_id) {
        // Lookup societe_id from dossier (NOT NULL on V2).
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
            debit_mur: Number(e.debit) || 0,
            credit_mur: Number(e.credit) || 0,
            piece_justificative: documentId,
          }))
        if (entries.length > 0 && societeId) {
          await supabase.from('ecritures_comptables_v2').insert(entries)
        } else if (entries.length > 0 && !societeId) {
          console.warn(`[process] Skipping ecritures insert: dossier ${doc.dossier_id} has no societe_id`)
        }

        // Pré-extraction des montants pour les checks d'INSERT factures
        // ET la création de note de frais (mutualisation).
        const rawTtc = Number(extraction.montant_ttc) || 0
        const rawHt = Number(extraction.montant_ht) || 0
        const rawTva = Number(extraction.montant_tva) || 0
        const hasAnyAmount = rawTtc > 0 || rawHt > 0 || rawTva > 0

        // Step 6b: Auto-create row in `factures` (table métier — alimente
        // /client/factures et le CA). On crée la facture uniquement pour les
        // types facture_client / facture_fournisseur, et seulement si on n'a
        // pas déjà créé une facture liée à ce document (idempotence).
        // SÉCURITÉ : on refuse l'INSERT si tous les montants sont à 0 →
        // l'extraction n'a rien donné, créer une facture à 0 polluerait
        // le journal.
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
            const ht = rawHt
            const tva = rawTva
            const ttc = rawTtc || (ht + tva) || 0
            const devise = normalizeDevise(extraction.devise)
            // taux_tva : priorité au champ explicite renvoyé par Claude.
            // Sinon, calcul depuis HT/TVA si TVA > 0. Sinon 0 (hors taxe).
            // NE PAS mettre 15 par défaut → le dashboard inférerait HT = TTC/1.15
            // et sous-estimerait le CA.
            const explicitTaux = extraction.taux_tva !== undefined ? Number(extraction.taux_tva) : null
            const taux = explicitTaux !== null && !isNaN(explicitTaux)
              ? explicitTaux
              : (ht > 0 && tva > 0 ? Number(((tva / ht) * 100).toFixed(2)) : 0)
            // Conversion en MUR pour alimenter le CA dashboard (qui somme montant_mur)
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
                console.warn('[process] getTauxChange failed:', e?.message)
              }
            }
            // Génère un numéro unique pour éviter la contrainte unique
            // (societe_id, numero_facture, type_facture).
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
            }).select('id').single()
            if (facErr) {
              console.error('[process] Insert factures failed:', facErr.message)
            } else if (facInserted) {
              // Génère les écritures comptables au format PCM Maurice via le
              // helper canonique (411/707 pour ventes, 401/607 pour achats,
              // + 4457/4456 TVA).
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
                console.error('[process] createEcrituresForFacture failed:', ecrRes.error)
              }
            }
          }
        } else if (societeId && isFactureType && !hasAnyAmount) {
          console.warn(`[process] Skip facture INSERT : document ${documentId} sans aucun montant détecté`)
        }

        // Step 6c: Auto-persist relevé bancaire (alimente /client/banque +
        // rapprochement). Symétrique de step 6b mais pour les relevés.
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
              console.log(
                `[process] releve_bancaire: ${releveRes.nb_transactions} tx → releve ${releveRes.releve_id}, compte ${releveRes.compte_bancaire_id}${releveRes.created_account ? ' (compte créé)' : ''}`,
              )
            } else {
              console.warn(`[process] releve_bancaire skipped: ${releveRes.reason}`)
            }
          } catch (e: any) {
            // Soft-fail : on garde le document en `traite` (l'OCR a réussi),
            // mais on log pour qu'un comptable puisse débuguer.
            console.error('[process] processReleveBancaire threw:', e?.message)
          }
        }

        // Step 6d: Auto-création de note de frais pour les tickets / reçus /
        // petites pièces (= isPetitePiece). On factorise via le helper
        // canonique `autoCreateNoteDeFrais` (idempotent : skip si une note
        // existe déjà pour ce document_id).
        // - Statut "brouillon" : l'employé/dirigeant doit valider depuis
        //   /client/notes-frais avant remboursement.
        // - Si confiance OCR < 30, on saute aussi : la note serait
        //   inexploitable et générerait du bruit pour le comptable.
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
              // ocr_confidence est attendu sur l'échelle 0-1 côté table
              // notes_de_frais (NUMERIC(3,2)) ; on divise par 100.
              ocr_confidence: confianceExtraction !== null ? confianceExtraction / 100 : null,
              statut: 'brouillon',
            })
            if (noteRes.ok) {
              console.log(`[process] note_de_frais auto-créée ${noteRes.id} (${typeDoc}, catégorie=${categorieSuggeree || 'divers'})`)
            } else {
              console.warn(`[process] note_de_frais skip: ${noteRes.error}`)
            }
          } catch (e: any) {
            // Soft-fail : on garde le document classé même si la note de
            // frais ne s'insère pas (FK manquante, RLS, etc.).
            console.error('[process] autoCreateNoteDeFrais threw:', e?.message)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      type_document: typeDoc,
      societe_detectee: societe,
      format_detecte: formatDetecte,
      confiance_extraction: confianceExtraction,
      description_libre: descriptionLibre,
      categorie_suggeree: categorieSuggeree,
      statut: finalStatut,
      processing_time_ms: duration,
      warning: lowConfidence ? 'Extraction peu fiable, vérification manuelle conseillée' : undefined,
    })

  } catch (e: any) {
    const msg = e?.message || 'Unknown error'
    console.error(`[process] ERROR: ${msg}`, e?.stack)

    if (documentId) {
      const supabase = getSupabase()
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: msg } }).eq('id', documentId)
    }

    return NextResponse.json({ error: msg, stack: e?.stack?.split('\n').slice(0, 5) }, { status: 500 })
  }
}
