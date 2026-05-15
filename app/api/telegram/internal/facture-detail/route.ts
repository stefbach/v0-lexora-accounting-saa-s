import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/facture-detail
 *
 * Détail complet d'une facture par numero OU id.
 * Rôle min : comptable.
 *
 * Body : { numero?, facture_id? } — au moins un des deux.
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'facture.detail', async (ctx, body) => {
    if (!hasRole(ctx, 'comptable')) {
      return { result: null, status: 'denied', error_msg: 'Détail facture réservé aux comptables et plus' }
    }
    const numero = body?.numero ? String(body.numero).trim() : null
    const id = body?.facture_id ? String(body.facture_id).trim() : null
    if (!numero && !id) {
      return { result: null, status: 'error', error_msg: 'numero ou facture_id requis' }
    }

    const admin = getAdminClient()
    let q = admin
      .from('factures')
      .select('id, numero_facture, tiers, contact_id, type_facture, type_document, statut, date_facture, date_echeance, devise, montant_ht, montant_tva, montant_ttc, montant_mur, solde_non_paye, lignes, conditions_paiement, recurrent, recurrence_frequence, pdf_url, notes_internes, created_at, updated_at')
      .eq('societe_id', ctx.societe_id)
    if (id) q = q.eq('id', id)
    else q = q.eq('numero_facture', numero!)
    const { data: facture, error } = await q.maybeSingle()
    if (error) return { result: null, status: 'error', error_msg: error.message }
    if (!facture) {
      return { result: null, status: 'error', error_msg: `Facture introuvable (${numero || id}).` }
    }

    // Paiements liés
    const { data: paiements } = await admin
      .from('factures_paiements')
      .select('id, date_paiement, montant, mode_paiement, reference, notes')
      .eq('facture_id', facture.id)
      .order('date_paiement', { ascending: false })

    // Relances (historique)
    const { data: relances } = await admin
      .from('factures_relances')
      .select('niveau, date_envoi, statut, mode_envoi')
      .eq('facture_id', facture.id)
      .order('date_envoi', { ascending: false })

    return {
      result: {
        facture,
        nb_lignes: Array.isArray(facture.lignes) ? facture.lignes.length : 0,
        paiements: paiements || [],
        relances: relances || [],
      },
    }
  })
}
