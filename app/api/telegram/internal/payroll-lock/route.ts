import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'

/**
 * POST /api/telegram/internal/payroll-lock
 *
 * Verrouille la paie d'une période en pilotant /api/rh/paie action=verrouiller.
 * Rôle minimum : rh (alignement avec compute) — la direction valide via
 * payroll.approve séparément.
 *
 * Body : { periode: 'YYYY-MM', confirm?: boolean }
 *
 * Le verrouillage déclenche l'auto-comptabilisation (RPC generer_ecritures_paie)
 * → bulletins en `verrouille=true`, écritures comptables poussées.
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'payroll.lock', async (ctx, body) => {
    if (!hasRole(ctx, 'rh')) {
      return { result: null, status: 'denied', error_msg: 'Verrouillage paie réservé aux rôles RH et plus' }
    }
    const periode = String(body?.periode || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode YYYY-MM requise' }
    }
    if (body?.confirm !== true) {
      return {
        result: {
          requires_confirm: true,
          message: `Verrouiller la paie ${periode} ? Cette action déclenchera l'auto-comptabilisation. Rappelle l'outil avec confirm:true.`,
        },
      }
    }

    const baseUrl = getLexoraBaseUrl()
    const res = await fetch(`${baseUrl}/api/rh/paie`, {
      method: 'POST',
      headers: callLexoraHeaders(ctx.user_id),
      body: JSON.stringify({
        action: 'verrouiller',
        societe_id: ctx.societe_id,
        periode,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { result: null, status: 'error', error_msg: j?.error || `HTTP ${res.status}` }
    }
    return {
      result: {
        periode,
        nb_bulletins_verrouilles: j.nb,
        nb_bulletins_comptabilises: j.nb_bulletins_comptabilises,
        nb_ecritures: j.nb_ecritures,
        erreurs_compta: j.erreurs_compta,
      },
    }
  })
}
