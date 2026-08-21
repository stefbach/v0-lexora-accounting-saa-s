/**
 * Lecture intelligente du tableau « Accounts » (MCB Internet Banking Pro et
 * équivalents) : trouver la ligne du compte ciblé et en extraire le solde.
 *
 * La page liste tous les comptes de la société (Number / Type / Ccy /
 * Available balance / Ledger balance). Le rapprochement du bon compte doit être
 * tolérant au formatage (espaces, préfixes de zéros) : « 000447954555 » peut
 * s'afficher « 000447954555 », « 0004 4795 4555 », etc.
 *
 * Déterministe, pur, testé — la logique de matching/parse vit ici (Node), pas
 * dans le navigateur. Réutilise parseAmount (lib/utils/bank-amount) pour les
 * montants (« 14,564.18 », « -26.72 », parenthèses comptables).
 */

import { parseAmount } from '../../utils/bank-amount'

export interface AccountRow {
  number: string
  currency?: string
  /** Solde disponible brut (texte de la cellule). */
  available?: string
  /** Solde comptable / ledger brut (texte de la cellule). */
  ledger?: string
}

export interface AccountBalance {
  number: string
  currency: string | null
  /** Solde comptable (ledger) si présent, sinon disponible. C'est le solde de rapprochement. */
  balance: number
  available: number | null
  ledger: number | null
}

/** Réduit un numéro de compte à ses caractères significatifs pour le matching. */
export function normalizeAccountNumber(s: string): string {
  return (s || '').replace(/[^0-9a-zA-Z]/g, '')
}

/** Deux numéros de compte désignent-ils le même compte (tolérant au formatage) ? */
export function accountNumbersMatch(a: string, b: string): boolean {
  const na = normalizeAccountNumber(a)
  const nb = normalizeAccountNumber(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Tolère un préfixe de zéros différent (« 447954555 » vs « 000447954555 »).
  const sa = na.replace(/^0+/, '')
  const sb = nb.replace(/^0+/, '')
  return sa.length >= 6 && sa === sb
}

function toAmount(raw?: string): number | null {
  if (raw == null || String(raw).trim() === '') return null
  try {
    return parseAmount(raw)
  } catch {
    return null
  }
}

/**
 * Trouve le compte ciblé dans la liste et en extrait le solde.
 * `null` si le compte n'est pas présent. Le solde de rapprochement = ledger si
 * disponible (solde comptable / livre), sinon available.
 */
export function findAccountBalance(rows: AccountRow[], target: string): AccountBalance | null {
  if (!rows || rows.length === 0) return null
  const row = rows.find((r) => accountNumbersMatch(r.number, target))
  if (!row) return null

  const available = toAmount(row.available)
  const ledger = toAmount(row.ledger)
  const balance = ledger ?? available
  if (balance == null) return null

  return {
    number: normalizeAccountNumber(row.number),
    currency: row.currency ? row.currency.trim().toUpperCase() : null,
    balance,
    available,
    ledger,
  }
}
