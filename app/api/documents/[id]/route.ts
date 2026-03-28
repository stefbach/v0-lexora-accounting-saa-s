import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ---------------------------------------------------------------------------
// GET /api/documents/[id] — Récupérer un document avec son n8n_result complet
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const { id } = params

    // Fetch document with dossier join for access control
    const { data: doc, error } = await supabase
      .from('documents')
      .select(`
        id,
        nom_fichier,
        type_fichier,
        type_document,
        statut,
        storage_path,
        created_at,
        societe_detectee,
        n8n_result,
        confiance_type,
        corrige_manuellement,
        taille_fichier,
        dossier_id,
        uploaded_by,
        dossiers!inner(
          id,
          client_id,
          societe_id,
          comptable_id,
          societes(nom, brn)
        )
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    if (!doc) return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })

    // Access control: user must be owner, comptable, or admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role
    const dossier = doc.dossiers as any
    const isOwner = doc.uploaded_by === user.id || dossier?.client_id === user.id
    const isComptableOrAdmin = ['admin', 'comptable', 'comptable_dedie'].includes(userRole || '')
    const isAssignedComptable = dossier?.comptable_id === user.id

    if (!isOwner && !isComptableOrAdmin && !isAssignedComptable) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    // Generate a short-lived signed URL for download
    let signedUrl: string | null = null
    if (doc.storage_path) {
      const { data: urlData } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 3600) // 1 hour
      signedUrl = urlData?.signedUrl || null
    }

    return NextResponse.json({
      document: {
        ...doc,
        signed_url: signedUrl,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/documents/[id] — Corriger type, société, dossier manuellement
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const { id } = params

    // Fetch document for access check
    const { data: existingDoc, error: fetchError } = await supabase
      .from('documents')
      .select('id, dossier_id, uploaded_by, dossiers(client_id, comptable_id)')
      .eq('id', id)
      .single()

    if (fetchError || !existingDoc) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    // Access control
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role
    const dossier = existingDoc.dossiers as any
    const isOwner = existingDoc.uploaded_by === user.id || dossier?.client_id === user.id
    const isComptableOrAdmin = ['admin', 'comptable', 'comptable_dedie'].includes(userRole || '')

    if (!isOwner && !isComptableOrAdmin) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const {
      type_document,
      societe_id,
      dossier_id,
      societe_detectee,
      corrige_manuellement,
    } = body

    const updateFields: Record<string, any> = {}

    // Update type_document
    if (type_document !== undefined) {
      updateFields.type_document = type_document
    }

    // Update societe_detectee
    if (societe_detectee !== undefined) {
      updateFields.societe_detectee = societe_detectee
    }

    // If dossier_id explicitly provided, use it directly
    if (dossier_id !== undefined) {
      updateFields.dossier_id = dossier_id
    }
    // Otherwise resolve from societe_id
    else if (societe_id !== undefined) {
      // Find the dossier for this société linked to this user
      const { data: targetDossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', societe_id)
        .eq('client_id', user.id)
        .limit(1)
        .single()

      if (targetDossier) {
        updateFields.dossier_id = targetDossier.id
      } else if (isComptableOrAdmin) {
        // Comptables can reassign to any dossier
        const { data: anyDossier } = await supabase
          .from('dossiers')
          .select('id')
          .eq('societe_id', societe_id)
          .limit(1)
          .single()
        if (anyDossier) {
          updateFields.dossier_id = anyDossier.id
        }
      }
    }

    // Mark as manually corrected
    if (corrige_manuellement !== undefined || Object.keys(updateFields).length > 0) {
      updateFields.corrige_manuellement = corrige_manuellement !== undefined
        ? corrige_manuellement
        : true
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('documents')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ document: updated, updated_fields: Object.keys(updateFields) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()

    // Récupérer le document pour avoir le storage_path
    const { data: doc, error: fetchErr } = await supabase
      .from('documents').select('id, storage_path, uploaded_by').eq('id', params.id).single()
    if (fetchErr || !doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    // Supprimer du storage
    if (doc.storage_path) {
      await supabase.storage.from('documents').remove([doc.storage_path])
    }

    // Supprimer les écritures liées
    await supabase.from('ecritures_comptables').delete().eq('document_id', params.id)
    await supabase.from('ecritures_comptables_v2').delete().eq('document_source_id', params.id)

    // Supprimer le document
    const { error: delErr } = await supabase.from('documents').delete().eq('id', params.id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
