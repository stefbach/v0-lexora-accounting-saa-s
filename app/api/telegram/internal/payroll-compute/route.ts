import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/payroll-compute
 *
 * Rôle minimum : rh.
 *
 * Body :
 *   - chat_id  (résolu par l'auth wrapper)
 *   - periode  : 'YYYY-MM'
 *
 * Stratégie :
 *   1. Essaie la RPC Supabase `paie_calculer_periode(societe_id, periode)` si
 *      elle existe (logique côté DB). En cas de succès, on agrège les
 *      bulletins retournés.
 *   2. Sinon, on ne duplique pas la logique paie (≈2000 lignes — POST
 *      /api/rh/paie action='calculer_batch'). On retourne plutôt un snapshot
 *      des bulletins déjà calculés pour la période (status='calcule' ou
 *      'brouillon') avec les agrégats demandés ; un message indique de
 *      lancer le calcul depuis l'UI web si aucun bulletin n'existe encore.
 *
 * Retour : { periode, nb_employes_calcules, masse_brute, masse_nette,
 *            total_charges, source: 'rpc' | 'snapshot' | 'empty', message? }
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'payroll.compute', async (ctx, body) => {
    if (!hasRole(ctx, 'rh')) {
      return { result: null, status: 'denied', error_msg: 'Calcul de paie réservé aux RH et plus' }
    }
    const periode = String(body?.periode || '')
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode requise au format YYYY-MM' }
    }

    const admin = getAdminClient()
    const periodeStart = `${periode}-01`
    const [y, m] = periode.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const periodeEnd = `${periode}-${String(lastDay).padStart(2, '0')}`

    // 1) Tentative RPC (silencieuse si absente)
    let rpcUsed = false
    try {
      const { data: rpcData, error: rpcErr } = await admin.rpc(
        'paie_calculer_periode' as any,
        { p_societe_id: ctx.societe_id, p_periode: periodeStart } as any,
      )
      if (!rpcErr && rpcData) {
        rpcUsed = true
      }
    } catch {
      // RPC absente — fallback snapshot
    }

    // 2) Snapshot bulletins de la période
    const { data: bulletins, error: bErr } = await admin
      .from('bulletins_paie')
      .select('id, employe_id, statut, salaire_brut, salaire_net, total_cotisations_employeur, total_cotisations_salarie, paye, taxes_total')
      .eq('societe_id', ctx.societe_id)
      .gte('periode', periodeStart)
      .lte('periode', periodeEnd)

    if (bErr) {
      return { result: null, status: 'error', error_msg: `Erreur lecture bulletins: ${bErr.message}` }
    }

    const rows = bulletins || []
    if (rows.length === 0) {
      return {
        result: {
          periode,
          nb_employes_calcules: 0,
          masse_brute: 0,
          masse_nette: 0,
          total_charges: 0,
          source: rpcUsed ? 'rpc' : 'empty',
          message: rpcUsed
            ? 'RPC exécutée mais aucun bulletin trouvé après calcul.'
            : 'Aucun bulletin pour cette période — lancez le calcul depuis l\'app Lexora (/rh/paie) puis réessayez.',
        },
      }
    }

    const masse_brute = rows.reduce((s: number, b: any) => s + Number(b.salaire_brut || 0), 0)
    const masse_nette = rows.reduce((s: number, b: any) => s + Number(b.salaire_net || 0), 0)
    const charges_employeur = rows.reduce((s: number, b: any) => s + Number(b.total_cotisations_employeur || 0), 0)
    const charges_salarie = rows.reduce((s: number, b: any) => s + Number(b.total_cotisations_salarie || 0), 0)
    const paye = rows.reduce((s: number, b: any) => s + Number(b.paye || 0), 0)
    const total_charges = charges_employeur + charges_salarie + paye

    return {
      result: {
        periode,
        nb_employes_calcules: rows.length,
        masse_brute: Math.round(masse_brute),
        masse_nette: Math.round(masse_nette),
        total_charges: Math.round(total_charges),
        charges_employeur_mur: Math.round(charges_employeur),
        charges_salarie_mur: Math.round(charges_salarie),
        paye_mur: Math.round(paye),
        source: rpcUsed ? 'rpc' : 'snapshot',
      },
    }
  })
}
