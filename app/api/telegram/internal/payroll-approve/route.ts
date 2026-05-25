import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/payroll-approve
 *
 * Rôle minimum : direction. ACTION DESTRUCTIVE — passe les bulletins de
 * statut 'calcule'/'brouillon' à 'valide' pour la période choisie, et logge
 * dans paie_audit_log (best-effort).
 *
 * Body :
 *   - chat_id  (résolu par l'auth wrapper)
 *   - periode  : 'YYYY-MM'
 *   - confirm  : doit valoir true (sinon refus)
 *
 * Retour : { periode, nb_bulletins_valides, nb_bulletins_deja_valides,
 *            nb_bulletins_verrouilles_ignored }
 */
export async function POST(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'payroll.approve', async (ctx, body) => {
    if (!hasRole(ctx, 'direction')) {
      return { result: null, status: 'denied', error_msg: 'Validation paie réservée à la direction et plus' }
    }
    const periode = String(body?.periode || '')
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode requise au format YYYY-MM' }
    }
    if (body?.confirm !== true) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Action destructive — vous devez confirmer avec { confirm: true } dans le body',
      }
    }

    const admin = getAdminClient()
    const periodeStart = `${periode}-01`
    const [y, m] = periode.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const periodeEnd = `${periode}-${String(lastDay).padStart(2, '0')}`

    // Récupère tous les bulletins de la période
    const { data: buls, error: bErr } = await admin
      .from('bulletins_paie')
      .select('id, statut, verrouille')
      .eq('societe_id', ctx.societe_id)
      .gte('periode', periodeStart)
      .lte('periode', periodeEnd)
    if (bErr) {
      return { result: null, status: 'error', error_msg: `Erreur lecture bulletins: ${bErr.message}` }
    }
    const all = buls || []
    if (all.length === 0) {
      return {
        result: null,
        status: 'error',
        error_msg: `Aucun bulletin trouvé pour ${periode}. Calculez d'abord la paie.`,
      }
    }

    const dejaValides = all.filter((b: any) => b.statut === 'valide').length
    const verrouilles = all.filter((b: any) => b.verrouille && b.statut !== 'valide')
    const toValidate = all.filter((b: any) => b.statut !== 'valide' && !b.verrouille)

    if (toValidate.length === 0) {
      return {
        result: {
          periode,
          nb_bulletins_valides: 0,
          nb_bulletins_deja_valides: dejaValides,
          nb_bulletins_verrouilles_ignored: verrouilles.length,
          message: 'Aucun bulletin à valider (déjà validés ou verrouillés).',
        },
      }
    }

    const { error: upErr } = await admin
      .from('bulletins_paie')
      .update({
        statut: 'valide',
        date_validation: new Date().toISOString(),
        valide_par: ctx.user_id,
      })
      .in('id', toValidate.map((b: any) => b.id))
    if (upErr) {
      return { result: null, status: 'error', error_msg: `Erreur validation: ${upErr.message}` }
    }

    // Audit log (best-effort)
    admin.from('paie_audit_log').insert({
      societe_id: ctx.societe_id,
      periode: periodeStart,
      action: 'validation',
      user_id: ctx.user_id,
      details: {
        source: 'telegram',
        chat_id: ctx.chat_id,
        nb_bulletins: toValidate.length,
      },
    }).then(() => {}, () => {})

    return {
      result: {
        periode,
        nb_bulletins_valides: toValidate.length,
        nb_bulletins_deja_valides: dejaValides,
        nb_bulletins_verrouilles_ignored: verrouilles.length,
      },
    }
  })
}
