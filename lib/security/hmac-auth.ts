/**
 * SEC-005 — HMAC SHA-256 request signing helper.
 *
 * Replaces the static `INTERNAL_API_TOKEN` bearer scheme used by the
 * /api/telegram/internal/* endpoints (56 endpoints) with a signed,
 * time-bound, anti-replay request authentication scheme.
 *
 * Request authentication contract :
 *
 *   Headers (sent by caller, verified by server) :
 *     X-Lex-Timestamp : unix milliseconds (string)
 *     X-Lex-Nonce     : 32 hex chars (16 random bytes)
 *     X-Lex-Signature : "sha256=" + hex(HMAC_SHA256(secret, payload))
 *                       where payload = `${timestamp}.${nonce}.${rawBody}`
 *
 *   Anti-replay :
 *     - Timestamp must be within ±5 minutes of server clock.
 *     - Nonce must be inserted into `telegram_hmac_nonces` (PK on nonce);
 *       a duplicate insert ⇒ nonce already seen ⇒ replay attempt.
 *
 *   Legacy fallback (transition period) :
 *     - If env var LEGACY_BEARER_ALLOWED === 'true', a request may also
 *       authenticate via the historic `X-Internal-Token` bearer.
 *     - To be removed once n8n workflows are migrated to HMAC signing.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

export const HMAC_HEADER_SIGNATURE = 'x-lex-signature'
export const HMAC_HEADER_TIMESTAMP = 'x-lex-timestamp'
export const HMAC_HEADER_NONCE = 'x-lex-nonce'
export const LEGACY_BEARER_HEADER = 'x-internal-token'

export const HMAC_ALLOWED_SKEW_MS = 5 * 60 * 1000 // 5 minutes
export const NONCE_HEX_LENGTH = 32 // 16 bytes

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type HmacVerifyOk = { ok: true; mode: 'hmac' | 'legacy-bearer'; bodyText: string }
export type HmacVerifyErr = { ok: false; reason: string }
export type HmacVerifyResult = HmacVerifyOk | HmacVerifyErr

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Constant-time string equality. Both inputs are first encoded to UTF-8
 * buffers ; mismatched lengths short-circuit (still constant within a
 * given length bucket).
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

/** Random 16-byte nonce, hex-encoded. */
export function randomNonce(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Compute the HMAC-SHA256 signature of a request body.
 * Returns the raw hex digest (no "sha256=" prefix).
 */
export function signRequest(
  bodyText: string,
  secret: string,
  timestamp: string,
  nonce: string,
): string {
  const payload = `${timestamp}.${nonce}.${bodyText}`
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Build a set of HMAC headers + the corresponding signature for a request.
 * Convenience wrapper used by the caller-side helper (`callLexoraHeaders`).
 */
export function buildSignedHeaders(
  bodyText: string,
  secret: string,
): { headers: Record<string, string>; timestamp: string; nonce: string } {
  const timestamp = String(Date.now())
  const nonce = randomNonce()
  const digest = signRequest(bodyText, secret, timestamp, nonce)
  return {
    headers: {
      [HMAC_HEADER_TIMESTAMP]: timestamp,
      [HMAC_HEADER_NONCE]: nonce,
      [HMAC_HEADER_SIGNATURE]: `sha256=${digest}`,
    },
    timestamp,
    nonce,
  }
}

/* -------------------------------------------------------------------------- */
/*  Nonce store                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Try to register a nonce in `telegram_hmac_nonces`. Returns true if the
 * insert succeeded (nonce is fresh), false on PK conflict (replay) or on
 * any other DB error (fail-closed).
 */
export async function registerNonce(nonce: string): Promise<boolean> {
  try {
    const admin = getAdminClient()
    const { error } = await admin.from('telegram_hmac_nonces').insert({ nonce })
    if (error) {
      // 23505 = unique_violation ⇒ replay. Any other error ⇒ fail-closed.
      return false
    }
    return true
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/*  Verification entry point                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Verify an incoming Request against the HMAC contract.
 *
 * Returns `{ ok: true, bodyText }` on success — the caller should use the
 * returned `bodyText` to JSON-parse (avoid double-reading the stream).
 *
 * Failure modes return `{ ok: false, reason }` with a short machine-readable
 * reason. The reason is safe to surface in the 403 response body for
 * debugging (no secret material leaked).
 */
export async function verifyHmac(req: Request): Promise<HmacVerifyResult> {
  const secret =
    process.env.INTERNAL_HMAC_SECRET ||
    process.env.INTERNAL_API_TOKEN ||
    ''

  if (!secret) {
    return { ok: false, reason: 'server_misconfigured_no_secret' }
  }

  const sig = req.headers.get(HMAC_HEADER_SIGNATURE)
  const ts = req.headers.get(HMAC_HEADER_TIMESTAMP)
  const nonce = req.headers.get(HMAC_HEADER_NONCE)

  // ---- Legacy bearer fallback ------------------------------------------
  // Allows n8n / legacy callers to keep working during the migration.
  // Only enabled if LEGACY_BEARER_ALLOWED=true is explicitly set.
  if (!sig || !ts || !nonce) {
    if (process.env.LEGACY_BEARER_ALLOWED === 'true') {
      const bearer = req.headers.get(LEGACY_BEARER_HEADER)
      const legacyToken = process.env.INTERNAL_API_TOKEN || ''
      if (bearer && legacyToken && safeEqual(bearer, legacyToken)) {
        const bodyText = await req.clone().text()
        // eslint-disable-next-line no-console
        console.warn('[SEC-005] legacy bearer used for', req.url)
        return { ok: true, mode: 'legacy-bearer', bodyText }
      }
    }
    return { ok: false, reason: 'missing_hmac_headers' }
  }

  // ---- Timestamp window ------------------------------------------------
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: 'invalid_timestamp' }
  }
  const drift = Math.abs(Date.now() - tsNum)
  if (drift > HMAC_ALLOWED_SKEW_MS) {
    return { ok: false, reason: `timestamp_skew_${drift}ms` }
  }

  // ---- Nonce shape -----------------------------------------------------
  if (!/^[a-f0-9]{32}$/i.test(nonce)) {
    return { ok: false, reason: 'invalid_nonce_shape' }
  }

  // ---- Signature (BEFORE nonce insert, to avoid populating the table
  // with junk on bad-sig spam) ------------------------------------------
  const bodyText = await req.clone().text()
  const expected = `sha256=${signRequest(bodyText, secret, ts, nonce)}`
  if (!safeEqual(sig, expected)) {
    return { ok: false, reason: 'bad_signature' }
  }

  // ---- Anti-replay (last, only on otherwise-valid requests) ------------
  const fresh = await registerNonce(nonce)
  if (!fresh) {
    return { ok: false, reason: 'nonce_replay_or_db_error' }
  }

  return { ok: true, mode: 'hmac', bodyText }
}
