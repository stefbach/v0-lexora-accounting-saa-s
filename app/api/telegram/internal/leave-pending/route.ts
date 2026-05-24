import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * GET /api/telegram/internal/leave-pending?chat_id=<n>
 *
 * Rôle requis : manager+ (manager voit son équipe, RH+direction voient toute la société).
 * Renvoie les demandes de congé en attente d'approbation.
 *
 * Source : table `demandes_conges` (alignée avec leave-create / leave-decide
 * qui utilisent la même table — la table `conges` n'existait pas / n'est pas
 * la source de vérité pour les demandes).
 */
export async function GET(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'leave.pending.get', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Validation congés réservée aux managers et plus' }
    }
    const admin = getAdminClient()

    // Filtre société via la jointure employes (demandes_conges n'a pas de
    // colonne societe_id directe, on s'appuie sur employes.societe_id).
    let q = admin
      .from('demandes_conges')
      .select('id, employe_id, type_conge, date_debut, date_fin, nb_jours, motif, statut, employes!inner(prenom, nom, manager_id, societe_id)')
      .eq('statut', 'en_attente')
      .eq('employes.societe_id', ctx.societe_id)
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
      type: d.type_conge,
      date_debut: d.date_debut,
      date_fin: d.date_fin,
      nb_jours: d.nb_jours,
      motif: d.motif,
    }))

    return { result: { count: pending.length, requests: pending } }
  })
}
