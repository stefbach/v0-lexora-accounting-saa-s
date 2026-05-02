/**
 * Lexora — Observability helpers
 *
 * Pourquoi un wrapper plutôt que d'appeler @sentry/nextjs directement ?
 *   1. Sentry est optionnel : si NEXT_PUBLIC_SENTRY_DSN n'est pas défini,
 *      l'init est no-op et Sentry.captureException existe quand même mais
 *      on évite tout import qui plante au build.
 *   2. On veut un format de log structuré (JSON sur stdout/stderr) que
 *      Vercel pousse vers Logflare/Datadog/etc.
 *   3. Les helpers acceptent une `meta` (champs business : societe_id,
 *      user_id, action, target_id) pour faciliter le triage.
 *
 * Usage :
 *   import { logEvent, logError } from '@/lib/observability/logger'
 *   logEvent('paie.verrouillage.success', { societe_id, periode })
 *   try { ... } catch (err) { logError(err, { route: '/api/paie/lock' }) }
 */

type Meta = Record<string, unknown>

type Severity = 'debug' | 'info' | 'warn' | 'error'

type SentryLike = {
  captureException?: (e: unknown, opts?: unknown) => void
  captureMessage?: (msg: string, opts?: unknown) => void
  setContext?: (k: string, v: unknown) => void
}

/**
 * Charge Sentry de façon paresseuse. On ne require() que si le DSN est
 * configuré, pour éviter d'embarquer la lib sur le client si non utilisée.
 */
function getSentry(): SentryLike | null {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null
  try {
    // require au lieu d'import dynamique : évite la promesse, accès synchrone
    // au runtime déjà initialisé par sentry.{client,server}.config.ts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nextjs') as SentryLike
    return Sentry
  } catch {
    return null
  }
}

function timestamp(): string {
  return new Date().toISOString()
}

function emit(severity: Severity, message: string, meta?: Meta): void {
  const payload = {
    ts: timestamp(),
    level: severity,
    msg: message,
    ...(meta || {}),
  }
  const line = JSON.stringify(payload, replacer)
  if (severity === 'error') {
    // eslint-disable-next-line no-console
    console.error(line)
  } else if (severity === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line)
  } else {
    // eslint-disable-next-line no-console
    console.log(line)
  }
}

/**
 * JSON.stringify replacer qui sérialise les Error proprement.
 */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  return value
}

/**
 * Log d'un événement métier (succès, étape importante, etc.).
 * Push vers stdout (JSON structuré) + breadcrumb Sentry.
 */
export function logEvent(action: string, meta?: Meta): void {
  emit('info', action, meta)
  const sentry = getSentry()
  if (sentry?.captureMessage && meta?.captureToSentry) {
    try {
      sentry.captureMessage(action, { level: 'info', extra: meta })
    } catch {
      // ignore — ne jamais faire planter le caller
    }
  }
}

/**
 * Log d'une erreur avec contexte. Toujours pushé vers Sentry si configuré.
 */
export function logError(err: unknown, ctx?: Meta): void {
  const message = err instanceof Error ? err.message : String(err)
  emit('error', message, { ...(ctx || {}), error: err })
  const sentry = getSentry()
  if (sentry?.captureException) {
    try {
      sentry.captureException(err, ctx ? { extra: ctx } : undefined)
    } catch {
      // ignore
    }
  }
}

/**
 * Variante warn — événement attendu mais notable (timeout, retry, fallback).
 */
export function logWarn(message: string, meta?: Meta): void {
  emit('warn', message, meta)
  const sentry = getSentry()
  if (sentry?.captureMessage) {
    try {
      sentry.captureMessage(message, { level: 'warning', extra: meta })
    } catch {
      // ignore
    }
  }
}

/**
 * Variante debug — uniquement dev (NODE_ENV !== 'production').
 */
export function logDebug(message: string, meta?: Meta): void {
  if (process.env.NODE_ENV === 'production') return
  emit('debug', message, meta)
}

/**
 * Wrapper utilitaire : exécute fn() en tracant les erreurs.
 * Retourne le résultat ou rethrow l'erreur originale après log.
 */
export async function withErrorLogging<T>(
  ctx: Meta,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logError(err, ctx)
    throw err
  }
}
