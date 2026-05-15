import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { scrapeBankAccount, detectAnomalies } from '@/lib/banks/scraper'

/**
 * POST /api/telegram/internal/bank-scrape
 *
 * Tool agent — trigger manuel d'un scrape bancaire.
 * Body : { compte_bancaire_id?, banque?, numero_compte? }
 * Si compte_bancaire_id absent, recherche par banque + numero_compte sur la société active.
 *
 * Rôle minimum : direction (sensible : exposition balance).
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'bank.scrape', async (ctx, body) => {
    if (!hasRole(ctx, 'direction')) {
      return { result: null, status: 'denied', error_msg: 'Scrape bancaire réservé à la direction' }
    }
    const admin = getAdminClient()
    let compteId: string | null = body?.compte_bancaire_id ? String(body.compte_bancaire_id) : null

    if (!compteId) {
      const banque = body?.banque ? String(body.banque) : null
      const numero = body?.numero_compte ? String(body.numero_compte) : null
      let q = admin.from('comptes_bancaires').select('id').eq('societe_id', ctx.societe_id).eq('actif', true)
      if (banque) q = q.ilike('banque', `%${banque}%`)
      if (numero) q = q.ilike('numero_compte', `%${numero}%`)
      const { data } = await q.limit(1).maybeSingle()
      compteId = data?.id || null
    }
    if (!compteId) {
      return { result: null, status: 'error', error_msg: 'Aucun compte bancaire trouvé (précise banque + numero_compte)' }
    }

    // Vérif scope société
    const { data: cb } = await admin
      .from('comptes_bancaires').select('societe_id, banque, numero_compte').eq('id', compteId).maybeSingle()
    if (!cb || cb.societe_id !== ctx.societe_id) {
      return { result: null, status: 'denied', error_msg: 'Compte hors société active' }
    }

    const result = await scrapeBankAccount({
      compte_bancaire_id: compteId,
      societe_id: ctx.societe_id,
      trigger_source: 'telegram',
    })

    if (result.status === 'success') {
      await detectAnomalies(compteId, result)
    }

    return {
      result: {
        compte: `${cb.banque || ''} ${cb.numero_compte || ''}`.trim(),
        status: result.status,
        balance_mur: result.balance_mur,
        nb_transactions: result.nb_transactions,
        error: result.error,
      },
      status: result.status === 'success' ? 'success' : (result.status === 'failed' ? 'error' : 'success'),
      error_msg: result.error,
    }
  })
}
