/**
 * Tests de la machine à états OTP :
 * idle → running → (awaiting_otp ⇄ running) → done | aborted | failed.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OTP_TTL_MS,
  OTP_SESSION_STATES,
  createOtpSession,
  expireIfStale,
  isOtpExpired,
  isTerminal,
  transitionOtpSession,
  type OtpSessionEvent,
  type OtpSessionSnapshot,
} from './otp-state'

const T0 = 1_700_000_000_000

function inState(state: OtpSessionSnapshot['state'], otpRequestedAtMs: number | null = null): OtpSessionSnapshot {
  return { ...createOtpSession(), state, otpRequestedAtMs }
}

describe('transitions valides', () => {
  it('parcours nominal sans OTP : idle → running → done', () => {
    let s = createOtpSession()
    expect(s.state).toBe('idle')
    s = transitionOtpSession(s, { type: 'start' }, T0).snapshot
    expect(s.state).toBe('running')
    s = transitionOtpSession(s, { type: 'complete' }, T0 + 1000).snapshot
    expect(s.state).toBe('done')
  })

  it('parcours OTP : running → awaiting_otp → running → done', () => {
    let s = inState('running')
    s = transitionOtpSession(s, { type: 'otp_required' }, T0).snapshot
    expect(s.state).toBe('awaiting_otp')
    expect(s.otpRequestedAtMs).toBe(T0)
    s = transitionOtpSession(s, { type: 'otp_received' }, T0 + 30_000).snapshot
    expect(s.state).toBe('running')
    expect(s.otpRequestedAtMs).toBeNull()
    s = transitionOtpSession(s, { type: 'complete' }, T0 + 40_000).snapshot
    expect(s.state).toBe('done')
  })

  it('plusieurs allers-retours awaiting_otp ⇄ running sont permis', () => {
    let s = inState('running')
    for (let i = 0; i < 3; i++) {
      s = transitionOtpSession(s, { type: 'otp_required' }, T0 + i * 1000).snapshot
      expect(s.state).toBe('awaiting_otp')
      s = transitionOtpSession(s, { type: 'otp_received' }, T0 + i * 1000 + 500).snapshot
      expect(s.state).toBe('running')
    }
  })

  it('abort et fail enregistrent la raison', () => {
    const aborted = transitionOtpSession(inState('running'), { type: 'abort', reason: 'garde-fou' }, T0).snapshot
    expect(aborted.state).toBe('aborted')
    expect(aborted.endReason).toBe('garde-fou')

    const failed = transitionOtpSession(inState('awaiting_otp', T0), { type: 'fail', reason: 'réseau' }, T0).snapshot
    expect(failed.state).toBe('failed')
    expect(failed.endReason).toBe('réseau')
  })

  it('abort/fail possibles depuis idle (annulation avant démarrage)', () => {
    expect(transitionOtpSession(inState('idle'), { type: 'abort', reason: 'r' }, T0).snapshot.state).toBe('aborted')
    expect(transitionOtpSession(inState('idle'), { type: 'fail', reason: 'r' }, T0).snapshot.state).toBe('failed')
  })
})

describe('transitions invalides', () => {
  const cases: Array<[OtpSessionSnapshot['state'], OtpSessionEvent['type']]> = [
    ['idle', 'otp_required'],
    ['idle', 'otp_received'],
    ['idle', 'complete'],
    ['running', 'start'],
    ['running', 'otp_received'],
    ['awaiting_otp', 'start'],
    ['awaiting_otp', 'otp_required'],
    ['awaiting_otp', 'complete'],
  ]
  for (const [state, eventType] of cases) {
    it(`refuse « ${eventType} » depuis « ${state} »`, () => {
      const snapshot = inState(state, state === 'awaiting_otp' ? T0 : null)
      const result = transitionOtpSession(snapshot, { type: eventType, reason: 'r' } as OtpSessionEvent, T0)
      expect(result.ok).toBe(false)
      // État inchangé.
      expect(result.snapshot).toBe(snapshot)
    })
  }

  it('les états terminaux sont absorbants : aucun événement accepté', () => {
    const eventTypes: OtpSessionEvent['type'][] = ['start', 'otp_required', 'otp_received', 'complete', 'abort', 'fail']
    for (const state of ['done', 'aborted', 'failed'] as const) {
      for (const type of eventTypes) {
        const result = transitionOtpSession(inState(state), { type, reason: 'r' } as OtpSessionEvent, T0)
        expect(result.ok, `${state} + ${type}`).toBe(false)
      }
    }
  })
})

describe('expiration', () => {
  it('isOtpExpired : faux avant TTL, vrai à partir du TTL', () => {
    const s = inState('awaiting_otp', T0)
    expect(isOtpExpired(s, T0 + DEFAULT_OTP_TTL_MS - 1)).toBe(false)
    expect(isOtpExpired(s, T0 + DEFAULT_OTP_TTL_MS)).toBe(true)
  })

  it('isOtpExpired : jamais vrai hors awaiting_otp', () => {
    expect(isOtpExpired(inState('running'), T0 + 10 * DEFAULT_OTP_TTL_MS)).toBe(false)
  })

  it('un code reçu APRÈS expiration fait échouer la session au lieu de reprendre', () => {
    const s = inState('awaiting_otp', T0)
    const result = transitionOtpSession(s, { type: 'otp_received' }, T0 + DEFAULT_OTP_TTL_MS + 1)
    expect(result.ok).toBe(true)
    expect(result.snapshot.state).toBe('failed')
    expect(result.snapshot.endReason).toContain('expiration')
  })

  it('expireIfStale fait tomber une attente périmée en failed, no-op sinon', () => {
    const stale = inState('awaiting_otp', T0)
    const expired = expireIfStale(stale, T0 + DEFAULT_OTP_TTL_MS)
    expect(expired.state).toBe('failed')
    expect(expired.endReason).toContain('expirée')

    const fresh = inState('awaiting_otp', T0)
    expect(expireIfStale(fresh, T0 + 1000)).toBe(fresh)
    const running = inState('running')
    expect(expireIfStale(running, T0 + 10 * DEFAULT_OTP_TTL_MS)).toBe(running)
  })

  it('respecte un TTL personnalisé', () => {
    const s: OtpSessionSnapshot = { ...createOtpSession(1000), state: 'awaiting_otp', otpRequestedAtMs: T0 }
    expect(isOtpExpired(s, T0 + 999)).toBe(false)
    expect(isOtpExpired(s, T0 + 1000)).toBe(true)
  })
})

describe('helpers', () => {
  it('isTerminal', () => {
    for (const state of OTP_SESSION_STATES) {
      expect(isTerminal(state)).toBe(state === 'done' || state === 'aborted' || state === 'failed')
    }
  })
})
