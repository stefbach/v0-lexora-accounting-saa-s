/**
 * Next.js instrumentation hook.
 * Appelé une fois au démarrage du serveur (Node ou Edge runtime).
 * On délègue à sentry.{server,edge}.config.ts via require — le require lui-même
 * est protégé par try/catch dans ces fichiers, donc l'absence du DSN ne
 * provoque aucune erreur.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * Hook Next.js 15+ : remonte automatiquement les erreurs des Server Components,
 * Server Actions et Route Handlers vers Sentry.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string }
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN && !process.env.SENTRY_DSN) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nextjs') as {
      captureRequestError?: (e: unknown, req: unknown, ctx: unknown) => void
      captureException?: (e: unknown, opts?: unknown) => void
    }
    if (typeof Sentry.captureRequestError === 'function') {
      Sentry.captureRequestError(err, request, context)
    } else if (typeof Sentry.captureException === 'function') {
      Sentry.captureException(err, { extra: { request, context } })
    }
  } catch {
    // ignore — instrumentation never breaks the request
  }
}
