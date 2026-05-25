/**
 * SEC-004 — Comparaisons de tokens / secrets / bearers en temps constant.
 *
 * Empêche les attaques par mesure de temps (timing attacks) sur les
 * comparaisons d'octets type `token === expected`. Sur des chaînes longues
 * comparées avec `===`, l'optimisation court-circuit révèle, par mesure de
 * latence réseau répétée, le préfixe correct du secret.
 *
 * Toujours utiliser ces helpers pour :
 *   - INTERNAL_API_TOKEN (cross-route Lexora)
 *   - TELEGRAM_WEBHOOK_SECRET (webhook Telegram)
 *   - CRON_SECRET (Vercel Cron Authorization Bearer)
 *   - tout secret partagé envoyé en header / cookie / query par un client
 *
 * Référence : docs/audit-partials/wave2-F-secu-critique.md (SEC-004, 8/10).
 */
import { timingSafeEqual } from 'crypto'

/**
 * Compare un bearer reçu (potentiellement null/undefined) avec la valeur
 * attendue, en temps constant.
 *
 *   - retourne `false` si l'une des valeurs est absente
 *   - retourne `false` si les longueurs diffèrent (sans révéler la longueur
 *     attendue : la comparaison court-circuite avant timingSafeEqual qui
 *     exige des buffers de même taille)
 *   - sinon, comparaison constant-time via crypto.timingSafeEqual
 */
export function safeBearer(received: string | null | undefined, expected: string): boolean {
  if (!received || !expected) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Alias générique pour comparer deux chaînes secrètes en temps constant.
 */
export function safeEqual(a: string, b: string): boolean {
  return safeBearer(a, b)
}
