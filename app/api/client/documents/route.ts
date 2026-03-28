import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — List all documents for the current user (via their dossiers)
export async function GET() {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Use admin client to bypass RLS
    const supabase = getAdminClient()

    // Get dossiers for this user
    const { data: myDossiers } = await supabase
      .from('dossiers').select('id, societe_id').eq('client_id', user.id)

    // Also get dossiers from the same sociétés (shared with client_admin)
    let dossierIds: string[] = (myDossiers || []).map(d => d.id)

    if (myDossiers && myDossiers.length > 0) {
      const societeIds = [...new Set(myDossiers.map(d => d.societe_id))]
      const { data: sharedDossiers } = await supabase
        .from('dossiers').select('id').in('societe_id', societeIds)
      if (sharedDossiers) {
        const sharedIds = sharedDossiers.map(d => d.id)
        dossierIds = [...new Set([...dossierIds, ...sharedIds])]
      }
    }

    if (dossierIds.length === 0) {
      return NextResponse.json({ documents: [] })
    }

    // Check user role from profiles table
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Get all documents in those dossiers
    // client_user: only sees documents they uploaded themselves
    // client_admin: sees all documents from all dossiers of the same société
    let documentsQuery = supabase
      .from('documents')
      .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee, n8n_result')
      .in('dossier_id', dossierIds)
      .order('created_at', { ascending: false })

    if (userProfile?.role === 'client_user') {
      documentsQuery = documentsQuery.eq('uploaded_by', user.id)
    }

    const { data: documents, error } = await documentsQuery

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ documents: documents || [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
