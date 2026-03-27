import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { processDocument } from '@/lib/process-document'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Allow up to 60 seconds for upload + AI processing
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const societeId = formData.get('societe_id') as string
    const dossierId = formData.get('dossier_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Type de fichier non supporté. Acceptés : PDF, JPEG, PNG, XLSX' }, { status: 400 })
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 MB)' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Resolve dossier_id: find existing or auto-create
    let resolvedDossierId = dossierId
    if (!resolvedDossierId) {
      let dossierQuery = supabase.from('dossiers').select('id').eq('client_id', user.id)
      if (societeId) dossierQuery = dossierQuery.eq('societe_id', societeId)
      const { data: existingDossiers } = await dossierQuery.limit(1).single()

      if (existingDossiers) {
        resolvedDossierId = existingDossiers.id
      } else if (societeId) {
        const { data: newDossier } = await supabase
          .from('dossiers')
          .insert({ client_id: user.id, societe_id: societeId, comptable_id: null })
          .select('id').single()
        resolvedDossierId = newDossier?.id || null
      } else {
        const { data: anyDossier } = await supabase
          .from('dossiers').select('id').eq('client_id', user.id).limit(1).single()

        if (anyDossier) {
          resolvedDossierId = anyDossier.id
        } else {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          const { data: newSoc } = await supabase
            .from('societes')
            .insert({ nom: `${profile?.full_name || user.email} — Personnel`, statut_tva: false })
            .select('id').single()

          if (newSoc) {
            const { data: newDossier } = await supabase
              .from('dossiers')
              .insert({ client_id: user.id, societe_id: newSoc.id, comptable_id: null })
              .select('id').single()
            resolvedDossierId = newDossier?.id || null
          }
        }
      }

      if (!resolvedDossierId) {
        return NextResponse.json({ error: 'Impossible de trouver ou créer un dossier pour ce document' }, { status: 400 })
      }
    }

    // Determine file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const typeFichier = ext === 'jpg' ? 'jpeg' : ext as 'pdf' | 'jpeg' | 'png' | 'xlsx'

    // Upload to Supabase Storage
    const storagePath = `${user.id}/${Date.now()}_${file.name}`
    const fileBuffer = await file.arrayBuffer()

    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false })

    if (storageError) {
      return NextResponse.json({ error: `Erreur upload : ${storageError.message}` }, { status: 500 })
    }

    // Create document record
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        dossier_id: resolvedDossierId,
        uploaded_by: user.id,
        nom_fichier: file.name,
        type_fichier: typeFichier,
        statut: 'en_attente',
        storage_path: storagePath,
        taille_fichier: file.size,
        societe_detectee: null,
        type_document: null,
      })
      .select()
      .single()

    if (docError) {
      return NextResponse.json({ error: `Erreur enregistrement : ${docError.message}` }, { status: 500 })
    }

    // Process document directly (no HTTP call — runs in same function)
    const result = await processDocument({
      document_id: doc.id,
      storage_path: storagePath,
      nom_fichier: file.name,
      client_id: user.id,
      societe: societeId || undefined,
    })

    return NextResponse.json({
      document: { ...doc, statut: result.success ? 'traite' : 'erreur', type_document: result.type_document },
      processing: result,
      message: result.success
        ? `Document uploadé et classé comme ${result.type_document}.`
        : `Document uploadé. Erreur d'analyse : ${result.error}`,
    })
  } catch (e: unknown) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
