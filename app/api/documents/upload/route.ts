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

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Type de fichier non supporté. Acceptés : PDF, JPEG, PNG, XLSX' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 MB)' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Resolve dossier_id
    let resolvedDossierId = dossierId
    if (!resolvedDossierId) {
      let dossierQuery = supabase.from('dossiers').select('id').eq('client_id', user.id)
      if (societeId) dossierQuery = dossierQuery.eq('societe_id', societeId)
      const { data: existing } = await dossierQuery.limit(1).single()

      if (existing) {
        resolvedDossierId = existing.id
      } else if (societeId) {
        const { data: nd } = await supabase.from('dossiers')
          .insert({ client_id: user.id, societe_id: societeId, comptable_id: null })
          .select('id').single()
        resolvedDossierId = nd?.id || null
      } else {
        const { data: any } = await supabase.from('dossiers')
          .select('id').eq('client_id', user.id).limit(1).single()
        if (any) {
          resolvedDossierId = any.id
        } else {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          const { data: newSoc } = await supabase.from('societes')
            .insert({ nom: `${profile?.full_name || user.email} — Personnel`, statut_tva: false })
            .select('id').single()
          if (newSoc) {
            const { data: nd } = await supabase.from('dossiers')
              .insert({ client_id: user.id, societe_id: newSoc.id, comptable_id: null })
              .select('id').single()
            resolvedDossierId = nd?.id || null
          }
        }
      }
      if (!resolvedDossierId) {
        return NextResponse.json({ error: 'Impossible de créer un dossier' }, { status: 400 })
      }
    }

    // Upload to storage
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const typeFichier = ext === 'jpg' ? 'jpeg' : ext as 'pdf' | 'jpeg' | 'png' | 'xlsx'
    const storagePath = `${user.id}/${Date.now()}_${file.name}`

    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })

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

    // Return immediately — processing will be triggered by the client
    return NextResponse.json({
      document: doc,
      message: 'Document uploadé avec succès.',
    })
  } catch (e: unknown) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
