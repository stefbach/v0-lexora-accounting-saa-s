import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
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

    // Step 1: Update status
    await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', documentId)

    // Step 2: Download file
    const { data: fileData, error: dlError } = await supabase.storage.from('documents').download(storagePath)
    if (dlError || !fileData) {
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: `Download failed: ${dlError?.message}` } }).eq('id', documentId)
      return NextResponse.json({ error: 'Download failed', details: dlError?.message }, { status: 500 })
    }

    // Step 3: Prepare content
    const ext = nomFichier.split('.').pop()?.toLowerCase() || ''
    const isVisual = ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const mediaType = ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : 'image/jpeg'

    // Step 4: Call Anthropic
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const contentBlock = ext === 'pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: base64 } }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
    const societe = parsed.routing?.societe || 'INCONNU'
    const extraction = parsed.extraction || {}
    const duration = Date.now() - startTime

    // Step 5: Save results
    const updateData: any = {
      type_document: typeDoc,
      statut: 'traite',
      n8n_result: { routing: parsed.routing, extraction, metadata: { processing_time_ms: duration, model: 'claude-haiku-4-5-20251001' } },
    }
    if (societe !== 'INCONNU') updateData.societe_detectee = societe

    await supabase.from('documents').update(updateData).eq('id', documentId)

    // Step 6: Auto-create accounting entries
    const ecritures = extraction.ecritures_comptables
    if (Array.isArray(ecritures) && ecritures.length > 0) {
      const { data: doc } = await supabase.from('documents').select('dossier_id').eq('id', documentId).single()
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
            libelle: e.libelle || nomFichier,
            debit: Number(e.debit) || 0,
            credit: Number(e.credit) || 0,
            piece_justificative: documentId,
          }))
        if (entries.length > 0) {
          await supabase.from('ecritures_comptables').insert(entries)
        }
      }
    }

    return NextResponse.json({ success: true, type_document: typeDoc, societe_detectee: societe, processing_time_ms: duration })

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
