/**
 * Extraction TOLÉRANTE des données bancaires depuis les réponses JSON de l'API
 * interne du portail (Backbase pour MCB : `ibpro.mcb.mu/api/...`).
 *
 * Pourquoi : cliquer/scroller dans un SPA est fragile (« à l'aveugle, étape par
 * étape »). Le SPA, lui, charge ses données depuis sa propre API REST. Une fois
 * la session authentifiée (cookies), on capte ces réponses et on lit comptes /
 * transactions / relevés en DONNÉES STRUCTURÉES — sans navigation ni sélecteurs.
 *
 * L'intelligence est ici : on ne connaît pas la nomenclature exacte des champs
 * (elle varie entre banques et versions), donc on reconnaît les données par
 * MOTIF, en marchant récursivement dans n'importe quel JSON :
 *   - un compte = un objet avec un numéro de compte (9-18 chiffres) + un/des
 *     soldes (booked/ledger, available) ;
 *   - une transaction = un élément de tableau avec une date + un montant ;
 *   - un montant Backbase peut être un objet { amount, currencyCode }.
 *
 * Déterministe, pur, testé. Réutilise les types AccountRow / RawTransactionRow /
 * RawStatementRow des autres modules pour que le downstream ne change pas.
 */

import type { AccountRow } from './accounts-parse'
import type { RawTransactionRow } from './transactions-parse'
import { dedupeRawTransactions, normalizeStatementDate } from './transactions-parse'
import type { RawStatementRow } from './statements-parse'

const ACCOUNT_RE = /\b\d{9,18}\b/

type Json = unknown

/** Applique `cb` sur chaque objet simple rencontré (récursif, sûr). */
function walkObjects(root: Json, cb: (obj: Record<string, unknown>) => void, depth = 0): void {
  if (root == null || depth > 12) return
  if (Array.isArray(root)) {
    for (const item of root) walkObjects(item, cb, depth + 1)
    return
  }
  if (typeof root === 'object') {
    cb(root as Record<string, unknown>)
    for (const v of Object.values(root as Record<string, unknown>)) walkObjects(v, cb, depth + 1)
  }
}

/** Applique `cb` sur chaque tableau rencontré (récursif, sûr). */
function walkArrays(root: Json, cb: (arr: unknown[]) => void, depth = 0): void {
  if (root == null || depth > 12) return
  if (Array.isArray(root)) {
    cb(root)
    for (const item of root) walkArrays(item, cb, depth + 1)
    return
  }
  if (typeof root === 'object') {
    for (const v of Object.values(root as Record<string, unknown>)) walkArrays(v, cb, depth + 1)
  }
}

/** Normalise une valeur monétaire (nombre, chaîne, ou objet Backbase {amount,…}). */
export function moneyToString(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : undefined
  if (typeof v === 'string') return /\d/.test(v) ? v : undefined
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('amount' in o) return moneyToString(o.amount)
    if ('value' in o) return moneyToString(o.value)
  }
  return undefined
}

/** Devise depuis une valeur (chaîne ISO ou objet {currencyCode|currency}). */
function currencyOf(v: unknown): string | undefined {
  if (typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim())) return v.trim()
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const c = o.currencyCode ?? o.currency ?? o.ccy
    if (typeof c === 'string' && /^[A-Z]{3}$/.test(c.trim())) return c.trim()
  }
  return undefined
}

/**
 * Extrait les comptes trouvés dans un JSON d'API quelconque.
 * Reconnaît un compte à : un numéro (9-18 chiffres, clé type BBAN/IBAN/number)
 * + au moins un solde (available / booked-ledger / balance).
 */
export function findAccountsInJson(root: Json): AccountRow[] {
  const out: AccountRow[] = []
  const seen = new Set<string>()

  walkObjects(root, (obj) => {
    // 1) Numéro de compte : clé explicite d'abord, sinon toute chaîne-numéro.
    let number: string | undefined
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string') continue
      if (/bban|iban|accountnumber|account_no|acctid|\bnumber\b/i.test(k)) {
        const m = v.match(ACCOUNT_RE)
        if (m) { number = m[0]; break }
      }
    }
    if (!number) return // pas d'indice de numéro de compte → pas un compte

    // 2) Devise (clé dédiée ou objet monétaire imbriqué).
    let currency: string | undefined
    for (const [k, v] of Object.entries(obj)) {
      if (/curr|ccy/i.test(k)) { currency = currencyOf(v); if (currency) break }
    }

    // 3) Soldes : available / booked-ledger / générique.
    let available: string | undefined
    let ledger: string | undefined
    let generic: string | undefined
    for (const [k, v] of Object.entries(obj)) {
      if (!/balance|amount/i.test(k)) continue
      const s = moneyToString(v)
      if (s == null) continue
      if (!currency) currency = currencyOf(v)
      if (/avail/i.test(k)) available = available ?? s
      else if (/book|ledger/i.test(k)) ledger = ledger ?? s
      else generic = generic ?? s
    }
    if (ledger == null) ledger = generic
    if (available == null && ledger == null) return // aucun solde exploitable

    const key = number.replace(/\D/g, '').replace(/^0+/, '')
    if (seen.has(key)) return
    seen.add(key)
    out.push({ number, currency, available, ledger })
  })

  return out
}

/** Un compte avec son identifiant d'arrangement Backbase (pour appels API directs). */
export interface ArrangementRef {
  id: string
  number: string
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Extrait les couples { arrangementId, numéro de compte } d'une réponse
 * `productsummary/arrangements` (Backbase). L'arrangementId (UUID) permet
 * d'appeler DIRECTEMENT l'API transaction-manager du compte ciblé, sans piloter
 * le SPA. On reconnaît l'objet arrangement à : un numéro de compte + un champ
 * id/arrangementId de type UUID (ou identifiant long).
 */
export function findArrangementIds(root: Json): ArrangementRef[] {
  const out: ArrangementRef[] = []
  const seen = new Set<string>()

  walkObjects(root, (obj) => {
    let number: string | undefined
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string') continue
      if (/bban|iban|accountnumber|account_no|acctid|\bnumber\b/i.test(k)) {
        const m = v.match(ACCOUNT_RE)
        if (m) { number = m[0]; break }
      }
    }
    if (!number) return

    // id d'arrangement : UUID prioritaire, sinon champ id/arrangementId long.
    let id: string | undefined
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string') continue
      if (/(^id$|arrangementid|productid|resourceid|internalid)/i.test(k)) {
        if (UUID_RE.test(v) || v.length >= 16) { id = v; break }
      }
    }
    if (!id) return

    const key = number.replace(/\D/g, '').replace(/^0+/, '')
    if (seen.has(key)) return
    seen.add(key)
    out.push({ id, number })
  })

  return out
}

/** Agrège findArrangementIds sur toutes les réponses captées. */
export function arrangementsFromCaptured(responses: CapturedApiResponse[]): ArrangementRef[] {
  const byNumber = new Map<string, ArrangementRef>()
  for (const r of responses || []) {
    for (const a of findArrangementIds(r.json)) {
      const key = a.number.replace(/\D/g, '').replace(/^0+/, '')
      if (!byNumber.has(key)) byNumber.set(key, a)
    }
  }
  return [...byNumber.values()]
}

function transactionFromObject(o: Record<string, unknown>): RawTransactionRow | null {
  let transactionDate: string | undefined
  let valueDate: string | undefined
  let amount: string | undefined
  let balance: string | undefined
  let reference: string | undefined
  let description: string | undefined

  for (const [k, v] of Object.entries(o)) {
    const isString = typeof v === 'string'
    if (/value.*date|date.*value/i.test(k) && isString) valueDate = valueDate ?? (v as string)
    else if (/(booking|transaction|posting|operation|entry)?.*date|^date$/i.test(k) && isString) transactionDate = transactionDate ?? (v as string)

    if (/amount/i.test(k) && amount == null) amount = moneyToString(v)
    if (/running.*balance|balance.*after|\bbalance\b/i.test(k) && balance == null) balance = moneyToString(v)
    if (/reference|endtoend|paymentid|transactionid/i.test(k) && isString && reference == null) reference = v as string
    if (/description|narrative|counterparty|remittance|details|\btype\b/i.test(k) && isString && description == null) {
      description = v as string
    }
  }

  // Date de valeur peut avoir capté la seule date : replier.
  if (!transactionDate && valueDate) transactionDate = valueDate
  if (!transactionDate || amount == null) return null

  // Sens crédit/débit : MCB/Backbase renvoie un montant POSITIF + un indicateur
  // séparé (creditDebitIndicator = « DBIT »/« CRDT »). Sans ce signe, tous les
  // mouvements finiraient en crédit. On applique le signe négatif aux débits.
  if (!/^-/.test(amount.trim())) {
    let indicator = ''
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' &&
          /credit.?debit.?ind|debit.?credit.?ind|creditdebit|^indicator$|^direction$|^sens$|creditordebit/i.test(k)) {
        indicator = v; break
      }
    }
    // Repli : n'importe quelle valeur exactement égale à DBIT/CRDT/DEBIT/CREDIT.
    if (!indicator) {
      for (const v of Object.values(o)) {
        if (typeof v === 'string' && /^(dbit|crdt|debit|credit|dr|cr)$/i.test(v.trim())) { indicator = v; break }
      }
    }
    if (/^(d|dbit|debit|dr|deb)$/i.test(indicator.trim())) amount = '-' + amount.trim()
  }

  return {
    transactionDate,
    valueDate: valueDate || transactionDate,
    reference,
    description,
    amount,
    balance,
  }
}

/**
 * Extrait les transactions du plus grand tableau d'objets « transaction » (une
 * date + un montant) trouvé dans le JSON. Robuste aux enveloppes ({ data: [...],
 * _embedded: { transactions: [...] } }, etc.).
 */
export function findTransactionsInJson(root: Json): RawTransactionRow[] {
  let best: RawTransactionRow[] = []
  walkArrays(root, (arr) => {
    const rows: RawTransactionRow[] = []
    for (const el of arr) {
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        const r = transactionFromObject(el as Record<string, unknown>)
        if (r) rows.push(r)
      }
    }
    if (rows.length > best.length) best = rows
  })
  return best
}

/**
 * Union DÉDOUBLONNÉE des transactions trouvées dans TOUTES les réponses captées.
 *
 * Différence clé avec extractFromCaptured (qui ne garde que la plus grosse
 * réponse) : quand le relevé est PAGINÉ, chaque page est une réponse API
 * distincte captée au fil des clics « suivant / load more ». Ne prendre que la
 * plus grosse ferait perdre les autres pages. Ici on concatène les transactions
 * de chaque réponse puis on dédoublonne (référence FT… ou date+montant+libellé),
 * de sorte que le total couvre toutes les pages chargées par le SPA.
 */
export function transactionsFromCaptured(responses: CapturedApiResponse[]): RawTransactionRow[] {
  const all: RawTransactionRow[] = []
  for (const r of responses || []) {
    const rows = findTransactionsInJson(r.json)
    if (rows.length > 0) all.push(...rows)
  }
  return dedupeRawTransactions(all)
}

const STATEMENT_DATE_KEY = /statement.?date|generat|created|issue|period|^date$|^from$|^to$|fromdate|todate|start|end/i

function statementFromObject(o: Record<string, unknown>): RawStatementRow | null {
  let dateGenerated: string | undefined
  let docType: string | undefined
  let filename: string | undefined
  let downloadHref: string | undefined

  // Date : on n'accepte QUE des valeurs réellement parsables comme date (ISO,
  // ISO datetime, YYYY-MM, « 31 Jul 2026 »…). Sinon un motif de clé trop large
  // (« from »/« to » présent dans « total », « amount »…) capterait un montant
  // ou un code devise et produirait de faux « relevés » non datés (bug observé :
  // API 10 → parsés 0). On garde la date parsable la plus prometteuse.
  for (const [k, v] of Object.entries(o)) {
    if (typeof v !== 'string') continue
    if (!STATEMENT_DATE_KEY.test(k)) continue
    if (normalizeStatementDate(v) && dateGenerated == null) dateGenerated = v
  }

  for (const [k, v] of Object.entries(o)) {
    const isString = typeof v === 'string'
    if (/type|category|kind/i.test(k) && isString && docType == null) docType = v as string
    if (/name|filename|title|label/i.test(k) && isString && filename == null) filename = v as string
    if (/url|href|link|download|uri/i.test(k) && isString && /http|\/|\.pdf/i.test(v as string) && downloadHref == null) {
      downloadHref = v as string
    }
  }

  if (!dateGenerated) return null
  return { dateGenerated, docType, filename, downloadHref }
}

/** Extrait les relevés (métadonnées + lien) du plus grand tableau adéquat. */
export function findStatementsInJson(root: Json): RawStatementRow[] {
  let best: RawStatementRow[] = []
  walkArrays(root, (arr) => {
    const rows: RawStatementRow[] = []
    for (const el of arr) {
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        const r = statementFromObject(el as Record<string, unknown>)
        if (r) rows.push(r)
      }
    }
    if (rows.length > best.length) best = rows
  })
  return best
}

/** Une réponse d'API captée pendant le scrape (URL + JSON décodé). */
export interface CapturedApiResponse {
  url: string
  status: number
  json: Json
}

/** L'URL ressemble-t-elle à une API de données bancaires (à capter) ? */
export function isBankApiUrl(url: string): boolean {
  return /\/api\/|arrangement|product-summary|account|balance|transaction|statement|document/i.test(url)
}

/**
 * Agrège l'extraction sur toutes les réponses captées. Prend, pour chaque type,
 * le meilleur résultat (le plus complet) parmi les réponses.
 */
export function extractFromCaptured(responses: CapturedApiResponse[]): {
  accounts: AccountRow[]
  transactions: RawTransactionRow[]
  statements: RawStatementRow[]
} {
  let accounts: AccountRow[] = []
  let transactions: RawTransactionRow[] = []
  let statements: RawStatementRow[] = []
  for (const r of responses || []) {
    const a = findAccountsInJson(r.json)
    if (a.length > accounts.length) accounts = a
    const t = findTransactionsInJson(r.json)
    if (t.length > transactions.length) transactions = t
    const s = findStatementsInJson(r.json)
    if (s.length > statements.length) statements = s
  }
  return { accounts, transactions, statements }
}
