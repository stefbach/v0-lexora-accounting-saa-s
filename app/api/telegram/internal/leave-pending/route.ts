import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/leave-pending?chat_id=<n>
 *
 * Rôle requis : manager+ (manager voit son équipe, RH+direction voient toute la société).
 * Renvoie les demandes de congé en attente d'approbation.
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'leave.pending.get', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Validation congés réservée aux managers et plus' }
    }
    const admin = getAdminClient()
    let q = admin
      .from('conges')
      .select('id, employe_id, type, date_debut, date_fin, nb_jours, motif, statut, employes!inner(prenom, nom, manager_id)')
      .eq('societe_id', ctx.societe_id)
      .eq('statut', 'en_attente')
      .order('date_debut', { ascending: true })

    // Si manager simple, on limite à son équipe
    if (ctx.role === 'manager' && ctx.manager_employes.length > 0) {
      q = q.in('employe_id', ctx.manager_employes)
    }

    const { data, error } = await q
    if (error) return { result: null, status: 'error', error_msg: error.message }

    const pending = (data || []).map((d: any) => ({
      id: d.id,
      employe: `${d.employes?.prenom || ''} ${d.employes?.nom || ''}`.trim(),
      type: d.type,
      date_debut: d.date_debut,
      date_fin: d.date_fin,
      nb_jours: d.nb_jours,
      motif: d.motif,
    }))

    return { result: { count: pending.length, requests: pending } }
  })
}
