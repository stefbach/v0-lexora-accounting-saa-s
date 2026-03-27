import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = getAdminClient()
  let docId: string | null = null

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

    // Read file ONCE
    const fileArrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(fileArrayBuffer).toString('base64')
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const typeFichier = ext === 'jpg' ? 'jpeg' : ext as 'pdf' | 'jpeg' | 'png' | 'xlsx'
    const storagePath = `${user.id}/${Date.now()}_${file.name}`

    // Upload to storage
    const { error: storageError } = await supabase.storage
      .from('documents').upload(storagePath, fileArrayBuffer, { contentType: file.type, upsert: false })
    if (storageError) return NextResponse.json({ error: `Upload storage: ${storageError.message}` }, { status: 500 })

    // Create document record
    const { data: doc, error: docError } = await supabase.from('documents').insert({
      dossier_id: resolvedDossierId, uploaded_by: user.id, nom_fichier: file.name,
      type_fichier: typeFichier, statut: 'en_cours', storage_path: storagePath,
      taille_fichier: file.size, societe_detectee: null, type_document: null,
    }).select().single()
    if (docError) return NextResponse.json({ error: `DB insert: ${docError.message}` }, { status: 500 })
    docId = doc.id

    // === AI PROCESSING ===
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const isPdf = ext === 'pdf'

    let messageContent: any
    if (isImage) {
      const mt = ext === 'png' ? 'image/png' : 'image/jpeg'
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
        { type: 'text', text: 'Analyse ce document comptable.' },
      ]
    } else if (isPdf) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Analyse ce document comptable.' },
      ]
    } else {
      messageContent = 'Analyse ce document:\n' + Buffer.from(fileArrayBuffer).toString('utf-8').substring(0, 5000)
    }

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0,
      system: `Tu es un expert-comptable. Analyse ce document et retourne UNIQUEMENT un JSON valide (pas de markdown, pas de backticks):
{"routing":{"societe":"<nom ou INCONNU>","type_document":"<facture_fournisseur|facture_client|releve_bancaire|charges_sociales|fiche_paie|contrat|autre>","confiance_type":0},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"","montant_ht":0,"montant_tva":0,"montant_ttc":0,"lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"","libelle":"","debit":0,"credit":0}]}}`,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let parsed: any = {}
    try { parsed = JSON.parse(cleaned) } catch { parsed = { routing: { type_document: 'autre', societe: 'INCONNU' }, extraction: {} } }

    const typeDocument = parsed.routing?.type_document || 'autre'
    const detectedSociete = parsed.routing?.societe || 'INCONNU'
    const extraction = parsed.extraction || {}

    // Update document as processed
    const updateData: any = {
      type_document: typeDocument, statut: 'traite',
      n8n_result: { routing: parsed.routing, extraction, metadata: { model: 'claude-sonnet-4-6', processed_at: new Date().toISOString() } },
    }
    if (detectedSociete !== 'INCONNU') updateData.societe_detectee = detectedSociete
    await supabase.from('documents').update(updateData).eq('id', doc.id)

    // Auto-create accounting entries
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

    // Return final state
    const { data: finalDoc } = await supabase.from('documents')
      .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee')
      .eq('id', doc.id).single()

    return NextResponse.json({ document: finalDoc || doc, message: `Classé: ${typeDocument}` })

  } catch (e: any) {
    const errMsg = e?.message || String(e)
    console.error('[upload] FATAL:', errMsg, e?.stack)

    // Try to mark document as error
    if (docId) {
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: errMsg } }).eq('id', docId).catch(() => {})
    }

    return NextResponse.json({ error: errMsg, processing_error: errMsg }, { status: 500 })
  }
}
