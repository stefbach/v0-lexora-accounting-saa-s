/**
 * withSentry — wrapper léger pour Route Handlers Next.js.
 *
 * @sentry/nextjs depuis v8 expose `wrapRouteHandlerWithSentry` (ou
 * `withServerActionInstrumentation`) ; mais les API les plus stables et
 * rétro-compatibles restent : on englobe nous-même la handler dans un
 * try/catch et on délègue le reporting à logError (qui pousse vers Sentry).
 *
 * Avantages :
 *   - Pas de couplage dur à la version mineure de @sentry/nextjs.
 *   - Idempotent : si Sentry n'est pas configuré, le wrapper est purement
 *     un try/catch + log structuré.
 *   - Conserve la signature Next.js : (req, ctx) => Response | Promise<Response>.
 *
 * Usage :
 *   export const POST = withSentry('/api/factures/cloturer', async (req) => { ... })
 */

import { logError } from './logger'

type AnyHandler = (...args: unknown[]) => Promise<Response> | Response

export function withSentry<H extends AnyHandler>(routeName: string, handler: H): H {
  const wrapped = (async (...args: Parameters<H>) => {
    const t0 = Date.now()
    try {
      const res = await handler(...args)
      return res
    } catch (err) {
      logError(err, { route: routeName, duration_ms: Date.now() - t0 })
      // On laisse Next.js renvoyer un 500 — on ne masque pas l'erreur.
      throw err
    }
  }) as H
  return wrapped
}

/**
 * withSentryJson — variante qui formate l'erreur en JSON 500 plutôt que de
 * re-throw. À utiliser pour les endpoints internes où on préfère un payload
 * d'erreur stable.
 */
export function withSentryJson<H extends AnyHandler>(routeName: string, handler: H): H {
  const wrapped = (async (...args: Parameters<H>) => {
    const t0 = Date.now()
    try {
      const res = await handler(...args)
      return res
    } catch (err) {
      logError(err, { route: routeName, duration_ms: Date.now() - t0 })
      const message = err instanceof Error ? err.message : 'Internal error'
      return new Response(
        JSON.stringify({ error: 'internal_error', route: routeName, message }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      )
    }
  }) as H
  return wrapped
}
