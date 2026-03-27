import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — List all documents for the current client (via their dossiers)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Get all dossiers for this client
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('id')
      .eq('client_id', user.id)

    if (!dossiers || dossiers.length === 0) {
      return NextResponse.json({ documents: [] })
    }

    const dossierIds = dossiers.map(d => d.id)

    // Get all documents in those dossiers
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee, n8n_result')
      .in('dossier_id', dossierIds)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ documents: documents || [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
