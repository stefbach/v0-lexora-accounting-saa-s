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

      // ALSO get dossiers of other users assigned to the same sociétés
      // (handles case where assistant has their own dossier not linked to admin's societe)
      if (societeIds.size > 0) {
        // Find users assigned to same sociétés
        const { data: sameUsers } = await supabase
          .from('user_societes').select('user_id').in('societe_id', [...societeIds])
        const otherUserIds = [...new Set((sameUsers || []).map(u => u.user_id).filter(uid => uid !== user.id))]

        if (otherUserIds.length > 0) {
          const { data: otherDossiers } = await supabase
            .from('dossiers').select('id').in('client_id', otherUserIds)
          if (otherDossiers) {
            dossierIds = [...new Set([...dossierIds, ...otherDossiers.map(d => d.id)])]
          }
        }
      }

      // ALSO: find ALL dossiers created by users who have profiles.societe_id matching our sociétés
      const { data: sameProfileUsers } = await supabase
        .from('profiles').select('id').in('societe_id', [...societeIds])
      const profileUserIds = (sameProfileUsers || []).map(u => u.id).filter(uid => uid !== user.id)
      if (profileUserIds.length > 0) {
        const { data: profileDossiers } = await supabase
          .from('dossiers').select('id').in('client_id', profileUserIds)
        if (profileDossiers) {
          dossierIds = [...new Set([...dossierIds, ...profileDossiers.map(d => d.id)])]
        }
      }
    }

    // ALSO: for admin, find ALL documents uploaded by users of the same sociétés
    // This catches documents in orphan dossiers (assistant uploaded before société link was set)
    let uploaderIds: string[] = []
    if (isAdmin && societeIds.size > 0) {
      // Users with profiles.societe_id in our sociétés
      const { data: socUsers } = await supabase.from('profiles').select('id').in('societe_id', [...societeIds])
      uploaderIds = (socUsers || []).map(u => u.id)
      // Users in user_societes for our sociétés
      const { data: usUsers } = await supabase.from('user_societes').select('user_id').in('societe_id', [...societeIds])
      for (const u of usUsers || []) if (!uploaderIds.includes(u.user_id)) uploaderIds.push(u.user_id)
    }

    if (dossierIds.length === 0 && uploaderIds.length === 0) {
      return NextResponse.json({ documents: [] })
    }

    // Get documents: by dossier OR by uploader (for admin roles)
    let documents: any[] = []

    // Query 1: documents in known dossiers
    if (dossierIds.length > 0) {
      const { data: d1 } = await supabase
        .from('documents')
        .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee, n8n_result, uploaded_by, dossier_id')
        .in('dossier_id', dossierIds)
        .order('created_at', { ascending: false })
      if (d1) documents = [...d1]
    }

    // Query 2: documents uploaded by users of the same sociétés (catches orphan dossiers)
    if (isAdmin && uploaderIds.length > 0) {
      const { data: d2 } = await supabase
        .from('documents')
        .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee, n8n_result, uploaded_by, dossier_id')
        .in('uploaded_by', uploaderIds)
        .order('created_at', { ascending: false })
      if (d2) {
        // Merge without duplicates
        const existingIds = new Set(documents.map(d => d.id))
        for (const doc of d2) {
          if (!existingIds.has(doc.id)) documents.push(doc)
        }
      }
    }

    // For client_user: filter to only their own uploads
    let documentsQuery: any = null // not used anymore

    // For client_user: only their own uploads
    if (userProfile?.role === 'client_user') {
      documents = documents.filter(d => d.uploaded_by === user.id)
    }

    // Sort by date descending
    documents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ documents })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
