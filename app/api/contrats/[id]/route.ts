import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/contrats/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data, error } = await supabase
      .from('contrats_clients')
      .select(`
        *,
        societe:societes(id, nom, numero_registrar, adresse),
        client:profiles!client_id(id, full_name, email, phone),
        comptable:profiles!comptable_id(id, full_name, email),
        versions:contrat_versions(id, version, raison_modification, created_at, modifie_par)
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('GET /api/contrats/[id]:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH /api/contrats/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const {
      titre,
      statut,
      type_contrat,
      contenu_html,
      contenu_markdown,
      parametres,
      conversation_ia,
      notes_internes,
      date_debut,
      date_fin,
      montant_total,
      sauvegarder_version,
      raison_modification,
    } = body

    // Si on sauvegarde le contenu, créer une version
    if (sauvegarder_version && contenu_html) {
      const { data: contratActuel } = await supabase
        .from('contrats_clients')
        .select('contenu_html')
        .eq('id', id)
        .single()

      if (contratActuel?.contenu_html) {
        const { data: versions } = await supabase
          .from('contrat_versions')
          .select('version')
          .eq('contrat_id', id)
          .order('version', { ascending: false })
          .limit(1)

        const nouvelleVersion = (versions?.[0]?.version || 0) + 1

        await supabase.from('contrat_versions').insert({
          contrat_id: id,
          version: nouvelleVersion,
          contenu_html: contratActuel.contenu_html,
          raison_modification: raison_modification || `Version ${nouvelleVersion}`,
          modifie_par: user.id,
        })
      }
    }

    const updates: Record<string, unknown> = {}
    if (titre !== undefined) updates.titre = titre
    if (statut !== undefined) updates.statut = statut
    if (type_contrat !== undefined) updates.type_contrat = type_contrat
    if (contenu_html !== undefined) updates.contenu_html = contenu_html
    if (contenu_markdown !== undefined) updates.contenu_markdown = contenu_markdown
    if (parametres !== undefined) updates.parametres = parametres
    if (conversation_ia !== undefined) updates.conversation_ia = conversation_ia
    if (notes_internes !== undefined) updates.notes_internes = notes_internes
    if (date_debut !== undefined) updates.date_debut = date_debut
    if (date_fin !== undefined) updates.date_fin = date_fin
    if (montant_total !== undefined) updates.montant_total = montant_total

    // Transitions de statut avec dates
    if (statut === 'envoye') updates.date_envoi = new Date().toISOString()
    if (statut === 'signe') updates.date_signature_client = new Date().toISOString()

    const { data, error } = await supabase
      .from('contrats_clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('PATCH /api/contrats/[id]:', error)
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
  }
}

// DELETE /api/contrats/[id] — Archive seulement
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { error } = await supabase
      .from('contrats_clients')
      .update({ statut: 'archive' })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/contrats/[id]:', error)
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  }
}
