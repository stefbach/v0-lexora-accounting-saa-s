import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/leave-decide
 *
 * Rôle minimum : manager (manager n'agit que sur ses subordonnés ; direction+ : toute la société).
 *
 * Body :
 *   - chat_id      (résolu par l'auth wrapper)
 *   - demande_id   : uuid de la ligne `demandes_conges`
 *   - decision     : 'approuve' | 'refuse'
 *   - commentaire  : string (optionnel) — stocké dans notes_manager
 *
 * Vérifie que la demande appartient à la même societe_id ; pour un manager simple,
 * vérifie que l'employé est dans ctx.manager_employes.
 *
 * Retour : { id, statut, employe_id, employe_chat_id_to_notify }
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'leave.decide', async (ctx, body) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Validation des congés réservée aux managers et plus' }
    }
    const demande_id = String(body?.demande_id || '')
    const decision = String(body?.decision || '')
    const commentaire = body?.commentaire ? String(body.commentaire) : null

    if (!demande_id) {
      return { result: null, status: 'error', error_msg: 'demande_id requis' }
    }
    if (decision !== 'approuve' && decision !== 'refuse') {
      return { result: null, status: 'error', error_msg: "decision doit valoir 'approuve' ou 'refuse'" }
    }

    const admin = getAdminClient()

    // Fetch demande + employé (pour vérif scope et notification)
    const { data: dem } = await admin
      .from('demandes_conges')
      .select('id, statut, employe_id, employes!inner(id, societe_id, manager_id, user_id, prenom, nom)')
      .eq('id', demande_id)
      .maybeSingle()
    if (!dem) {
      return { result: null, status: 'error', error_msg: 'Demande introuvable' }
    }
    const emp: any = (dem as any).employes
    if (!emp || emp.societe_id !== ctx.societe_id) {
      return { result: null, status: 'denied', error_msg: 'Demande hors société active' }
    }
    // Manager simple : limité à son équipe
    if (ctx.role === 'manager' && !ctx.manager_employes.includes(dem.employe_id)) {
      return { result: null, status: 'denied', error_msg: 'Cet employé n\'est pas dans votre équipe' }
    }
    if (dem.statut !== 'en_attente') {
      return { result: null, status: 'error', error_msg: `Demande déjà traitée (statut=${dem.statut})` }
    }

    const nouveauStatut = decision === 'approuve' ? 'approuve' : 'refuse'

    // Tenter de récupérer l'employe_id du décideur (pour approuve_par)
    let approverEmployeId: string | null = null
    if (ctx.employe_id) {
      approverEmployeId = ctx.employe_id
    } else {
      const { data: approverEmp } = await admin
        .from('employes')
        .select('id')
        .eq('user_id', ctx.user_id)
        .eq('societe_id', ctx.societe_id)
        .maybeSingle()
      approverEmployeId = approverEmp?.id || null
    }

    const { data: updated, error } = await admin
      .from('demandes_conges')
      .update({
        statut: nouveauStatut,
        date_decision: new Date().toISOString(),
        approuve_par: approverEmployeId,
        notes_manager: commentaire,
      })
      .eq('id', demande_id)
      .select('id, statut')
      .single()
    if (error) {
      return { result: null, status: 'error', error_msg: `Erreur mise à jour: ${error.message}` }
    }

    // Trouve le chat_id Telegram de l'employé (s'il est inscrit au bot)
    let employe_chat_id_to_notify: number | null = null
    if (emp.user_id) {
      const { data: tg } = await admin
        .from('telegram_users')
        .select('chat_id')
        .eq('user_id', emp.user_id)
        .eq('verified', true)
        .maybeSingle()
      employe_chat_id_to_notify = tg?.chat_id ?? null
    }

    return {
      result: {
        id: updated.id,
        statut: updated.statut,
        employe_id: dem.employe_id,
        employe_nom: `${emp.prenom || ''} ${emp.nom || ''}`.trim(),
        employe_chat_id_to_notify,
      },
    }
  })
}
