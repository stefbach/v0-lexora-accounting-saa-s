import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurée')
  return new Anthropic({ apiKey })
}

async function callWithRetry(
  anthropic: Anthropic,
  params: Parameters<typeof anthropic.messages.create>[0],
  maxRetries = 2,
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params)
    } catch (e: any) {
      const status = e?.status
      if (status === 529 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000
        console.log(`[process-document] API overloaded, retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

function getMediaType(filename: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    default: return 'application/pdf'
  }
}

function buildMessages(
  userText: string,
  fileBase64: string | null,
  filename: string,
  textContent: string | null,
): Anthropic.MessageParam[] {
  if (fileBase64) {
    const mediaType = getMediaType(filename)
    if (mediaType === 'application/pdf') {
      return [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } },
        { type: 'text', text: userText },
      ]}]
    }
    return [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } },
      { type: 'text', text: userText },
    ]}]
  }
  const content = textContent ? `${userText}\n\n--- Contenu (${filename}) ---\n${textContent}` : userText
  return [{ role: 'user', content }]
}

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
    "emetteur": "<nom>",
    "destinataire": "<nom>",
    "date": "<date>",
    "numero": "<numéro>",
    "devise": "<EUR|MUR|GBP|USD>",
    "montant_total": <number>,
    "montant_ht": <number>,
    "montant_tva": <number>,
    "lignes": [{"description": "", "quantite": 0, "montant": 0}],
    "ecritures_suggerees": [{"compte": "", "libelle": "", "debit": 0, "credit": 0}]
  }
}`

export interface ProcessResult {
  success: boolean
  document_id: string
  type_document: string
  societe_detectee: string
  processing_time_ms: number
  error?: string
}

/**
 * Process a document: download from storage, classify with AI, extract data, save results.
 * Call this directly — no HTTP needed.
 */
export async function processDocument(params: {
  document_id: string
  storage_path: string
  nom_fichier: string
  client_id: string
  societe?: string
}): Promise<ProcessResult> {
  const { document_id, storage_path, nom_fichier, societe } = params
  const startTime = Date.now()
  const supabase = getSupabase()

  try {
    // Update status
    await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', document_id)

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage.from('documents').download(storage_path)
    if (downloadError || !fileData) {
      const msg = `Impossible de télécharger: ${downloadError?.message || 'fichier introuvable'}`
      await markError(supabase, document_id, msg)
      return { success: false, document_id, type_document: 'autre', societe_detectee: 'INCONNU', processing_time_ms: Date.now() - startTime, error: msg }
    }

    // Prepare content
    const ext = nom_fichier.split('.').pop()?.toLowerCase()
    const isVisual = ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext || '')
    let fileBase64: string | null = null
    let textContent: string | null = null

    if (isVisual) {
      fileBase64 = Buffer.from(await fileData.arrayBuffer()).toString('base64')
    } else if (ext === 'xlsx') {
      textContent = '[Fichier XLSX – extraction limitée]'
    } else {
      textContent = await fileData.text()
    }

    // AI call
    const anthropic = getAnthropic()
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
    console.log(`[process-document] Analysing ${nom_fichier} with ${model}...`)

    const response = await callWithRetry(anthropic, {
      model,
      max_tokens: 2048,
      temperature: 0,
      system: COMBINED_PROMPT,
      messages: buildMessages('Analyse ce document comptable. Classifie-le et extrais les données.', fileBase64, nom_fichier, textContent),
    })

    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('')

    let parsed: { routing?: any; extraction?: any } = {}
    try {
      parsed = JSON.parse(responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
    } catch {
      parsed = {
        routing: { societe: 'INCONNU', type_document: 'autre', confiance_type: 0, indices: 'parsing failed' },
        extraction: { raw_response: responseText.substring(0, 500) },
      }
    }

    const routing = parsed.routing || { societe: 'INCONNU', type_document: 'autre', confiance_type: 0 }
    const extraction = parsed.extraction || {}
    const detectedSociete = (societe || routing.societe || 'INCONNU') as string
    const detectedType = (routing.type_document || 'autre') as string
    const duration = Date.now() - startTime

    // Save results
    const updatePayload: Record<string, unknown> = {
      n8n_result: { routing, extraction, metadata: { processed_at: new Date().toISOString(), processing_time_ms: duration, model, nom_fichier } },
      type_document: detectedType,
      statut: 'traite',
    }
    if (detectedSociete !== 'INCONNU') updatePayload.societe_detectee = detectedSociete

    const { error: updateError } = await supabase.from('documents').update(updatePayload).eq('id', document_id)
    if (updateError) {
      console.error(`[process-document] DB update error: ${updateError.message}`)
    }

    console.log(`[process-document] Done in ${duration}ms: type=${detectedType}, société=${detectedSociete}`)
    return { success: true, document_id, type_document: detectedType, societe_detectee: detectedSociete, processing_time_ms: duration }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    console.error(`[process-document] Error: ${msg}`)
    await markError(supabase, document_id, msg)
    return { success: false, document_id, type_document: 'autre', societe_detectee: 'INCONNU', processing_time_ms: Date.now() - startTime, error: msg }
  }
}

async function markError(supabase: ReturnType<typeof getSupabase>, documentId: string, errorMessage: string) {
  try {
    await supabase.from('documents').update({
      statut: 'erreur',
      n8n_result: { error: errorMessage, failed_at: new Date().toISOString() },
    }).eq('id', documentId)
  } catch {}
}
