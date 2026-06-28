import { createClient } from '@supabase/supabase-js'
import { apiError } from '@/lib/api-error'
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('not_authenticated', 401)

    const supabase = getAdminClient()
    const { id } = await params

    // Fetch document (no FK join — avoids schema cache issues)
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !doc) return apiError('document_not_found', 404)

    // Fetch dossier separately
    let dossier: any = null
    if (doc.dossier_id) {
      const { data: d } = await supabase.from('dossiers').select('id, client_id, societe_id, comptable_id').eq('id', doc.dossier_id).maybeSingle()
      dossier = d
    }

    // Access control: owner, admin roles, or same société
    const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', user.id).single()
    const userRole = profile?.role || ''
    const isOwner = doc.uploaded_by === user.id || dossier?.client_id === user.id
    const isAdminRole = ['admin', 'super_admin', 'client_admin', 'comptable', 'comptable_dedie'].includes(userRole)
    const isAssignedComptable = dossier?.comptable_id === user.id
    const sameSociete = dossier?.societe_id && profile?.societe_id === dossier.societe_id

    if (!isOwner && !isAdminRole && !isAssignedComptable && !sameSociete) {
      return apiError('unauthorized_access', 403)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('not_authenticated', 401)

    const supabase = getAdminClient()
    const { id } = await params

    // Fetch document for access check
    const { data: existingDoc, error: fetchError } = await supabase
      .from('documents')
      .select('id, dossier_id, uploaded_by, dossiers(client_id, comptable_id)')
      .eq('id', id)
      .single()

    if (fetchError || !existingDoc) {
      return apiError('document_not_found', 404)
    }

    // Access control — société-based, not just uploaded_by
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role || ''
    const dossier = existingDoc.dossiers as any
    const isAdminRole = ['admin', 'super_admin', 'client_admin'].includes(userRole)
    const isComptableOrAdmin = ['admin', 'super_admin', 'client_admin', 'comptable', 'comptable_dedie'].includes(userRole)
    const isOwner = existingDoc.uploaded_by === user.id
    const isDossierClient = dossier?.client_id === user.id
    const isDossierComptable = dossier?.comptable_id === user.id

    // Check société access via user_societes
    let hasSocieteAccess = false
    if (dossier?.societe_id) {
      const { data: us } = await supabase.from('user_societes')
        .select('id').eq('user_id', user.id).eq('societe_id', dossier.societe_id).limit(1).maybeSingle()
      hasSocieteAccess = !!us
    }

    if (!isOwner && !isDossierClient && !isDossierComptable && !isComptableOrAdmin && !hasSocieteAccess) {
      return apiError('unauthorized_access', 403)
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
      // Find any dossier for this société
      const { data: targetDossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', societe_id)
        .limit(1)
        .maybeSingle()

      if (targetDossier) {
        updateFields.dossier_id = targetDossier.id
      }
    }

    // Mark as manually corrected
    if (corrige_manuellement !== undefined || Object.keys(updateFields).length > 0) {
      updateFields.corrige_manuellement = corrige_manuellement !== undefined
        ? corrige_manuellement
        : true
    }

    if (Object.keys(updateFields).length === 0) {
      return apiError('no_fields_to_update', 400)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('not_authenticated', 401)

    const supabase = getAdminClient()
    const { id } = await params

    // Récupérer le document pour avoir le storage_path
    const { data: doc, error: fetchErr } = await supabase
      .from('documents').select('id, storage_path, uploaded_by').eq('id', id).single()
    if (fetchErr || !doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    // Supprimer du storage
    if (doc.storage_path) {
      await supabase.storage.from('documents').remove([doc.storage_path])
    }

    // Supprimer toutes les données liées (FK vers documents)
    // NOTE: comptes_bancaires.solde_actuel is NOT rolled back on deletion — known limitation
    const warnings: string[] = []

    // ÉTAPE 1 : récupère les factures liées AVANT suppression pour pouvoir
    // supprimer les écritures (qui ont facture_id REFERENCES factures ON DELETE SET NULL
    // — donc si on delete factures sans cleanup, les écritures restent en place).
    const { data: facturesLiees } = await supabase
      .from('factures').select('id').eq('document_id', id)
    const factureIds = (facturesLiees || []).map((f: any) => f.id).filter(Boolean)

    // ÉTAPE 2 : supprime les écritures comptables liées via plusieurs voies.
    // ref_folio peut être 'FAC-<id>' (helper canonique) OU document.id (legacy)
    if (factureIds.length > 0) {
      const refFolios = factureIds.map(fid => `FAC-${fid}`)
      await supabase.from('ecritures_comptables_v2').delete().in('ref_folio', refFolios)
      await supabase.from('ecritures_comptables_v2').delete().in('facture_id', factureIds)
    }

    // ⚠️ V2 ONLY (mig 230). Legacy : `piece_justificative` était l'ancien nom V1
    // de `ref_folio` ; certaines écritures historiques ont leur ref_folio = document.id.
    const childDeletes = [
      { table: 'releves_bancaires', field: 'document_id' },
      { table: 'factures', field: 'document_id' },
      { table: 'ecritures_comptables_v2', field: 'ref_folio' },
      { table: 'ecritures_comptables_v2', field: 'document_id' },
      { table: 'ecritures_comptables_v2', field: 'piece_justificative' },
      { table: 'transactions_bancaires', field: 'document_lie_id' },
      { table: 'messages_document', field: 'document_id' },
      { table: 'immobilisations', field: 'document_id' },
      { table: 'depenses', field: 'document_id' },
    ]
    for (const { table, field } of childDeletes) {
      const { error: childErr } = await supabase.from(table).delete().eq(field, id)
      if (childErr) {
        console.error(`[delete] Failed to delete from ${table}: ${childErr.message}`)
        warnings.push(`${table}: ${childErr.message}`)
      }
    }

    // Supprimer le document
    const { error: delErr } = await supabase.from('documents').delete().eq('id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    return NextResponse.json({ success: true, deleted: id, warnings })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
