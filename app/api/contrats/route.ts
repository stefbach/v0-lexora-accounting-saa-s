import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { messageAccueil } from '@/lib/contrats/assistant'

// GET /api/contrats — Lister les contrats
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut')
    const type_contrat = searchParams.get('type_contrat')
    const societe_id = searchParams.get('societe_id')
    const client_id = searchParams.get('client_id')
    const search = searchParams.get('search') || searchParams.get('q')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabase
      .from('contrats_clients')
      .select(`
        *,
        societe:societes(id, nom, numero_registrar),
        client:profiles!client_id(id, full_name, email),
        comptable:profiles!comptable_id(id, full_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (statut) query = query.eq('statut', statut)
    if (type_contrat) query = query.eq('type_contrat', type_contrat)
    if (societe_id) query = query.eq('societe_id', societe_id)
    if (client_id) query = query.eq('client_id', client_id)
    if (search) {
      const pattern = `%${search.replace(/[%_]/g, '')}%`
      query = query.or(`titre.ilike.${pattern},reference.ilike.${pattern}`)
    }

    const { data, error, count } = await query

    if (error) throw error

    return NextResponse.json({ data, count, page, limit })
  } catch (error) {
    console.error('GET /api/contrats:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/contrats — Créer un nouveau contrat
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const {
      titre,
      type_contrat = 'autre',
      societe_id,
      client_id,
      contexte_initial,
    } = body

    // Récupérer infos client si fourni
    let contexte_client: { nom_client?: string; nom_societe?: string; nom_cabinet?: string } = {}
    
    if (client_id) {
      const { data: clientData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', client_id)
        .single()
      if (clientData) contexte_client.nom_client = clientData.full_name
    }

    if (societe_id) {
      const { data: societeData } = await supabase
        .from('societes')
        .select('nom')
        .eq('id', societe_id)
        .single()
      if (societeData) contexte_client.nom_societe = societeData.nom
    }

    // Message d'accueil de l'IA
    const premier_message = messageAccueil({
      nom_client: contexte_client.nom_client,
      nom_societe: contexte_client.nom_societe,
      type_contrat: type_contrat !== 'autre' ? type_contrat : undefined,
    })

    // Conversation initiale
    const conversation_initiale = [
      {
        role: 'assistant',
        content: premier_message,
        timestamp: new Date().toISOString(),
      },
    ]

    // Si message initial fourni, l'ajouter
    if (contexte_initial) {
      conversation_initiale.push({
        role: 'user',
        content: contexte_initial,
        timestamp: new Date().toISOString(),
      })
    }

    const { data: contrat, error } = await supabase
      .from('contrats_clients')
      .insert({
        titre: titre || `Contrat ${new Date().toLocaleDateString('fr-FR')}`,
        type_contrat,
        societe_id: societe_id || null,
        client_id: client_id || null,
        comptable_id: user.id,
        cree_par: user.id,
        conversation_ia: conversation_initiale,
        parametres: {},
        statut: 'brouillon',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data: contrat, message_accueil: premier_message })
  } catch (error) {
    console.error('POST /api/contrats:', error)
    return NextResponse.json({ error: 'Erreur création contrat' }, { status: 500 })
  }
}

// PATCH /api/contrats — Mise à jour d'un contrat (body: { id, ...fields })
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { id, ...rawFields } = body as { id?: string } & Record<string, unknown>
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    // Ownership check — le contrat doit être créé par / assigné à l'utilisateur,
    // ou l'utilisateur doit être admin.
    const { data: existing, error: fetchError } = await supabase
      .from('contrats_clients')
      .select('id, comptable_id, cree_par')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
    if (!isAdmin && existing.comptable_id !== user.id && existing.cree_par !== user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Whitelist des colonnes modifiables via PATCH
    const ALLOWED: ReadonlyArray<string> = [
      'titre',
      'type_contrat',
      'statut',
      'societe_id',
      'client_id',
      'date_debut',
      'date_fin',
      'montant',
      'montant_total',
      'devise',
      'frequence_facturation',
      'description',
      'notes_internes',
      'action_renouvellement',
      'contenu_html',
      'contenu_markdown',
      'parametres',
    ]
    const update: Record<string, unknown> = {}
    for (const key of Object.keys(rawFields)) {
      if (ALLOWED.includes(key)) update[key] = rawFields[key]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('contrats_clients')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    console.error('PATCH /api/contrats:', error)
    return NextResponse.json({ error: 'Erreur mise à jour contrat' }, { status: 500 })
  }
}

// DELETE /api/contrats?id=... — Soft delete (statut = resilie) par défaut,
// suppression physique si ?force=1 et brouillon.
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const force = searchParams.get('force') === '1'
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: existing, error: fetchError } = await supabase
      .from('contrats_clients')
      .select('id, comptable_id, cree_par, statut')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
    if (!isAdmin && existing.comptable_id !== user.id && existing.cree_par !== user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Hard delete uniquement si brouillon + force, sinon soft delete (statut=resilie)
    if (force && existing.statut === 'brouillon') {
      const { error } = await supabase.from('contrats_clients').delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true, hard: true })
    }

    const { data, error } = await supabase
      .from('contrats_clients')
      .update({ statut: 'resilie' })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, hard: false, data })
  } catch (error) {
    console.error('DELETE /api/contrats:', error)
    return NextResponse.json({ error: 'Erreur suppression contrat' }, { status: 500 })
  }
}
