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

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
}

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

    const { data: doc, error } = await supabase
      .from('documents')
      .select('id, nom_fichier, storage_path, dossier_id, uploaded_by, type_fichier')
      .eq('id', id)
      .single()

    if (error || !doc) return apiError('document_not_found', 404)
    if (!doc.storage_path) return NextResponse.json({ error: 'Fichier non disponible' }, { status: 404 })

    // Access control
    let dossier: any = null
    if (doc.dossier_id) {
      const { data: d } = await supabase.from('dossiers').select('id, client_id, societe_id, comptable_id').eq('id', doc.dossier_id).maybeSingle()
      dossier = d
    }

    const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', user.id).single()
    const userRole = profile?.role || ''
    const isOwner = doc.uploaded_by === user.id || dossier?.client_id === user.id
    const isAdminRole = ['admin', 'super_admin', 'client_admin', 'comptable', 'comptable_dedie'].includes(userRole)
    const isAssignedComptable = dossier?.comptable_id === user.id
    const sameSociete = dossier?.societe_id && profile?.societe_id === dossier.societe_id

    if (!isOwner && !isAdminRole && !isAssignedComptable && !sameSociete) {
      return apiError('unauthorized_access', 403)
    }

    // Generate short-lived signed URL (60s)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 60)

    if (urlError || !urlData?.signedUrl) {
      return NextResponse.json({ error: 'Impossible de générer le lien de téléchargement' }, { status: 500 })
    }

    // Fetch file server-side and stream back to client
    const fileRes = await fetch(urlData.signedUrl)
    if (!fileRes.ok) {
      return NextResponse.json({ error: 'Fichier introuvable dans le stockage' }, { status: 404 })
    }

    const ext = doc.nom_fichier.split('.').pop()?.toLowerCase() || ''
    const contentType = MIME_MAP[ext] || fileRes.headers.get('content-type') || 'application/octet-stream'
    const safeFilename = doc.nom_fichier.replace(/["\n\r]/g, '_')

    return new NextResponse(fileRes.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
