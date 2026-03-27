import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { DocumentType, Societe } from '@/lib/types'

// Allow up to 60 seconds for AI processing on Vercel
export const maxDuration = 60

// ---------------------------------------------------------------------------
// Supabase admin client (service role – bypasses RLS)
// ---------------------------------------------------------------------------
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Variables Supabase manquantes (URL ou clé service)')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY non configurée')
  }
  return new Anthropic({ apiKey })
}

// ---------------------------------------------------------------------------
// System prompts (simplified – will be refactored into a dedicated file later)
// ---------------------------------------------------------------------------

const PROMPT_ROUTING = `Tu es un assistant comptable expert. Analyse le document fourni et détecte :
1. La **société ou personne** émettrice ou destinataire du document. Cherche le nom dans l'en-tête, le pied de page, le destinataire ou l'émetteur.
2. Le **type de document** parmi : facture_fournisseur, facture_client, releve_bancaire, charges_sociales, fiche_paie, contrat, autre.

IMPORTANT: Réponds UNIQUEMENT en JSON valide. Pas de markdown, pas de backticks, pas d'explication. Juste le JSON brut.
{
  "societe": "<nom de la société détectée ou INCONNU>",
  "type_document": "<facture_fournisseur|facture_client|releve_bancaire|charges_sociales|fiche_paie|contrat|autre>",
  "confiance_societe": <0-100>,
  "confiance_type": <0-100>,
  "indices": "<éléments du document ayant permis la détection>"
}`

const PROMPT_FACTURE_FOURNISSEUR = `Tu es un assistant comptable expert. Extrais les données de cette facture fournisseur.

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "fournisseur": { "nom": "", "brn": "", "numero_tva": "", "adresse": "" },
  "facture": { "numero": "", "date": "", "date_echeance": "", "devise": "MUR" },
  "lignes": [{ "description": "", "quantite": 0, "prix_unitaire": 0, "montant_ht": 0, "taux_tva": 0, "montant_tva": 0, "montant_ttc": 0 }],
  "totaux": { "total_ht": 0, "total_tva": 0, "total_ttc": 0 },
  "ecritures_suggerees": [{ "compte": "", "libelle": "", "debit": 0, "credit": 0 }]
}`

const PROMPT_FACTURE_CLIENT = `Tu es un assistant comptable expert. Extrais les données de cette facture client (émise par la société).

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "client": { "nom": "", "brn": "", "adresse": "" },
  "facture": { "numero": "", "date": "", "date_echeance": "", "devise": "MUR" },
  "lignes": [{ "description": "", "quantite": 0, "prix_unitaire": 0, "montant_ht": 0, "taux_tva": 0, "montant_tva": 0, "montant_ttc": 0 }],
  "totaux": { "total_ht": 0, "total_tva": 0, "total_ttc": 0 },
  "ecritures_suggerees": [{ "compte": "", "libelle": "", "debit": 0, "credit": 0 }]
}`

const PROMPT_RELEVE_BANCAIRE = `Tu es un assistant comptable expert. Extrais les données de ce relevé bancaire.

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "banque": "",
  "compte": { "numero": "", "titulaire": "", "devise": "MUR" },
  "periode": { "debut": "", "fin": "" },
  "solde_ouverture": 0,
  "solde_cloture": 0,
  "transactions": [{ "date": "", "description": "", "reference": "", "debit": 0, "credit": 0, "solde": 0 }],
  "total_debits": 0,
  "total_credits": 0,
  "rapprochement": { "nombre_transactions": 0, "solde_verifie": true }
}`

const PROMPT_CHARGES_SOCIALES = `Tu es un assistant comptable expert à Maurice. Extrais les données de ce document de charges sociales (NPF, HRDC, NPS, PAYE).

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "organisme": "",
  "periode": "",
  "societe": "",
  "charges": {
    "npf": { "base": 0, "taux": 0, "montant_employeur": 0, "montant_employe": 0, "total": 0 },
    "hrdc": { "base": 0, "taux": 0, "montant": 0 },
    "nps": { "base": 0, "taux": 0, "montant_employeur": 0, "montant_employe": 0, "total": 0 },
    "paye": { "base_imposable": 0, "montant": 0 }
  },
  "total_charges_employeur": 0,
  "total_charges_employe": 0,
  "total_general": 0,
  "ecritures_suggerees": [{ "compte": "", "libelle": "", "debit": 0, "credit": 0 }]
}`

const PROMPT_FICHE_PAIE = `Tu es un assistant comptable expert à Maurice. Extrais les données de cette fiche de paie.

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "employe": { "nom": "", "poste": "", "numero": "" },
  "periode": "",
  "salaire_base": 0,
  "indemnites": [{ "description": "", "montant": 0 }],
  "brut": 0,
  "deductions": {
    "npf_employe": 0,
    "nps_employe": 0,
    "paye": 0,
    "autres": [{ "description": "", "montant": 0 }]
  },
  "total_deductions": 0,
  "net_a_payer": 0,
  "charges_patronales": {
    "npf_employeur": 0,
    "nps_employeur": 0,
    "hrdc": 0
  },
  "ecritures_suggerees": [{ "compte": "", "libelle": "", "debit": 0, "credit": 0 }]
}`

const PROCESSING_PROMPTS: Record<string, string> = {
  facture_fournisseur: PROMPT_FACTURE_FOURNISSEUR,
  facture_client: PROMPT_FACTURE_CLIENT,
  releve_bancaire: PROMPT_RELEVE_BANCAIRE,
  charges_sociales: PROMPT_CHARGES_SOCIALES,
  fiche_paie: PROMPT_FICHE_PAIE,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retry wrapper for Anthropic API calls (handles 529 overloaded errors) */
async function callWithRetry(
  anthropic: Anthropic,
  params: Parameters<typeof anthropic.messages.create>[0],
  maxRetries = 3,
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params)
    } catch (e: any) {
      const status = e?.status || e?.error?.status
      if ((status === 529 || status === 529) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000 // 2s, 4s, 8s
        console.log(`[documents/process] API overloaded, retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

/** Map file extension to a media type Claude understands. */
function getMediaType(filename: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'pdf':
      return 'application/pdf'
    default:
      return 'application/pdf'
  }
}

function isVisualDocument(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext || '')
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let parsedDocumentId: string | null = null

  try {
    // ---- 1. Parse & validate input ----------------------------------------
    const body = await request.json()
    const { document_id, storage_path, nom_fichier, client_id, societe } = body as {
      document_id: string
      storage_path: string
      nom_fichier: string
      client_id: string
      societe?: string
    }

    if (!document_id || !storage_path || !nom_fichier || !client_id) {
      return NextResponse.json(
        { error: 'Paramètres manquants : document_id, storage_path, nom_fichier et client_id sont requis' },
        { status: 400 },
      )
    }

    parsedDocumentId = document_id
    console.log(`[documents/process] Début du traitement – document_id=${document_id}, fichier=${nom_fichier}`)

    const supabase = getAdminClient()
    const anthropic = getAnthropicClient()

    // ---- 2. Update status to en_cours -------------------------------------
    await supabase
      .from('documents')
      .update({ statut: 'en_cours' })
      .eq('id', document_id)

    // ---- 3. Download file from Supabase Storage ---------------------------
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storage_path)

    if (downloadError || !fileData) {
      console.error(`[documents/process] Erreur téléchargement : ${downloadError?.message}`)
      await markError(supabase, document_id, 'Impossible de télécharger le fichier depuis le stockage')
      return NextResponse.json(
        { error: 'Échec du téléchargement du fichier', details: downloadError?.message },
        { status: 500 },
      )
    }

    // ---- 4. Prepare file content for Claude --------------------------------
    const isVisual = isVisualDocument(nom_fichier)
    const isXlsx = nom_fichier.toLowerCase().endsWith('.xlsx')

    let fileBase64: string | null = null
    let textContent: string | null = null

    if (isVisual) {
      const arrayBuffer = await fileData.arrayBuffer()
      fileBase64 = Buffer.from(arrayBuffer).toString('base64')
    } else if (isXlsx) {
      // XLSX files need text extraction – for now we note this limitation
      textContent = '[Fichier XLSX détecté – extraction de texte requise. Veuillez fournir un PDF ou une image pour un traitement optimal.]'
      console.warn(`[documents/process] Fichier XLSX détecté (${nom_fichier}) – extraction de texte limitée`)
    } else {
      // Fallback: try to read as text
      textContent = await fileData.text()
    }

    // ---- 5. Single AI call — classify + extract in one shot (fast!) ----------
    const FAST_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

    const COMBINED_PROMPT = `Tu es un assistant comptable expert. Analyse ce document et retourne UN SEUL JSON avec:
1. "routing": classification du document
2. "extraction": données extraites

IMPORTANT: Réponds UNIQUEMENT en JSON valide. Pas de markdown, pas de backticks.
{
  "routing": {
    "societe": "<nom de la société/personne détectée ou INCONNU>",
    "type_document": "<facture_fournisseur|facture_client|releve_bancaire|charges_sociales|fiche_paie|contrat|autre>",
    "confiance_type": <0-100>,
    "indices": "<éléments clés détectés>"
  },
  "extraction": {
    "emetteur": "<nom de l'émetteur>",
    "destinataire": "<nom du destinataire>",
    "date": "<date du document>",
    "numero": "<numéro de facture/document>",
    "devise": "<EUR|MUR|GBP|USD>",
    "montant_total": <montant total>,
    "montant_ht": <montant HT si applicable>,
    "montant_tva": <montant TVA si applicable>,
    "lignes": [{"description": "", "quantite": 0, "montant": 0}],
    "ecritures_suggerees": [{"compte": "", "libelle": "", "debit": 0, "credit": 0}]
  }
}`

    console.log(`[documents/process] Analyse avec ${FAST_MODEL}...`)

    const messages = buildMessages(
      'Analyse ce document comptable. Classifie-le et extrais les données.',
      fileBase64,
      nom_fichier,
      textContent,
    )

    const response = await callWithRetry(anthropic, {
      model: FAST_MODEL,
      max_tokens: 2048,
      temperature: 0,
      system: COMBINED_PROMPT,
      messages,
    })

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    console.log(`[documents/process] Résultat : ${responseText.substring(0, 300)}`)

    let parsed: { routing?: any; extraction?: any } = {}
    try {
      const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.error(`[documents/process] Parsing failed: ${responseText.substring(0, 200)}`)
      parsed = {
        routing: { societe: 'INCONNU', type_document: 'autre', confiance_type: 0, indices: 'parsing failed' },
        extraction: { raw_response: responseText },
      }
    }

    const routingResult = parsed.routing || { societe: 'INCONNU', type_document: 'autre', confiance_type: 0, indices: '' }
    const processingResult = parsed.extraction || {}
    const detectedSociete = (societe || routingResult.societe || 'INCONNU') as string
    const detectedType = (routingResult.type_document || 'autre') as DocumentType

    console.log(`[documents/process] Classifié: type=${detectedType}, société=${detectedSociete}, confiance=${routingResult.confiance_type}%`)

    // ---- 6. Save results to database ---------------------------------------
    const n8nResult = {
      routing: routingResult,
      extraction: processingResult,
      metadata: {
        processed_at: new Date().toISOString(),
        processing_time_ms: Date.now() - startTime,
        model: FAST_MODEL,
        nom_fichier,
      },
    }

    const updatePayload: Record<string, unknown> = {
      n8n_result: n8nResult,
      type_document: detectedType,
      statut: 'traite' as const,
    }

    if (detectedSociete !== 'INCONNU') {
      updatePayload.societe_detectee = detectedSociete
    }

    const { error: updateError } = await supabase
      .from('documents')
      .update(updatePayload)
      .eq('id', document_id)

    if (updateError) {
      console.error(`[documents/process] Erreur mise à jour document : ${updateError.message}`)
      return NextResponse.json(
        { error: 'Erreur lors de la sauvegarde des résultats', details: updateError.message },
        { status: 500 },
      )
    }

    const duration = Date.now() - startTime
    console.log(`[documents/process] Traitement terminé en ${duration}ms – document_id=${document_id}`)

    // ---- 8. Return result ---------------------------------------------------
    return NextResponse.json({
      success: true,
      document_id,
      societe_detectee: detectedSociete,
      type_document: detectedType,
      confiance: {
        societe: routingResult.confiance_societe,
        type: routingResult.confiance_type,
      },
      result: processingResult,
      processing_time_ms: duration,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    const stack = e instanceof Error ? e.stack : undefined
    console.error(`[documents/process] Erreur inattendue : ${message}`, stack)

    // Mark document as error if we have the id
    if (parsedDocumentId) {
      try {
        const supabase = getAdminClient()
        await markError(supabase, parsedDocumentId, message)
      } catch {
        // Ignore – best effort
      }
    }

    return NextResponse.json(
      { error: 'Erreur lors du traitement du document', details: message },
      { status: 500 },
    )
  }
}

// ---------------------------------------------------------------------------
// Build Claude messages with vision or text content
// ---------------------------------------------------------------------------
function buildMessages(
  userText: string,
  fileBase64: string | null,
  filename: string,
  textContent: string | null,
): Anthropic.MessageParam[] {
  if (fileBase64) {
    const mediaType = getMediaType(filename)

    // PDF uses document type, images use image type
    if (mediaType === 'application/pdf') {
      return [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
            },
            { type: 'text', text: userText },
          ],
        },
      ]
    }

    // Image files
    return [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: fileBase64 },
          },
          { type: 'text', text: userText },
        ],
      },
    ]
  }

  // Text-only fallback
  const content = textContent
    ? `${userText}\n\n--- Contenu du document (${filename}) ---\n${textContent}`
    : userText

  return [{ role: 'user', content }]
}

// ---------------------------------------------------------------------------
// Mark a document as erreur in the database
// ---------------------------------------------------------------------------
async function markError(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  errorMessage: string,
) {
  try {
    await supabase
      .from('documents')
      .update({
        statut: 'erreur',
        n8n_result: {
          error: errorMessage,
          failed_at: new Date().toISOString(),
        },
      })
      .eq('id', documentId)
  } catch (e) {
    console.error(`[documents/process] Impossible de marquer le document en erreur : ${e}`)
  }
}
