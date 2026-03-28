import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSystemPrompt, injectTauxChange, CLAUDE_CONFIG } from '@/lib/ai/prompts'
import type { PromptId } from '@/lib/ai/prompts'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

const TYPE_TO_PROMPT_ID: Record<string, PromptId> = {
  facture_fournisseur: 'facture_fournisseur',
  facture_client: 'facture_client',
  releve_bancaire: 'releve_bancaire',
  fiche_paie: 'fiche_paie',
  charges_sociales: 'charges_sociales',
}

// ---------------------------------------------------------------------------
// POST /api/documents/[id]/reanalyze
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const { id } = params

    // Fetch document
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select(`
        id, nom_fichier, type_fichier, type_document, statut,
        storage_path, dossier_id, uploaded_by,
        dossiers(client_id, comptable_id, societe_id)
      `)
      .eq('id', id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    // Access control
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    const userRole = profile?.role
    const dossier = doc.dossiers as any
    const isOwner = doc.uploaded_by === user.id || dossier?.client_id === user.id
    const isComptableOrAdmin = ['admin', 'comptable', 'comptable_dedie'].includes(userRole || '')

    if (!isOwner && !isComptableOrAdmin) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    if (!doc.storage_path) {
      return NextResponse.json({ error: 'Aucun fichier associé à ce document' }, { status: 400 })
    }

    // Parse body
    const body = await request.json().catch(() => ({}))
    const hint: string = body.hint || ''
    const typeForce: string = body.type_force || doc.type_document || 'autre'
    const maxTokensOverride: number = body.max_tokens || (typeForce === 'releve_bancaire' ? CLAUDE_CONFIG.max_tokens_releve_bancaire : CLAUDE_CONFIG.max_tokens)

    // Mark document as processing
    await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', id)

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.storage_path)

    if (downloadError || !fileData) {
      await supabase.from('documents').update({ statut: 'erreur' }).eq('id', id)
      return NextResponse.json({ error: `Erreur téléchargement: ${downloadError?.message}` }, { status: 500 })
    }

    const fileArrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(fileArrayBuffer).toString('base64')
    const ext = doc.nom_fichier.split('.').pop()?.toLowerCase() || 'pdf'
    const isPdf = ext === 'pdf'
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

    // Fetch live exchange rates
    let tauxChange: Record<string, number> = { EUR: 46.50, GBP: 54.20, USD: 44.80 }
    try {
      const tauxRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/taux-change`)
      if (tauxRes.ok) {
        const tauxData = await tauxRes.json()
        if (tauxData.rates) tauxChange = tauxData.rates
      }
    } catch { /* use defaults */ }

    // Build system prompt: use specialized prompt if available
    const promptId = TYPE_TO_PROMPT_ID[typeForce]
    let systemPrompt: string

    if (promptId) {
      systemPrompt = getSystemPrompt(promptId, tauxChange)
    } else {
      // Generic prompt for unknown types
      systemPrompt = injectTauxChange(`Tu es un expert-comptable mauricien. Analyse ce document et retourne UNIQUEMENT un JSON valide.
Format: {"routing":{"societe":"","type_document":"autre","confiance_type":0},"extraction":{"date_document":"","description":"","montant":0,"devise":"MUR"}}
Taux: EUR={{TAUX_EUR}}, GBP={{TAUX_GBP}}, USD={{TAUX_USD}}`, tauxChange)
    }

    // Inject hint into system prompt if provided
    if (hint) {
      systemPrompt = `CONTEXTE ADDITIONNEL FOURNI PAR L'UTILISATEUR: ${hint}\n\n${systemPrompt}`
    }

    // Build message content
    let messageContent: any
    if (isPdf) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: hint ? `Analyse ce document. Contexte: ${hint}` : 'Analyse ce document comptable.' },
      ]
    } else if (isImage) {
      const mt = ext === 'png' ? 'image/png' : 'image/jpeg'
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
        { type: 'text', text: hint ? `Analyse ce document. Contexte: ${hint}` : 'Analyse ce document comptable.' },
      ]
    } else {
      messageContent = `Analyse ce document:\n${Buffer.from(fileArrayBuffer).toString('utf-8').substring(0, 5000)}`
    }

    // Call Claude
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const aiResponse = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: maxTokensOverride,
      temperature: CLAUDE_CONFIG.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    let parsed: any = {}
    try { parsed = JSON.parse(cleaned) } catch {
      parsed = { routing: { type_document: typeForce, societe: 'INCONNU', confiance_type: 30 }, extraction: {} }
    }

    // For bank statements, wrap the result in routing/extraction structure
    const isReleveBancaire = typeForce === 'releve_bancaire'
    let finalRouting: any
    let finalExtraction: any

    if (isReleveBancaire && !parsed.routing) {
      // The releve bancaire prompt returns directly the extraction object
      finalRouting = { type_document: 'releve_bancaire', societe: parsed.banque || 'INCONNU', confiance_type: 90 }
      finalExtraction = parsed
    } else {
      finalRouting = parsed.routing || { type_document: typeForce, societe: 'INCONNU', confiance_type: 50 }
      finalExtraction = parsed.extraction || parsed
    }

    const finalTypeDocument = finalRouting.type_document || typeForce
    const finalSociete = finalRouting.societe
    const finalConfiance = finalRouting.confiance_type || null

    // Delete old accounting entries for this document
    if (doc.dossier_id) {
      await supabase.from('ecritures_comptables')
        .delete()
        .eq('dossier_id', doc.dossier_id)
        .eq('piece_justificative', id)
        .catch(() => {})
    }

    // Update document
    const updateFields: any = {
      type_document: finalTypeDocument,
      statut: 'traite',
      societe_detectee: finalSociete !== 'INCONNU' ? finalSociete : null,
      confiance_type: finalConfiance,
      n8n_result: {
        routing: finalRouting,
        extraction: finalExtraction,
        metadata: {
          model: CLAUDE_CONFIG.model,
          processed_at: new Date().toISOString(),
          reanalyzed: true,
          hint: hint || null,
          type_force: typeForce,
        },
      },
    }

    // Re-route to correct dossier if société changed
    if (finalSociete && finalSociete !== 'INCONNU' && dossier?.client_id) {
      const { data: clientDossiers } = await supabase
        .from('dossiers').select('id, societe_id, societes(nom)')
        .eq('client_id', dossier.client_id)

      if (clientDossiers && clientDossiers.length > 1) {
        const matched = clientDossiers.find((d: any) => {
          const socName = (d.societes as any)?.nom?.toLowerCase() || ''
          const detected = finalSociete.toLowerCase()
          return socName.includes(detected) || detected.includes(socName.replace(' — personnel', ''))
        })
        if (matched && matched.id !== doc.dossier_id) {
          updateFields.dossier_id = matched.id
        }
      }
    }

    await supabase.from('documents').update(updateFields).eq('id', id)

    // Re-create accounting entries
    const ecritures = finalExtraction.ecritures_comptables || finalExtraction.lignes
    const finalDossierId = updateFields.dossier_id || doc.dossier_id
    if (Array.isArray(ecritures) && ecritures.length > 0 && finalDossierId) {
      const journalMap: Record<string, string> = {
        facture_fournisseur: 'ACH', facture_client: 'VTE',
        releve_bancaire: 'BNQ', fiche_paie: 'OD', charges_sociales: 'OD',
      }
      const entries = ecritures
        .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
        .map((e: any) => ({
          dossier_id: finalDossierId,
          date_ecriture: finalExtraction.date_document || finalExtraction.periode_debut || new Date().toISOString().split('T')[0],
          journal: journalMap[finalTypeDocument] || 'OD',
          numero_piece: finalExtraction.numero_reference || null,
          compte: String(e.compte),
          libelle: e.libelle || doc.nom_fichier,
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0,
          piece_justificative: id,
        }))
      if (entries.length > 0) {
        await supabase.from('ecritures_comptables').insert(entries).catch(console.error)
      }
    }

    // Return updated document
    const { data: updatedDoc } = await supabase
      .from('documents')
      .select('id, nom_fichier, type_document, statut, societe_detectee, confiance_type, n8n_result, created_at')
      .eq('id', id)
      .single()

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      type_detected: finalTypeDocument,
      confiance: finalConfiance,
      processing_time_ms: null,
    })
  } catch (e: any) {
    const errMsg = e?.message || String(e)
    console.error('[reanalyze] FATAL:', errMsg)
    // Try to mark as error
    try {
      const supabase = getAdminClient()
      await supabase.from('documents').update({ statut: 'erreur' }).eq('id', params.id)
    } catch {}
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
