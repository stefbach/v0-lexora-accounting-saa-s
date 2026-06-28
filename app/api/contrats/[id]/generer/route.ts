import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import {
  genererContrat,
  modifierContrat,
  type MessageConversation,
} from '@/lib/contrats/assistant'

// POST /api/contrats/[id]/generer — Générer ou régénérer le contrat HTML
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json()
    const { instructions_modification, sauvegarder_version = true } = body

    // Charger le contrat complet
    const { data: contrat, error } = await supabase
      .from('contrats_clients')
      .select(`
        *,
        societe:societes(nom, adresse, brn),
        client:profiles!client_id(full_name, email, phone)
      `)
      .eq('id', id)
      .single()

    if (error || !contrat) {
      return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
    }

    let contenu_html: string

    // Si modification d'un contrat existant
    if (instructions_modification && contrat.contenu_html) {
      contenu_html = await modifierContrat({
        contenu_actuel: contrat.contenu_html,
        instruction_modification: instructions_modification,
        parametres: {
          ...contrat.parametres,
          nom_client: contrat.client?.full_name,
          nom_societe_client: contrat.societe?.nom,
        },
      })
    } else {
      // Génération initiale
      const historique: MessageConversation[] = contrat.conversation_ia || []
      
      contenu_html = await genererContrat({
        parametres: {
          ...contrat.parametres,
          type_contrat: contrat.type_contrat,
          titre: contrat.titre,
          nom_client: contrat.client?.full_name,
          nom_societe_client: contrat.societe?.nom,
          date_debut: contrat.date_debut,
          date_fin: contrat.date_fin,
          montant_total: contrat.montant_total,
        },
        historique,
        instructions_specifiques: instructions_modification,
      })
    }

    // Sauvegarder version précédente si demandé
    if (sauvegarder_version && contrat.contenu_html) {
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
        contenu_html: contrat.contenu_html,
        raison_modification: instructions_modification || 'Nouvelle génération',
        modifie_par: user.id,
      })
    }

    // Mettre à jour le contrat
    const { data: updated, error: updateError } = await supabase
      .from('contrats_clients')
      .update({
        contenu_html,
        statut: contrat.statut === 'brouillon' ? 'en_revision' : contrat.statut,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({
      data: updated,
      contenu_html,
    })
  } catch (error: any) {
    console.error('POST /api/contrats/[id]/generer:', error)
    const msg = error?.message || 'Erreur génération'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
