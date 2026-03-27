import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — List ALL documents across all clients (for comptable view)
export async function GET() {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })
    }

    // Verify user is comptable
    const supabase = getAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'comptable' && profile?.role !== 'comptable_dedie') {
      return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
    }

    // Get dossiers (all for comptable, assigned for comptable_dedie)
    let dossierQuery = supabase
      .from('dossiers')
      .select('id, client_id, societe:societes(id, nom), client:profiles!dossiers_client_id_fkey(id, full_name, email)')

    if (profile.role === 'comptable_dedie') {
      dossierQuery = dossierQuery.eq('comptable_id', user.id)
    }

    const { data: dossiers } = await dossierQuery

    if (!dossiers || dossiers.length === 0) {
      return NextResponse.json({ documents: [], stats: { total: 0, en_cours: 0, traite: 0, erreur: 0 } })
    }

    const dossierIds = dossiers.map(d => d.id)

    // Build a map of dossier_id -> client info + societe info
    const dossierMap = new Map<string, { client_name: string; client_email: string; societe_nom: string }>()
    for (const d of dossiers) {
      const client = d.client as any
      const societe = d.societe as any
      dossierMap.set(d.id, {
        client_name: client?.full_name || client?.email || 'Inconnu',
        client_email: client?.email || '',
        societe_nom: societe?.nom || '',
      })
    }

    // Fetch all documents across those dossiers
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, nom_fichier, type_fichier, type_document, statut, created_at, dossier_id, societe_detectee')
      .in('dossier_id', dossierIds)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enrich documents with client/societe info
    const enriched = (documents || []).map(doc => {
      const info = dossierMap.get(doc.dossier_id) || { client_name: 'Inconnu', client_email: '', societe_nom: '' }
      return {
        ...doc,
        client_name: info.client_name,
        client_email: info.client_email,
        societe_nom: info.societe_nom,
      }
    })

    const stats = {
      total: enriched.length,
      en_cours: enriched.filter(d => d.statut === 'en_cours').length,
      traite: enriched.filter(d => d.statut === 'traite').length,
      erreur: enriched.filter(d => d.statut === 'erreur').length,
    }

    return NextResponse.json({ documents: enriched, stats })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
