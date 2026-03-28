import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const boite = searchParams.get('boite') || 'recus' // recus | envoyes | non_lus

    let query = supabase
      .from('messages_internes')
      .select('*, expediteur:profiles!expediteur_id(full_name,email,role), destinataire:profiles!destinataire_id(full_name,email,role)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (boite === 'recus') query = query.eq('destinataire_id', user.id)
    else if (boite === 'envoyes') query = query.eq('expediteur_id', user.id)
    else if (boite === 'non_lus') query = query.eq('destinataire_id', user.id).eq('lu', false)

    const { data, error } = await query
    if (error) throw error

    const nb_non_lus = boite === 'recus'
      ? (data || []).filter((m: any) => !m.lu).length
      : 0

    return NextResponse.json({ messages: data, nb_non_lus })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { destinataire_id, corps, sujet, type_message, priorite, societe_id, document_ref, reponse_a } = body
    if (!corps) return NextResponse.json({ error: 'corps requis' }, { status: 400 })

    // Si pas de destinataire explicite, envoyer au comptable assigné à la société
    let dest_id = destinataire_id
    if (!dest_id && societe_id) {
      const { data: soc } = await supabase.from('societes').select('comptable_id').eq('id', societe_id).single()
      dest_id = (soc as any)?.comptable_id || null
    }
    // Sinon chercher le comptable dans le profil utilisateur
    if (!dest_id) {
      const { data: prof } = await supabase.from('profiles').select('comptable_id').eq('id', user.id).single()
      dest_id = (prof as any)?.comptable_id || null
    }

    const { data, error } = await supabase.from('messages_internes').insert({
      expediteur_id: user.id,
      destinataire_id: dest_id,
      societe_id: societe_id || null,
      corps,
      sujet: sujet || null,
      type_message: type_message || 'general',
      priorite: priorite || 'normale',
      document_ref: document_ref || null,
      reponse_a: reponse_a || null,
    }).select().single()
    if (error) throw error

    return NextResponse.json({ message: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  // Marquer comme lu
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { message_id, all } = await request.json()
    if (all) {
      await supabase.from('messages_internes').update({ lu: true, lu_le: new Date().toISOString() }).eq('destinataire_id', user.id).eq('lu', false)
    } else if (message_id) {
      await supabase.from('messages_internes').update({ lu: true, lu_le: new Date().toISOString() }).eq('id', message_id).eq('destinataire_id', user.id)
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
