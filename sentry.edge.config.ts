/**
 * Sentry — edge config
 *
 * Init côté Edge runtime (middleware, edge route handlers).
 * Mêmes garanties d'idempotence que les autres fichiers : no-op sans DSN.
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
  })
}

export {}
