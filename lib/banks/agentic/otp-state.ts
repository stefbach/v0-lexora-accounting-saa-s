/**
 * lib/banks/agentic/otp-state.ts — Machine à états de session OTP (doc §2.4).
 *
 * L'OTP bancaire n'est jamais contourné : il devient un échange asynchrone.
 *   idle → running → (awaiting_otp ⇄ running) → done | aborted | failed
 *
 * Logique pure et déterministe : la persistance (bank_scrape_sessions) et le
 * canal Telegram sont hors de ce module. Le temps est passé en paramètre
 * (`nowMs`) pour rester testable.
 */

export const OTP_SESSION_STATES = [
  'idle',
  'running',
  'awaiting_otp',
  'done',
  'aborted',
  'failed',
] as const

export type OtpSessionState = (typeof OTP_SESSION_STATES)[number]

export type OtpSessionEvent =
  | { type: 'start' }
  | { type: 'otp_required' }
  | { type: 'otp_received' }
  | { type: 'complete' }
  | { type: 'abort'; reason: string }
  | { type: 'fail'; reason: string }

export type OtpSessionSnapshot = {
  state: OtpSessionState
  /** Epoch ms de la demande d'OTP en cours (état awaiting_otp uniquement). */
  otpRequestedAtMs: number | null
  /** Durée de validité d'une demande d'OTP. */
  otpTtlMs: number
  /** Raison de fin pour aborted/failed. */
  endReason: string | null
}

/** TTL par défaut d'une demande d'OTP : 5 minutes (aligné sur les banques). */
export const DEFAULT_OTP_TTL_MS = 5 * 60 * 1000

export function createOtpSession(otpTtlMs: number = DEFAULT_OTP_TTL_MS): OtpSessionSnapshot {
  return { state: 'idle', otpRequestedAtMs: null, otpTtlMs, endReason: null }
}

const TERMINAL_STATES: ReadonlySet<OtpSessionState> = new Set(['done', 'aborted', 'failed'])

export function isTerminal(state: OtpSessionState): boolean {
  return TERMINAL_STATES.has(state)
}

/** Une demande d'OTP en attente est-elle expirée à l'instant `nowMs` ? */
export function isOtpExpired(snapshot: OtpSessionSnapshot, nowMs: number): boolean {
  return (
    snapshot.state === 'awaiting_otp' &&
    snapshot.otpRequestedAtMs !== null &&
    nowMs - snapshot.otpRequestedAtMs >= snapshot.otpTtlMs
  )
}

export type OtpTransitionResult =
  | { ok: true; snapshot: OtpSessionSnapshot }
  | { ok: false; error: string; snapshot: OtpSessionSnapshot /* inchangé */ }

/** Transitions autorisées : état courant → événements admis. */
const ALLOWED_TRANSITIONS: Record<OtpSessionState, ReadonlySet<OtpSessionEvent['type']>> = {
  idle: new Set(['start', 'abort', 'fail']),
  running: new Set(['otp_required', 'complete', 'abort', 'fail']),
  awaiting_otp: new Set(['otp_received', 'abort', 'fail']),
  done: new Set(),
  aborted: new Set(),
  failed: new Set(),
}

/**
 * Applique un événement à la session. Retourne le nouvel état, ou une erreur
 * (état inchangé) si la transition est invalide. La reprise après OTP
 * (`otp_received`) vérifie l'expiration : un code arrivé trop tard fait
 * échouer la session au lieu de la reprendre.
 */
export function transitionOtpSession(
  snapshot: OtpSessionSnapshot,
  event: OtpSessionEvent,
  nowMs: number,
): OtpTransitionResult {
  if (!ALLOWED_TRANSITIONS[snapshot.state].has(event.type)) {
    return {
      ok: false,
      error: `transition invalide : « ${event.type} » depuis l'état « ${snapshot.state} »`,
      snapshot,
    }
  }

  switch (event.type) {
    case 'start':
      return { ok: true, snapshot: { ...snapshot, state: 'running' } }

    case 'otp_required':
      return {
        ok: true,
        snapshot: { ...snapshot, state: 'awaiting_otp', otpRequestedAtMs: nowMs },
      }

    case 'otp_received': {
      if (isOtpExpired(snapshot, nowMs)) {
        return {
          ok: true,
          snapshot: {
            ...snapshot,
            state: 'failed',
            otpRequestedAtMs: null,
            endReason: 'code OTP reçu après expiration de la demande',
          },
        }
      }
      return {
        ok: true,
        snapshot: { ...snapshot, state: 'running', otpRequestedAtMs: null },
      }
    }

    case 'complete':
      return { ok: true, snapshot: { ...snapshot, state: 'done', otpRequestedAtMs: null } }

    case 'abort':
      return {
        ok: true,
        snapshot: { ...snapshot, state: 'aborted', otpRequestedAtMs: null, endReason: event.reason },
      }

    case 'fail':
      return {
        ok: true,
        snapshot: { ...snapshot, state: 'failed', otpRequestedAtMs: null, endReason: event.reason },
      }
  }
}

/**
 * Fait expirer une session `awaiting_otp` dont la demande a dépassé son TTL
 * (appelé par le cron de nettoyage). No-op sur les autres états.
 */
export function expireIfStale(snapshot: OtpSessionSnapshot, nowMs: number): OtpSessionSnapshot {
  if (!isOtpExpired(snapshot, nowMs)) return snapshot
  return {
    ...snapshot,
    state: 'failed',
    otpRequestedAtMs: null,
    endReason: 'demande OTP expirée sans réponse',
  }
}
