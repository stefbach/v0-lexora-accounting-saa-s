import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertFactureAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/client/factures/[id]/historique
 *
 * Retourne l'historique des changements de statut_workflow d'une facture
 * (table `factures_approbations_historique`, migration 148).
 *
 * Réponse : { historique: [{ id, ancien_statut, nouveau_statut, action, user_id, commentaire, created_at }] }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Vérifie l'accès à la facture (et sa société)
    await assertFactureAccess(supabase, user.id, id)

    const { data, error } = await supabase
      .from('factures_approbations_historique')
      .select('id, ancien_statut, nouveau_statut, action, user_id, commentaire, created_at')
      .eq('facture_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      // Table absente (migration 148 pas appliquée) → on renvoie liste vide plutôt que 500
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json({ historique: [], warning: 'Migration 148 non appliquée' })
      }
      throw error
    }

    return NextResponse.json({ historique: data ?? [] })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
