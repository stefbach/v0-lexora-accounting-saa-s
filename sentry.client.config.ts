/**
 * Sentry — client config
 *
 * Init côté navigateur. Si NEXT_PUBLIC_SENTRY_DSN n'est pas défini,
 * l'init est no-op (pas d'erreur, pas de bruit).
 *
 * Sample rates :
 *   - prod : 0.1 (10% des transactions)
 *   - dev  : 1.0 (toutes)
 *
 * Le @sentry/nextjs charge sa propre tree-shakeable build côté browser ;
 * la lib est en devDependency, présente côté build mais pas requise au
 * runtime si DSN absent.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sentry = (() => {
  try {
    return require('@sentry/nextjs')
  } catch {
    return null
  }
})()

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const isProd = process.env.NODE_ENV === 'production'

if (Sentry && dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: isProd ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: isProd ? 0.1 : 1.0,
    // Ne pas remonter les erreurs liées aux extensions browser ou aux résolutions DNS.
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection captured',
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
  })
}

export {}
