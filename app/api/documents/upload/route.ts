import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const societeId = formData.get('societe_id') as string
    const dossierId = formData.get('dossier_id') as string | null

    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: 'Type non supporté' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Fichier trop volumineux' }, { status: 400 })

    const supabase = getAdminClient()

    // Resolve dossier_id
    let resolvedDossierId = dossierId
    if (!resolvedDossierId) {
      let q = supabase.from('dossiers').select('id').eq('client_id', user.id)
      if (societeId) q = q.eq('societe_id', societeId)
      const { data: d } = await q.limit(1).single()
      if (d) { resolvedDossierId = d.id }
      else {
        const { data: anyD } = await supabase.from('dossiers').select('id').eq('client_id', user.id).limit(1).single()
        if (anyD) { resolvedDossierId = anyD.id }
        else {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          const { data: newSoc } = await supabase.from('societes')
            .insert({ nom: `${profile?.full_name || user.email} — Personnel`, statut_tva: false }).select('id').single()
          if (newSoc) {
            const { data: nd } = await supabase.from('dossiers')
              .insert({ client_id: user.id, societe_id: newSoc.id, comptable_id: null }).select('id').single()
            resolvedDossierId = nd?.id || null
          }
        }
      }
      if (!resolvedDossierId) return NextResponse.json({ error: 'Impossible de créer un dossier' }, { status: 400 })
    }

    // Read file data ONCE — use for both storage upload and AI processing
    const fileArrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(fileArrayBuffer)
    const base64 = fileBuffer.toString('base64')

    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const typeFichier = ext === 'jpg' ? 'jpeg' : ext as 'pdf' | 'jpeg' | 'png' | 'xlsx'
    const storagePath = `${user.id}/${Date.now()}_${file.name}`

    // Upload to storage
    const { error: storageError } = await supabase.storage
      .from('documents').upload(storagePath, fileArrayBuffer, { contentType: file.type, upsert: false })
    if (storageError) return NextResponse.json({ error: `Upload: ${storageError.message}` }, { status: 500 })

    // Create document record with initial status
    const { data: doc, error: docError } = await supabase.from('documents').insert({
      dossier_id: resolvedDossierId, uploaded_by: user.id, nom_fichier: file.name,
      type_fichier: typeFichier, statut: 'en_cours', storage_path: storagePath,
      taille_fichier: file.size, societe_detectee: null, type_document: null,
    }).select().single()
    if (docError) return NextResponse.json({ error: `DB: ${docError.message}` }, { status: 500 })

    // === AI PROCESSING — no re-download needed, use base64 from above ===
    let typeDocument = 'autre'
    let detectedSociete = 'INCONNU'
    try {
      const isVisual = ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)
      const mediaType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'

      const contentBlock = ext === 'pdf'
        ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
        : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: base64 } }

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        temperature: 0,
        system: `Tu es un expert-comptable. Analyse ce document et retourne UNIQUEMENT un JSON valide (pas de markdown, pas de backticks, pas de texte avant ou après):
{"routing":{"societe":"<nom de la société ou personne ou INCONNU>","type_document":"<facture_fournisseur|facture_client|releve_bancaire|charges_sociales|fiche_paie|contrat|autre>","confiance_type":0},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"","montant_ht":0,"montant_tva":0,"montant_ttc":0,"lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"","libelle":"","debit":0,"credit":0}]}}`,
        messages: [{ role: 'user', content: isVisual
          ? [contentBlock, { type: 'text' as const, text: 'Analyse ce document comptable.' }]
          : `Analyse ce document comptable:\n${fileBuffer.toString('utf-8').substring(0, 5000)}` }],
      })

      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
      let parsed: any = {}
      try { parsed = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()) } catch { parsed = {} }

      typeDocument = parsed.routing?.type_document || 'autre'
      detectedSociete = parsed.routing?.societe || 'INCONNU'
      const extraction = parsed.extraction || {}

      const updateData: any = { type_document: typeDocument, statut: 'traite',
        n8n_result: { routing: parsed.routing, extraction, metadata: { model: 'claude-haiku-4-5-20251001', processed_at: new Date().toISOString() } } }
      if (detectedSociete !== 'INCONNU') updateData.societe_detectee = detectedSociete
      await supabase.from('documents').update(updateData).eq('id', doc.id)

      // Auto-create accounting entries from extracted data
      const ecritures = extraction.ecritures_comptables
      if (Array.isArray(ecritures) && ecritures.length > 0) {
        const journalMap: Record<string, string> = { facture_fournisseur: 'ACH', facture_client: 'VTE', releve_bancaire: 'BNQ', fiche_paie: 'OD', charges_sociales: 'OD' }
        const entries = ecritures
          .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
          .map((e: any) => ({
            dossier_id: resolvedDossierId, date_ecriture: extraction.date_document || new Date().toISOString().split('T')[0],
            journal: journalMap[typeDocument] || 'OD', numero_piece: extraction.numero_reference || null,
            compte: String(e.compte), libelle: e.libelle || file.name,
            debit: Number(e.debit) || 0, credit: Number(e.credit) || 0, piece_justificative: doc.id,
          }))
        if (entries.length > 0) await supabase.from('ecritures_comptables').insert(entries)
      }
    } catch (processError: any) {
      const errMsg = processError?.message || String(processError)
      console.error('[upload] Processing error:', errMsg)
      await supabase.from('documents').update({
        statut: 'erreur', n8n_result: { error: errMsg }
      }).eq('id', doc.id)
    }

    // Return the final document state from DB
    const { data: finalDoc } = await supabase.from('documents')
      .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee')
      .eq('id', doc.id).single()

    return NextResponse.json({
      document: finalDoc || doc,
      message: finalDoc?.statut === 'traite'
        ? `Classé: ${finalDoc.type_document}`
        : finalDoc?.statut === 'erreur'
        ? `Erreur d'analyse`
        : `Envoyé`,
    })
  } catch (e: unknown) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
