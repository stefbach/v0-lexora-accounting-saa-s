import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

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

    // Determine file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const typeFichier = ext === 'jpg' ? 'jpeg' : ext as 'pdf' | 'jpeg' | 'png' | 'xlsx'

    // Upload to Supabase Storage
    const storagePath = `${user.id}/${Date.now()}_${file.name}`
    const fileBuffer = await file.arrayBuffer()

    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (storageError) {
      return NextResponse.json({ error: `Erreur upload : ${storageError.message}` }, { status: 500 })
    }

    // Create document record
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        dossier_id: dossierId || null,
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

    // Trigger document processing asynchronously (fire and forget)
    const processUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ? request.nextUrl.origin : ''}/api/documents/process`
    fetch(processUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id: doc.id,
        storage_path: storagePath,
        nom_fichier: file.name,
        client_id: user.id,
        societe: societeId || undefined,
      }),
    }).catch(err => console.error('Process trigger failed:', err))

    return NextResponse.json({
      document: doc,
      message: 'Document uploadé avec succès. Traitement en cours.',
    })
  } catch (e: unknown) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
