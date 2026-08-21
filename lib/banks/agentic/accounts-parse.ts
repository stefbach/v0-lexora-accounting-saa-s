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
 * Devises acceptées comme code de compte (ISO 4217 fréquentes à Maurice).
 * Sert à distinguer la colonne « Ccy » d'un mot de 3 lettres quelconque.
 */
const CURRENCY_CODES = new Set([
  'MUR', 'USD', 'EUR', 'GBP', 'ZAR', 'AUD', 'CAD', 'CHF', 'JPY', 'CNY',
  'INR', 'AED', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'KES', 'SCR',
])

/** Numéro de compte : suite de 9 à 18 chiffres (000447954555…). */
const ACCOUNT_TOKEN_RE = /\b\d{9,18}\b/g
/** Montant : « 14,564.18 », « -26.72 », « (1,234.56) » (locale en-US, virgule = milliers). */
const MONEY_TOKEN_RE = /-?\(?\d{1,3}(?:,\d{3})*\.\d{2}\)?|-?\d+\.\d{2}/g

/**
 * Parse le texte concaténé d'UNE ligne de compte (agnostique à la structure :
 * fonctionne que la banque rende un <table> ou une grille de <div> Backbase).
 * Reconnaît le compte à son motif : exactement un numéro de compte, une devise,
 * et un/deux montants (available puis ledger). `null` si la ligne ne contient
 * pas exactement un numéro de compte (en-tête, conteneur multi-lignes, bruit).
 */
export function parseAccountRowText(text: string): AccountRow | null {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return null

  const accounts = clean.match(ACCOUNT_TOKEN_RE)
  if (!accounts || accounts.length !== 1) return null
  const number = accounts[0]

  const currency = (clean.match(/\b[A-Z]{3}\b/g) || []).find((c) => CURRENCY_CODES.has(c))
  const monies = clean.match(MONEY_TOKEN_RE) || []

  // Colonnes MCB : Available balance puis Ledger balance → les deux derniers
  // montants de la ligne. Un seul montant → available uniquement.
  let available: string | undefined
  let ledger: string | undefined
  if (monies.length >= 2) {
    available = monies[monies.length - 2]
    ledger = monies[monies.length - 1]
  } else if (monies.length === 1) {
    available = monies[0]
  }

  return { number, currency, available, ledger }
}

/**
 * Extrait toutes les lignes de comptes à partir des textes de lignes candidats
 * collectés dans le DOM (agnostique table/div). Dédoublonne par numéro et
 * privilégie la ligne la plus riche (celle qui porte les montants).
 */
export function parseAccounts(rowTexts: string[]): AccountRow[] {
  const byNumber = new Map<string, AccountRow>()
  for (const text of rowTexts || []) {
    const row = parseAccountRowText(text)
    if (!row) continue
    const key = normalizeAccountNumber(row.number)
    const existing = byNumber.get(key)
    const richness = (r: AccountRow) => (r.ledger ? 2 : 0) + (r.available ? 1 : 0) + (r.currency ? 1 : 0)
    if (!existing || richness(row) > richness(existing)) byNumber.set(key, row)
  }
  return [...byNumber.values()]
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
