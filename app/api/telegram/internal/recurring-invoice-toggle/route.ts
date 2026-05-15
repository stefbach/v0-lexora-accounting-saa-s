import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/recurring-invoice-toggle
 *
 * Tool agent — pause / resume / delete (soft) un modèle de facture récurrente.
 *
 * Rôle minimum : direction (action sensible — peut couper une source de revenus
 * récurrents).
 *
 * Body :
 *   - chat_id  (résolu par l'auth wrapper)
 *   - id       : UUID du modèle (facture avec recurrent=true)
 *   - action   : 'pause' | 'resume' | 'delete'
 *
 * Implémentation (CHECK constraint factures_statut_check actuel) :
 *   - 'pause'  → statut='annule' + notes_internes tag [PAUSED]
 *   - 'resume' → statut='modele' (réactive)
 *   - 'delete' → statut='annule' + notes_internes tag [DELETED] (soft delete)
 *
 * Le cron ne sélectionne que `recurrent=true AND statut='modele'`, donc tout
 * modèle non-'modele' est inactif côté génération.
 */

const ACTIONS = ['pause', 'resume', 'delete'] as const
type Action = (typeof ACTIONS)[number]

export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'recurring_invoice.toggle', async (ctx, body) => {
    if (!hasRole(ctx, 'direction')) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Action sur facture récurrente réservée à direction et plus',
      }
    }

    const id = String(body?.id || '').trim()
    const action = String(body?.action || '').trim() as Action
    if (!id) return { result: null, status: 'error', error_msg: 'id requis (UUID du modèle)' }
    if (!ACTIONS.includes(action)) {
      return {
        result: null,
        status: 'error',
        error_msg: `action invalide. Attendu : ${ACTIONS.join(' | ')}`,
      }
    }

    const admin = getAdminClient()

    // Vérifie que le modèle existe et appartient à la société
    const { data: existing, error: e1 } = await admin
      .from('factures')
      .select('id, numero_facture, tiers, statut, recurrent, recurrent_frequence, notes_internes')
      .eq('id', id)
      .eq('societe_id', ctx.societe_id)
      .maybeSingle()

    if (e1) return { result: null, status: 'error', error_msg: e1.message }
    if (!existing) {
      return {
        result: null,
        status: 'error',
        error_msg: 'Modèle introuvable ou hors de votre société',
      }
    }
    if (!existing.recurrent) {
      return {
        result: null,
        status: 'error',
        error_msg: 'Cette facture n\'est pas un modèle récurrent',
      }
    }

    const tagDate = new Date().toISOString().slice(0, 10)
    const previousNotes = (existing.notes_internes as string | null) || ''

    let nextStatut: string
    let noteTag: string
    let humanLabel: string
    if (action === 'pause') {
      if (existing.statut !== 'modele') {
        return {
          result: null,
          status: 'error',
          error_msg: `Modèle déjà inactif (statut actuel: ${existing.statut})`,
        }
      }
      nextStatut = 'annule'
      noteTag = `[PAUSED ${tagDate} chat=${ctx.chat_id}]`
      humanLabel = 'en pause'
    } else if (action === 'resume') {
      if (existing.statut === 'modele') {
        return {
          result: null,
          status: 'error',
          error_msg: 'Modèle déjà actif',
        }
      }
      nextStatut = 'modele'
      noteTag = `[RESUMED ${tagDate} chat=${ctx.chat_id}]`
      humanLabel = 'réactivé'
    } else {
      // delete (soft)
      nextStatut = 'annule'
      noteTag = `[DELETED ${tagDate} chat=${ctx.chat_id}]`
      humanLabel = 'supprimé (soft)'
    }

    const newNotes = previousNotes
      ? `${previousNotes}\n${noteTag}`
      : noteTag

    const { data: updated, error: e2 } = await admin
      .from('factures')
      .update({ statut: nextStatut, notes_internes: newNotes })
      .eq('id', id)
      .eq('societe_id', ctx.societe_id)
      .select('id, numero_facture, tiers, statut, recurrent_frequence')
      .single()

    if (e2 || !updated) {
      return {
        result: null,
        status: 'error',
        error_msg: `Erreur mise à jour: ${e2?.message || 'inconnue'}`,
      }
    }

    return {
      result: {
        id: updated.id,
        numero: updated.numero_facture,
        tiers: updated.tiers,
        frequence: updated.recurrent_frequence,
        action,
        statut: updated.statut,
        actif: updated.statut === 'modele',
        message: `Modèle "${updated.numero_facture || updated.tiers || updated.id}" ${humanLabel}.`,
      },
    }
  })
}
