import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendTelegramDocument, sendTelegramMessage } from '@/lib/telegram/auth'

/**
 * POST /api/telegram/internal/send-invoice
 *
 * Rôle minimum : comptable / direction / client_admin.
 * Body :
 *   - facture_id  : uuid d'une facture
 *
 * Stratégie : on lit `factures.pdf_url` (cache existant côté Lexora UI).
 * Si présent → signedUrl 1h → sendDocument à Telegram.
 * Si absent → message d'erreur invitant à générer le PDF depuis le web
 * (la régénération nécessite la route /api/client/factures/[id]/pdf qui
 * requiert une session navigateur).
 */
const BUCKET = 'factures-pdf'

export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'invoice.send', async (ctx, body) => {
    if (!hasRole(ctx, 'comptable')) {
      return { result: null, status: 'denied', error_msg: 'Envoi de facture réservé aux comptables et plus' }
    }
    const facture_id = String(body?.facture_id || '')
    if (!facture_id) {
      return { result: null, status: 'error', error_msg: 'facture_id requis' }
    }

    const admin = getAdminClient()
    const { data: facture } = await admin
      .from('factures')
      .select('id, societe_id, numero_facture, tiers, type_facture, montant_ttc, devise, pdf_url, statut')
      .eq('id', facture_id)
      .maybeSingle()
    if (!facture) {
      return { result: null, status: 'error', error_msg: 'Facture introuvable' }
    }
    if (facture.societe_id !== ctx.societe_id) {
      return { result: null, status: 'denied', error_msg: 'Facture hors société active' }
    }
    if (!facture.pdf_url) {
      return {
        result: null,
        status: 'error',
        error_msg: `PDF non encore généré. Ouvre la facture ${facture.numero_facture || facture_id} dans Lexora pour la générer.`,
      }
    }

    const { data: signed, error: sErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(facture.pdf_url, 3600)
    if (sErr || !signed?.signedUrl) {
      return { result: null, status: 'error', error_msg: `Erreur génération URL signée: ${sErr?.message || 'inconnu'}` }
    }

    const caption =
      `🧾 <b>${facture.numero_facture || 'Facture'}</b>\n` +
      `${facture.tiers || ''} — ${Number(facture.montant_ttc || 0).toLocaleString('fr-FR')} ${facture.devise || 'MUR'}\n` +
      `Statut : ${facture.statut || 'brouillon'}`

    try {
      await sendTelegramDocument(ctx.chat_id, signed.signedUrl, caption)
    } catch (e: any) {
      // Si Telegram refuse l'URL (rare), on prévient l'user
      await sendTelegramMessage(ctx.chat_id, `⚠️ Envoi PDF échoué : ${e.message}`)
      return { result: null, status: 'error', error_msg: e.message }
    }

    return {
      result: {
        facture_id,
        numero_facture: facture.numero_facture,
        sent_to_chat_id: ctx.chat_id,
      },
    }
  })
}
