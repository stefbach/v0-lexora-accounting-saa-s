import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function processDocument(params: {
  document_id: string
  storage_path: string
  nom_fichier: string
  client_id: string
  societe?: string
}) {
  const { document_id, storage_path, nom_fichier, societe } = params
  const supabase = getSupabase()

  // Update status
  await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', document_id)

  // Download file
  const { data: fileData, error: dlError } = await supabase.storage.from('documents').download(storage_path)
  if (dlError || !fileData) {
    throw new Error(`Download failed: ${dlError?.message}`)
  }

  // Prepare content
  const ext = nom_fichier.split('.').pop()?.toLowerCase() || ''
  const isVisual = ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)
  const base64 = Buffer.from(await fileData.arrayBuffer()).toString('base64')
  const mediaType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'

  // --- Pré-passe Mistral OCR (si configuré) sur les documents visuels :
  // PDF/image → markdown, que Claude classe ensuite. Fallback transparent sur
  // la vision Claude si Mistral est indisponible ou échoue.
  let ocrMarkdown: string | null = null
  if (isVisual) {
    const { mistralOcrAvailable, ocrToMarkdown } = await import('@/lib/ai/mistral-ocr')
    if (mistralOcrAvailable()) {
      const ocr = await ocrToMarkdown({ data: base64, mimeType: mediaType })
      if (ocr.ok && ocr.markdown.trim().length > 30) {
        ocrMarkdown = ocr.markdown
        console.warn(`[processDocument] Mistral OCR: ${ocr.markdown.length} chars, ${ocr.pagesProcessed} pages`)
      }
    }
  }

  // Call Anthropic
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const contentBlock = ext === 'pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: base64 } }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    temperature: 0,
    system: `Tu es un expert-comptable mauricien (PCM 4-digits, multi-devise MUR/EUR/USD/GBP). Analyse ce document et retourne UN JSON (sans markdown, sans backticks) avec :

{
  "type_document": "facture_fournisseur|facture_client|releve_bancaire|fiche_paie|charges_sociales|ticket_caisse|bordereau_mra|bon_livraison|contrat|autre",
  "societe_detectee": "<nom de la société destinataire ou null>",
  "vendor_emetteur": "<nom de l'émetteur si facture>",
  "date_document": "<YYYY-MM-DD ou null>",
  "montant_ttc": <nombre ou null>,
  "devise": "<MUR|EUR|USD|GBP>",
  "confidence": <0.0-1.0>,
  "summary": "<1 ligne décrivant le doc>"
}

Règles : pas de markdown, pas de backticks, JSON strict uniquement. Si illisible, tous null + confidence < 0.3.`,
    messages: [{
      role: 'user',
      content: ocrMarkdown
        ? `Analyse ce document comptable. Voici son texte OCR (extrait via Mistral OCR) :\n\n---DEBUT_DOCUMENT---\n${ocrMarkdown}\n---FIN_DOCUMENT---`
        : isVisual
          ? [contentBlock, { type: 'text' as const, text: 'Analyse ce document comptable.' }]
          : `Analyse ce document: ${await fileData.text()}`
    }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text).join('')

  let parsed: any
  try {
    parsed = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
  } catch {
    parsed = { routing: { type_document: 'autre', societe: 'INCONNU', confiance_type: 0 }, extraction: {} }
  }

  const typeDoc = parsed.routing?.type_document || 'autre'
  const detectedSociete = societe || parsed.routing?.societe || 'INCONNU'
  const extraction = parsed.extraction || {}

  // Save results
  const updateData: any = {
    type_document: typeDoc,
    statut: 'traite',
    n8n_result: { routing: parsed.routing, extraction, metadata: { model: 'claude-haiku-4-5-20251001' } },
  }
  if (detectedSociete !== 'INCONNU') updateData.societe_detectee = detectedSociete
  await supabase.from('documents').update(updateData).eq('id', document_id)

  // Auto-create accounting entries
  // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on insère direct dans V2.
  // V2 exige societe_id (NOT NULL) → on le récupère via le dossier du document.
  // Renommage : compte → numero_compte, debit → debit_mur, credit → credit_mur.
  const ecritures = extraction.ecritures_comptables
  if (Array.isArray(ecritures) && ecritures.length > 0) {
    const { data: doc } = await supabase.from('documents').select('dossier_id').eq('id', document_id).single()
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
          libelle: e.libelle || nom_fichier,
          debit_mur: Number(e.debit) || 0,
          credit_mur: Number(e.credit) || 0,
          piece_justificative: document_id,
        }))
      if (entries.length > 0 && societeId) {
        await supabase.from('ecritures_comptables_v2').insert(entries)
      } else if (entries.length > 0 && !societeId) {
        console.warn(`[processDocument] Skipping ecritures insert: dossier ${doc.dossier_id} has no societe_id`)
      }
    }
  }

  console.warn(`[processDocument] Done: ${typeDoc} / ${detectedSociete}`)
}
