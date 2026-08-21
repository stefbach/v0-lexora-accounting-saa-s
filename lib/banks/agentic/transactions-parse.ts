/**
 * Lecture intelligente du tableau « Transactions » (MCB Internet Banking Pro et
 * équivalents) : transformer les lignes brutes du relevé en mouvements
 * normalisés, prêts pour le rapprochement bancaire.
 *
 * Structure réelle observée (société DIGITAL DATA SOL LTD, compte MUR) :
 *   Transaction date | Value date | Reference   | Description                     | Amount     | Balance
 *   20 Aug 2026      | 20 Aug 2026| FT262327YRQX| E-Commerce Transaction Fee|... | -4.72      | 14,564.21
 *   17 Aug 2026      | 17 Aug 2026| FT26229L0Z0S| Bulk Payment|HONORAIRES ...    | -58,072.00 | 21,791.93
 *
 * Particularités gérées :
 *   - dates « 20 Aug 2026 » (JJ MMM AAAA) → ISO « 2026-08-20 » ;
 *   - montants signés avec séparateur de milliers (« -58,072.00 », « 800.00 »),
 *     crédits en vert / débits en noir → le SIGNE fait foi, pas la couleur ;
 *   - solde courant (running balance) conservé pour audit / contrôle de suite ;
 *   - description « Type|Libellé » nettoyée mais conservée intégralement ;
 *   - référence FT… conservée pour dédoublonnage entre exécutions.
 *
 * Déterministe, pur, testé — la logique de parse vit ici (Node), pas dans le
 * navigateur. Réutilise parseAmount (lib/utils/bank-amount) pour les montants.
 */

import { parseAmount } from '../../utils/bank-amount'

/** Ligne brute extraite du DOM (header-mappée côté navigateur). */
export interface RawTransactionRow {
  /** Date d'opération, texte brut (« 20 Aug 2026 », « 20/08/2026 »…). */
  transactionDate?: string
  /** Date de valeur, texte brut (optionnel). */
  valueDate?: string
  /** Référence bancaire (« FT262327YRQX »). */
  reference?: string
  /** Libellé (« Bulk Payment|HONORAIRES MEDECINS Juil 2026 »). */
  description?: string
  /** Montant signé, texte brut (« -58,072.00 », « 800.00 »). */
  amount?: string
  /** Solde courant après opération, texte brut (« 14,564.21 »). */
  balance?: string
}

export interface ParsedTransaction {
  /** Date d'opération ISO (YYYY-MM-DD). */
  date: string
  /** Date de valeur ISO si disponible, sinon égale à `date`. */
  value_date: string
  reference: string | null
  description: string
  /** Montant signé : négatif = débit, positif = crédit. */
  amount: number
  /** Solde courant après l'opération (running balance), si lisible. */
  balance_after: number | null
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  // variantes FR fréquentes sur certains portails
  fev: '02', avr: '04', mai: '05', juin: '06', juil: '07', aout: '08',
  aoû: '08', déc: '12',
}

/**
 * Normalise une date de relevé vers ISO (YYYY-MM-DD).
 * Gère « 20 Aug 2026 », « 20/08/2026 », « 2026-08-20 », « 20-08-26 ».
 * Retourne `null` si la date est illisible.
 */
export function normalizeStatementDate(raw?: string): string | null {
  const s = (raw || '').trim()
  if (!s) return null

  // Déjà ISO ?
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // « 20 Aug 2026 » / « 20 August 2026 » / « 20-Aug-2026 »
  const named = s.match(/^(\d{1,2})[\s\-]+([A-Za-zÀ-ÿ]{3,})\.?[\s\-]+(\d{2,4})$/)
  if (named) {
    const day = named[1].padStart(2, '0')
    const monKey = named[2]
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .slice(0, 4)
    const mon = MONTHS[monKey] || MONTHS[monKey.slice(0, 3)]
    if (!mon) return null
    const year = named[3].length === 2 ? `20${named[3]}` : named[3]
    return `${year}-${mon}-${day}`
  }

  // « 20/08/2026 » / « 20-08-2026 » / « 20.08.26 » (JJ/MM/AAAA)
  const numeric = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (numeric) {
    const day = numeric[1].padStart(2, '0')
    const mon = numeric[2].padStart(2, '0')
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]
    if (Number(mon) < 1 || Number(mon) > 12) return null
    return `${year}-${mon}-${day}`
  }

  return null
}

function toAmountOrNull(raw?: string): number | null {
  if (raw == null || String(raw).trim() === '') return null
  try {
    return parseAmount(raw)
  } catch {
    return null
  }
}

/** Nettoie une description sans en perdre l'information (« A|B|C » conservé). */
function cleanDescription(raw?: string): string {
  return (raw || '').replace(/\s+/g, ' ').trim()
}

/**
 * Parse une ligne brute. `null` si la ligne n'est pas un mouvement exploitable
 * (date illisible ou montant absent) — évite d'injecter du bruit (en-têtes,
 * lignes de totaux) dans le rapprochement.
 */
export function parseTransactionRow(row: RawTransactionRow): ParsedTransaction | null {
  const date = normalizeStatementDate(row.transactionDate)
  if (!date) return null

  const amount = toAmountOrNull(row.amount)
  if (amount == null) return null

  const valueDate = normalizeStatementDate(row.valueDate) || date
  const reference = (row.reference || '').trim() || null

  return {
    date,
    value_date: valueDate,
    reference,
    description: cleanDescription(row.description),
    amount,
    balance_after: toAmountOrNull(row.balance),
  }
}

/**
 * Parse un tableau complet de lignes brutes en mouvements normalisés.
 * Ignore silencieusement les lignes non exploitables. Ordre préservé
 * (le plus récent en tête, tel qu'affiché par MCB).
 */
export function parseTransactions(rows: RawTransactionRow[]): ParsedTransaction[] {
  if (!rows || rows.length === 0) return []
  const out: ParsedTransaction[] = []
  for (const row of rows) {
    const parsed = parseTransactionRow(row)
    if (parsed) out.push(parsed)
  }
  return out
}

/**
 * Clé de dédoublonnage stable entre exécutions quotidiennes : référence si
 * présente (unique côté banque), sinon date+montant+description. Permet au cron
 * d'ignorer les mouvements déjà enregistrés lors d'un run précédent.
 */
export function transactionDedupeKey(tx: ParsedTransaction): string {
  if (tx.reference) return `ref:${tx.reference}`
  return `dmd:${tx.date}|${tx.amount.toFixed(2)}|${tx.description.slice(0, 40).toLowerCase()}`
}

/**
 * Contrôle de cohérence : sur un relevé trié du plus récent au plus ancien,
 * `balance_after[n] - amount[n]` doit égaler `balance_after[n+1]` (à un epsilon
 * près). Retourne la liste des index où la suite est rompue — signal fort d'une
 * extraction incomplète (pagination manquée) ou d'un montant mal lu.
 */
export function findBalanceBreaks(txs: ParsedTransaction[], epsilon = 0.01): number[] {
  const breaks: number[] = []
  for (let i = 0; i < txs.length - 1; i++) {
    const cur = txs[i]
    const next = txs[i + 1]
    if (cur.balance_after == null || next.balance_after == null) continue
    const expectedPrev = cur.balance_after - cur.amount
    if (Math.abs(expectedPrev - next.balance_after) > epsilon) breaks.push(i)
  }
  return breaks
}
