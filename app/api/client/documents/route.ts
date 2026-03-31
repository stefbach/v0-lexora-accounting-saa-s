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

    // Get user profile to determine role and société access
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role, societe_id, client_id')
      .eq('id', user.id)
      .single()

    const isAdmin = ['admin', 'super_admin', 'client_admin', 'comptable', 'comptable_dedie'].includes(userProfile?.role || '')

    // Collect ALL dossier IDs the user has access to
    let dossierIds: string[] = []

    // 1. Dossiers where user is client_id
    const { data: myDossiers } = await supabase
      .from('dossiers').select('id, societe_id').eq('client_id', user.id)
    dossierIds = (myDossiers || []).map(d => d.id)

    // 2. For admin: also get dossiers from same sociétés
    if (isAdmin) {
      // Get all sociétés accessible by this user
      const societeIds = new Set<string>()

      // From own dossiers
      for (const d of myDossiers || []) if (d.societe_id) societeIds.add(d.societe_id)

      // From profile.societe_id
      if (userProfile?.societe_id) societeIds.add(userProfile.societe_id)

      // From user_societes
      const { data: userSocietes } = await supabase
        .from('user_societes').select('societe_id').eq('user_id', user.id)
      for (const us of userSocietes || []) if (us.societe_id) societeIds.add(us.societe_id)

      // From created_by (sociétés créées par ce user)
      const { data: ownedSocietes } = await supabase
        .from('societes').select('id').eq('created_by', user.id)
      for (const s of ownedSocietes || []) societeIds.add(s.id)

      // From client_id (toutes les sociétés du même client)
      if (userProfile?.client_id) {
        const { data: clientSocietes } = await supabase
          .from('societes').select('id').eq('client_id', userProfile.client_id)
        for (const s of clientSocietes || []) societeIds.add(s.id)
      }

      // Get ALL dossiers for these sociétés
      if (societeIds.size > 0) {
        const { data: allDossiers } = await supabase
          .from('dossiers').select('id').in('societe_id', [...societeIds])
        if (allDossiers) {
          dossierIds = [...new Set([...dossierIds, ...allDossiers.map(d => d.id)])]
        }
      }
    }

    if (dossierIds.length === 0) {
      return NextResponse.json({ documents: [] })
    }

    // Get all documents in those dossiers
    // client_user: only sees documents they uploaded themselves
    // client_admin/admin/comptable: sees all documents from all dossiers
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
