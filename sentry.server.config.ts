/**
 * Sentry — server config (Node + Edge)
 *
 * Init côté serveur (Node runtime + Edge runtime). Si NEXT_PUBLIC_SENTRY_DSN
 * n'est pas défini, l'init est no-op.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sentry = (() => {
  try {
    return require('@sentry/nextjs')
  } catch {
    return null
  }
})()

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
const isProd = process.env.NODE_ENV === 'production'

if (Sentry && dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: isProd ? 0.1 : 1.0,
    // Filtres : on ne veut pas spammer Sentry avec les erreurs Supabase
    // attendues (RLS denial, 401 expected) — celles-ci sont catch et loguées
    // en INFO côté logger.
    ignoreErrors: [
      'AbortError',
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
    ],
  })
}

export {}
