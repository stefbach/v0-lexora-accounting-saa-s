import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertDocumentAccess,
  assertFactureAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

// Actions disponibles pour les clients (client_admin et client_user)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    const allowedRoles = ['client_admin', 'client_user', 'admin']
    if (!allowedRoles.includes(profile?.role || '')) {
      return NextResponse.json({ error: 'Accès client requis' }, { status: 403 })
    }

    const body = await request.json()
    const { action, document_id, facture_id, note, type_demande } = body

    // ── Action 1 : Ajouter une note/commentaire sur un document ──
    if (action === 'commenter_document') {
      if (!document_id || !note) return NextResponse.json({ error: 'document_id et note requis' }, { status: 400 })

      await assertDocumentAccess(admin, user.id, document_id)

      const { data, error } = await admin.from('documents')
        .update({ client_note: note })
        .eq('id', document_id)
        .select().single()
      if (error) throw error
      return NextResponse.json({ document: data, message: 'Note ajoutée' })
    }

    // ── Action 2 : Demander reanalyse d'un document ──
    if (action === 'reanalyser_document') {
      if (!document_id) return NextResponse.json({ error: 'document_id requis' }, { status: 400 })

      await assertDocumentAccess(admin, user.id, document_id)

      const { error } = await admin.from('documents')
        .update({ statut: 'en_attente', client_note: note || 'Reanalyse demandée par le client' })
        .eq('id', document_id)
      if (error) throw error
      return NextResponse.json({ message: 'Reanalyse demandée — votre comptable sera notifié' })
    }

    // ── Action 3 : Approuver/rejeter une facture ──
    if (action === 'approuver_facture' || action === 'rejeter_facture') {
      if (!facture_id) return NextResponse.json({ error: 'facture_id requis' }, { status: 400 })

      await assertFactureAccess(admin, user.id, facture_id)

      const newStatut = action === 'approuver_facture' ? 'approuve_client' : 'rejete_client'
      const { data, error } = await admin.from('factures')
        .update({ statut: newStatut, client_note: note || null })
        .eq('id', facture_id)
        .select().single()
      if (error) throw error
      return NextResponse.json({ facture: data, message: action === 'approuver_facture' ? 'Facture approuvée' : 'Facture rejetée' })
    }

    // ── Action 4 : Envoyer un message à son comptable ──
    if (action === 'contacter_comptable') {
      if (!note) return NextResponse.json({ error: 'message requis' }, { status: 400 })
      const { data: profile2 } = await admin.from('profiles').select('comptable_id').eq('id', user.id).single()

      const { data, error } = await admin.from('messages_internes').insert({
        sender_id: user.id,
        receiver_id: (profile2 as { comptable_id?: string | null } | null)?.comptable_id || null,
        message: note,
        type_demande: type_demande || 'general',
        lu: false,
      }).select().single()
      if (error) throw error
      return NextResponse.json({ message_sent: data, message: 'Message envoyé à votre comptable' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
