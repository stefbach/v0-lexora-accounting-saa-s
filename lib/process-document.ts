import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL } from '@/lib/claude'

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

  // Call Anthropic
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const contentBlock = ext === 'pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: base64 } }

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    temperature: 0,
    system: `Tu es un expert-comptable. Analyse ce document et retourne UN JSON (sans markdown, sans backticks):
{
  "routing": {
    "societe": "<nom société ou INCONNU>",
    "type_document": "<facture_fournisseur|facture_client|releve_bancaire|charges_sociales|fiche_paie|contrat|autre>",
    "confiance_type": <0-100>
  },
  "extraction": {
    "emetteur": "",
    "destinataire": "",
    "date_document": "",
    "numero_reference": "",
    "devise": "",
    "montant_ht": 0,
    "montant_tva": 0,
    "montant_ttc": 0,
    "lignes": [{"description": "", "montant": 0}],
    "ecritures_comptables": [{"compte": "", "libelle": "", "debit": 0, "credit": 0}]
  }
}`,
    messages: [{
      role: 'user',
      content: isVisual
        ? [contentBlock, { type: 'text' as const, text: 'Analyse ce document comptable.' }]
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

  const typeDoc = parsed.routing?.type_document || 'autre'
  const detectedSociete = societe || parsed.routing?.societe || 'INCONNU'
  const extraction = parsed.extraction || {}

  // Save results
  const updateData: any = {
    type_document: typeDoc,
    statut: 'traite',
    n8n_result: { routing: parsed.routing, extraction, metadata: { model: CLAUDE_MODEL } },
  }
  if (detectedSociete !== 'INCONNU') updateData.societe_detectee = detectedSociete
  await supabase.from('documents').update(updateData).eq('id', document_id)

  // Auto-create accounting entries
  const ecritures = extraction.ecritures_comptables
  if (Array.isArray(ecritures) && ecritures.length > 0) {
    const { data: doc } = await supabase.from('documents').select('dossier_id').eq('id', document_id).single()
    if (doc?.dossier_id) {
      const journalMap: Record<string, string> = { facture_fournisseur: 'ACH', facture_client: 'VTE', releve_bancaire: 'BNQ' }
      const entries = ecritures
        .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
        .map((e: any) => ({
          dossier_id: doc.dossier_id,
          date_ecriture: extraction.date_document || new Date().toISOString().split('T')[0],
          journal: journalMap[typeDoc] || 'OD',
          numero_piece: extraction.numero_reference || null,
          compte: String(e.compte),
          libelle: e.libelle || nom_fichier,
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0,
          piece_justificative: document_id,
        }))
      if (entries.length > 0) {
        await supabase.from('ecritures_comptables').insert(entries)
      }
    }
  }

  console.log(`[processDocument] Done: ${typeDoc} / ${detectedSociete}`)
}
