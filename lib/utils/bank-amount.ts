/**
 * Locale-aware amount parser for bank statement OCR pipelines.
 *
 * Problem this solves (see docs/OCR_AUDIT_2026-04.md):
 *  - F4: `parseFloat("1.234,56")` returns 1.234 (massive precision loss on closing balances)
 *  - F5: `Number("1,234.56")` returns NaN, often masked by `|| 0`, producing
 *        silent 0-MUR transactions.
 *
 * Design decisions:
 *  - Pure function, zero runtime dependency.
 *  - Format detection is lexical (last of `.` or `,` wins as decimal separator),
 *    NOT based on `Intl.NumberFormat` — the runtime locale must not influence
 *    the numerical value of an OCR'd bank statement.
 *  - Explicit throw on unparseable non-empty input: refusing to parse beats
 *    returning NaN/0 and corrupting downstream ledgers.
 *  - Accounting parentheses are treated as the negative sign (US convention).
 */

export class ParseAmountError extends Error {
  public readonly raw: unknown

  constructor(raw: unknown) {
    const preview =
      typeof raw === "string"
        ? raw
        : raw === null
          ? "null"
          : raw === undefined
            ? "undefined"
            : String(raw)
    super(`montant illisible: ${preview}`)
    this.name = "ParseAmountError"
    this.raw = raw
  }
}

/**
 * Parse a monetary amount from an ambiguous string (European or Anglo-Saxon format).
 *
 * Rules (in order):
 *  1. If already a finite number: return as-is.
 *  2. If empty string / null / undefined: return 0.
 *  3. Detect accounting parentheses `(1,234.56)` → negative.
 *  4. Strip any character that is not digit, `.`, `,`, whitespace or `-`.
 *  5. The last occurrence of `.` or `,` is the decimal separator;
 *     all other `.` / `,` and whitespace are thousands separators → removed.
 *  6. If result is not a finite number: throw `ParseAmountError`.
 *
 * Examples:
 *   parseAmount("1,234.56")       → 1234.56   (US)
 *   parseAmount("1.234,56")       → 1234.56   (EU)
 *   parseAmount("1 234 567,89")   → 1234567.89 (FR/BE)
 *   parseAmount("50,000")         → 50000     (no decimal, comma = thousands)
 *   parseAmount("50.00")          → 50
 *   parseAmount("0")              → 0
 *   parseAmount("")               → 0
 *   parseAmount(null)             → 0
 *   parseAmount(1234.56)          → 1234.56
 *   parseAmount("abc")            → throws ParseAmountError
 *   parseAmount("-1,234.50")      → -1234.5
 *   parseAmount("(1,234.56)")     → -1234.56
 *
 * @throws ParseAmountError when the string is non-empty and cannot be parsed.
 */
export function parseAmount(raw: unknown): number {
  // 1. Already a number
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      throw new ParseAmountError(raw)
    }
    return raw
  }

  // 2. Nullish → 0
  if (raw === null || raw === undefined) {
    return 0
  }

  // Reject anything that is not a string from here on
  if (typeof raw !== "string") {
    throw new ParseAmountError(raw)
  }

  const trimmed = raw.trim()
  if (trimmed === "") {
    return 0
  }

  // 3. Accounting parentheses → negative
  let negative = false
  let working = trimmed
  const parenMatch = /^\((.+)\)$/.exec(working)
  if (parenMatch) {
    negative = true
    working = parenMatch[1].trim()
  }

  // Handle leading sign
  if (working.startsWith("-")) {
    negative = !negative
    working = working.slice(1).trim()
  } else if (working.startsWith("+")) {
    working = working.slice(1).trim()
  }

  // Reject any remaining sign char inside (e.g. "--123", "1-2")
  if (working.includes("-") || working.includes("+")) {
    throw new ParseAmountError(raw)
  }

  // 4. Strip all chars except digits, `.`, `,`, whitespace
  //    (currency symbols, letters, etc. are removed)
  const cleaned = working.replace(/[^\d.,\s]/g, "").replace(/\s+/g, "")

  if (cleaned === "") {
    throw new ParseAmountError(raw)
  }

  // After stripping noise, only digits + `.` + `,` should remain
  if (!/^[\d.,]+$/.test(cleaned)) {
    throw new ParseAmountError(raw)
  }

  // 5. Detect decimal separator = last of `.` or `,`
  const lastDot = cleaned.lastIndexOf(".")
  const lastComma = cleaned.lastIndexOf(",")

  let normalized: string
  if (lastDot === -1 && lastComma === -1) {
    // Pure digits
    normalized = cleaned
  } else {
    const decimalSep = lastDot > lastComma ? "." : ","
    const thousandsSep = decimalSep === "." ? "," : "."

    // Ambiguity guard: "50,000" with no dot → could be US thousands or EU decimal.
    // Heuristic: if the ONLY separator present appears exactly once AND is followed
    // by exactly 3 digits AND the integer part has 1-3 digits, treat as thousands.
    // Otherwise (e.g. "50,00", "0,5") treat as decimal.
    if (lastDot === -1 || lastComma === -1) {
      const onlySep = decimalSep
      const parts = cleaned.split(onlySep)
      if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3) {
        // Looks like thousands: "50,000", "1,234", "999,999"
        normalized = cleaned.split(onlySep).join("")
      } else if (parts.length > 2) {
        // Multiple same-sep occurrences → all thousands separators: "1,234,567"
        normalized = cleaned.split(onlySep).join("")
      } else {
        // Decimal: "50,00", "1234,5", "0.5"
        normalized = parts[0] + "." + parts[1]
      }
    } else {
      // Both `.` and `,` present → unambiguous: last one is decimal, other is thousands
      const withoutThousands = cleaned.split(thousandsSep).join("")
      normalized = withoutThousands.replace(decimalSep, ".")
    }
  }

  // 6. Final parse
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new ParseAmountError(raw)
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    throw new ParseAmountError(raw)
  }

  return negative ? -value : value
}

/**
 * Resolve a bank transaction's debit / credit in the statement's NATIVE currency.
 *
 * Why this exists (cf. Obesity Care Clinic Ltd): the extraction prompt
 * (lib/ai/prompts.ts) is SUPPOSED to fill `debit`/`credit`, but in practice the
 * model routinely leaves them at 0 and puts the amount in side-specific or
 * single-amount fields instead. The import code used to read only `debit`/`credit`,
 * so every affected line reconciled to 0 — totals, soldes, écritures all 0. This
 * hit BOTH foreign-currency statements (EUR/USD/GBP) AND plain MUR statements.
 *
 * The relevé soldes (solde_ouverture / solde_cloture) are in the account's NATIVE
 * currency, so debit/credit must be too. We therefore prefer the native amount
 * (`montant_origine`/`montant_devise`/`debit_devise`/`credit_devise`) over the
 * MUR-converted `*_mur` fields, and only fall back to `*_mur` to recover the
 * SIDE (or the amount on a MUR statement where native == MUR, taux_change ~ 1).
 *
 * Shapes the model emits when debit/credit are 0:
 *   A) `debit_devise` / `credit_devise` — native, already split per side.
 *   B) `montant_origine` (or `montant_devise`/`montant`) + `sens`.
 *   C) `debit_mur` / `credit_mur` populated, no `sens` (typical MUR statement,
 *      taux_change = 1, so *_mur IS the native amount and also gives the side).
 * Returns {0,0} when none of these carry a usable amount + side.
 */
export function resolveTransactionAmounts(tx: {
  debit?: unknown
  credit?: unknown
  debit_devise?: unknown
  credit_devise?: unknown
  debit_mur?: unknown
  credit_mur?: unknown
  montant_origine?: unknown
  montant_devise?: unknown
  montant?: unknown
  sens?: unknown
}): { debit: number; credit: number } {
  const debit = parseAmount(tx.debit)
  const credit = parseAmount(tx.credit)
  if (debit !== 0 || credit !== 0) return { debit, credit }

  // Shape A — native per-side columns (foreign-currency statements).
  const debitDevise = parseAmount(tx.debit_devise)
  const creditDevise = parseAmount(tx.credit_devise)
  if (debitDevise !== 0 || creditDevise !== 0) {
    return { debit: Math.abs(debitDevise), credit: Math.abs(creditDevise) }
  }

  // Native single amount (always in account currency). Prefer it over *_mur,
  // which is the MUR-converted value on foreign statements.
  const native = parseAmount(tx.montant_origine ?? tx.montant_devise ?? tx.montant ?? 0)
  const debitMur = parseAmount(tx.debit_mur)
  const creditMur = parseAmount(tx.credit_mur)

  // Shape B — single amount + explicit sens.
  const sens = typeof tx.sens === "string" ? tx.sens.trim().toLowerCase() : ""
  if (sens === "debit") return { debit: Math.abs(native || debitMur), credit: 0 }
  if (sens === "credit") return { debit: 0, credit: Math.abs(native || creditMur) }

  // Shape C — no sens: derive the side from whichever *_mur column is populated,
  // and the amount from the native field when present (else *_mur, MUR statement).
  if (debitMur !== 0 || creditMur !== 0) {
    return {
      debit: debitMur !== 0 ? Math.abs(native || debitMur) : 0,
      credit: creditMur !== 0 ? Math.abs(native || creditMur) : 0,
    }
  }
  return { debit: 0, credit: 0 }
}

/**
 * Safe variant: returns 0 AND logs a console.warn when parsing fails.
 * Use when degrading gracefully is preferable to blocking the caller
 * (e.g. best-effort display), but prefer `parseAmount` on ingestion paths
 * where data integrity matters.
 */
export function parseAmountSafe(raw: unknown, context?: string): number {
  try {
    return parseAmount(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const ctx = context ? ` [${context}]` : ""
    // eslint-disable-next-line no-console
    console.warn(`[parseAmountSafe]${ctx} ${msg}`)
    return 0
  }
}
