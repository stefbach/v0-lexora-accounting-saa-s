import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  streamConversation,
  extraireParametres,
  type MessageConversation,
} from '@/lib/contrats/assistant'

// POST /api/contrats/[id]/chat — Envoyer un message à l'IA (streaming SSE)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { message } = await request.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message vide' }, { status: 400 })
    }

    // Charger le contrat et son contexte
    const { data: contrat, error: contratError } = await supabase
      .from('contrats_clients')
      .select(`
        *,
        societe:societes(nom),
        client:profiles!client_id(full_name, email)
      `)
      .eq('id', id)
      .single()

    if (contratError || !contrat) {
      return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
    }

    const historique: MessageConversation[] = contrat.conversation_ia || []

    // Contexte client pour l'IA
    const contexte_client = {
      nom_client: contrat.client?.full_name,
      nom_societe: contrat.societe?.nom,
      nom_cabinet: 'Lexora',
    }

    // Stream SSE
    const encoder = new TextEncoder()
    let reponse_complete = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = streamConversation({
            historique,
            nouveau_message: message,
            contexte_client,
          })

          for await (const chunk of generator) {
            reponse_complete += chunk
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`)
            )
          }

          // Mettre à jour la conversation en base
          const nouvelle_conversation: MessageConversation[] = [
            ...historique,
            { role: 'user', content: message, timestamp: new Date().toISOString() },
            { role: 'assistant', content: reponse_complete, timestamp: new Date().toISOString() },
          ]

          // Extraire les paramètres en arrière-plan
          const analyse = await extraireParametres(nouvelle_conversation)

          // Sauvegarder conversation + paramètres
          await supabase
            .from('contrats_clients')
            .update({
              conversation_ia: nouvelle_conversation,
              parametres: {
                ...contrat.parametres,
                ...analyse.parametres_extraits,
              },
            })
            .eq('id', id)

          // Envoyer le signal de fin avec métadonnées
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                pret_a_generer: analyse.pret_a_generer,
                informations_manquantes: analyse.informations_manquantes,
                parametres: analyse.parametres_extraits,
              })}\n\n`
            )
          )

          controller.close()
        } catch (err) {
          console.error('Stream error:', err)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Erreur IA' })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('POST /api/contrats/[id]/chat:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
