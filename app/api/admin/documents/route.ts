import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)

    const typeDocument = searchParams.get('type_document')
    const statut = searchParams.get('statut')
    const societeId = searchParams.get('societe_id')

    // Build the documents query with joins
    let query = supabase
      .from('documents')
      .select(`
        id,
        nom_fichier,
        type_document,
        statut,
        created_at,
        taille,
        dossier_id,
        uploaded_by,
        dossiers!inner (
          id,
          societe_id,
          client_id,
          societes ( id, nom ),
          profiles:client_id ( id, full_name )
        )
      `)
      .order('created_at', { ascending: false })

    // Apply filters
    if (typeDocument) {
      query = query.eq('type_document', typeDocument)
    }
    if (statut) {
      query = query.eq('statut', statut)
    }
    if (societeId) {
      query = query.eq('dossiers.societe_id', societeId)
    }

    const { data: docs, error } = await query.limit(500)

    if (error) {
      // If the join query fails (e.g. documents without dossiers), try a simpler approach
      console.error('Join query error, falling back:', error.message)

      let fallbackQuery = supabase
        .from('documents')
        .select('id, nom_fichier, type_document, statut, created_at, taille, dossier_id, uploaded_by')
        .order('created_at', { ascending: false })

      if (typeDocument) fallbackQuery = fallbackQuery.eq('type_document', typeDocument)
      if (statut) fallbackQuery = fallbackQuery.eq('statut', statut)

      const { data: fallbackDocs, error: fallbackError } = await fallbackQuery.limit(500)
      if (fallbackError) throw fallbackError

      // Get all societes for filter dropdown
      const { data: societes } = await supabase
        .from('societes')
        .select('id, nom')
        .order('nom')

      const documents = (fallbackDocs || []).map(d => ({
        id: d.id,
        nom_fichier: d.nom_fichier,
        type_document: d.type_document,
        statut: d.statut,
        created_at: d.created_at,
        taille: d.taille,
        societe_nom: null,
        client_nom: null,
        societe_id: null,
      }))

      const allDocs = fallbackDocs || []
      const stats = {
        total: allDocs.length,
        traite: allDocs.filter(d => d.statut === 'traite').length,
        en_attente: allDocs.filter(d => d.statut === 'en_attente').length,
        en_cours: allDocs.filter(d => d.statut === 'en_cours').length,
        erreur: allDocs.filter(d => d.statut === 'erreur').length,
      }

      return NextResponse.json({ documents, stats, societes: societes || [] })
    }

    // Get all societes for filter dropdown
    const { data: societes } = await supabase
      .from('societes')
      .select('id, nom')
      .order('nom')

    // For unfiltered stats, get total counts
    const { count: totalCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
    const { count: traiteCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'traite')
    const { count: attenteCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'en_attente')
    const { count: coursCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'en_cours')
    const { count: erreurCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'erreur')

    const stats = {
      total: totalCount || 0,
      traite: traiteCount || 0,
      en_attente: attenteCount || 0,
      en_cours: coursCount || 0,
      erreur: erreurCount || 0,
    }

    // Transform documents for response
    type DossierJoin = {
      id: string
      societe_id: string
      client_id: string
      societes: { id: string; nom: string } | null
      profiles: { id: string; full_name: string } | null
    }

    const documents = (docs || []).map((d) => {
      const dossier = d.dossiers as unknown as DossierJoin | null
      return {
        id: d.id,
        nom_fichier: d.nom_fichier,
        type_document: d.type_document,
        statut: d.statut,
        created_at: d.created_at,
        taille: d.taille,
        societe_nom: dossier?.societes?.nom || null,
        client_nom: dossier?.profiles?.full_name || null,
        societe_id: dossier?.societe_id || null,
      }
    })

    return NextResponse.json({ documents, stats, societes: societes || [] })
  } catch (e: any) {
    console.error('Admin documents API error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
