/**
 * Historical exchange rates — source de vérité pour convertir en MUR toute
 * transaction HISTORIQUE (écriture, ligne de relevé bancaire, facture émise).
 *
 * Pourquoi ce module existe :
 * ---------------------------
 * `lib/taux-change.ts` expose `getTauxChange()` qui retourne le taux LIVE
 * (le plus récent en DB). Utiliser ce taux pour (re)convertir une écriture
 * passée = bug — le montant MUR dérive à chaque refresh et ne matche plus
 * le relevé bancaire original. Voir `docs/RATES_HISTORICAL.md`.
 *
 * Règle d'or :
 *   - Pour une nouvelle transaction (date = aujourd'hui)   → `getTauxChange()` OK
 *   - Pour recalculer / afficher une écriture historique   → `getHistoricalRate()` OBLIGATOIRE
 *
 * La table `taux_change_historique` est la source de vérité. Si la date
 * exacte n'a pas de taux, on prend le taux le plus récent ≤ date (carry-over).
 * Si aucun taux ≤ date n'existe pour la devise → `MissingHistoricalRateError`.
 */

// Use `any` to support both admin, server, and browser Supabase clients.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Thrown when no historical rate row exists for a given (date, devise).
 * Catch this to display a user-friendly admin message: "seed la table ou
 * contacte un comptable".
 */
export class MissingHistoricalRateError extends Error {
  readonly date: string
  readonly devise: string
  constructor(date: string, devise: string) {
    super(
      `No historical exchange rate found for ${devise} on or before ${date}. ` +
      `Seed the table \`taux_change_historique\` or contact an admin.`
    )
    this.name = 'MissingHistoricalRateError'
    this.date = date
    this.devise = devise
  }
}

// ---------------------------------------------------------------------------
// In-memory cache — scope court (lifetime of a server-rendered request or
// a short-lived script). Pas de TTL : les taux historiques sont IMMUTABLES
// par design, donc un cache process-wide est sûr tant qu'on n'a pas d'UPDATE
// destructif en cours. Cache-key = `YYYY-MM-DD|DEVISE`.
// ---------------------------------------------------------------------------
const rateCache = new Map<string, number>()

function normalizeDate(date: string | Date): string {
  if (typeof date === 'string') {
    // Accept 'YYYY-MM-DD' or full ISO — truncate to date part.
    return date.length >= 10 ? date.slice(0, 10) : date
  }
  // Use UTC components to avoid timezone-induced off-by-one.
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function cacheKey(date: string, devise: string): string {
  return `${date}|${devise}`
}

/**
 * Return the historical MUR rate for 1 unit of `devise` on `date`.
 *
 * Logic:
 *   1. MUR → returns 1 directly (no DB hit).
 *   2. Look up the most recent `taux_vers_mur` with `date_taux <= date`.
 *   3. If no row found → throw `MissingHistoricalRateError`.
 *
 * Example:
 *   await getHistoricalRate(supabase, '2025-11-15', 'EUR') // → 53.50
 *
 * @param supabase  Any Supabase client (admin, server, browser).
 * @param date      ISO string `YYYY-MM-DD` or `Date`.
 * @param devise    3-letter currency code (case-insensitive).
 * @throws MissingHistoricalRateError when the devise has no seed data.
 */
export async function getHistoricalRate(
  supabase: SupabaseClient,
  date: string | Date,
  devise: string
): Promise<number> {
  const dateStr = normalizeDate(date)
  const deviseCaps = (devise || '').toUpperCase()

  if (deviseCaps === 'MUR') return 1

  const key = cacheKey(dateStr, deviseCaps)
  const cached = rateCache.get(key)
  if (cached !== undefined) return cached

  const { data, error } = await supabase
    .from('taux_change_historique')
    .select('taux_vers_mur, date_taux')
    .eq('devise', deviseCaps)
    .lte('date_taux', dateStr)
    .order('date_taux', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Don't silently fallback — a DB error on a historical rate lookup is a
    // data-integrity signal. Bubble up.
    throw new Error(
      `[historical-rates] DB error fetching ${deviseCaps}@${dateStr}: ${error.message}`
    )
  }

  if (!data || data.taux_vers_mur == null) {
    throw new MissingHistoricalRateError(dateStr, deviseCaps)
  }

  const rate = Number(data.taux_vers_mur)
  rateCache.set(key, rate)
  return rate
}

/**
 * Batch lookup for a set of (date, devise) tuples. Designed for bank statement
 * imports where a single upload can contain N transactions across multiple
 * dates — avoids N round-trips.
 *
 * Returns a record keyed by `${YYYY-MM-DD}|${DEVISE}`. Missing tuples are
 * OMITTED from the result (not thrown) — caller decides how to surface them.
 * MUR entries are resolved locally to 1.
 *
 * Implementation : one query per distinct currency, fetching all rows ≤ max
 * requested date for that currency, then for each tuple we pick the most
 * recent `date_taux <= tuple.date`.
 *
 * Example:
 *   const rates = await getHistoricalRatesForDates(supabase, [
 *     { date: '2025-11-15', devise: 'EUR' },
 *     { date: '2025-11-20', devise: 'EUR' },
 *     { date: '2026-01-05', devise: 'USD' },
 *   ])
 *   // rates = { '2025-11-15|EUR': 53.50, '2025-11-20|EUR': 53.50, '2026-01-05|USD': 46.50 }
 */
export async function getHistoricalRatesForDates(
  supabase: SupabaseClient,
  tuples: Array<{ date: string | Date; devise: string }>
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  if (!tuples || tuples.length === 0) return result

  // Group tuples by devise, keep max date per devise for the range query.
  const byDevise = new Map<string, { dates: string[]; maxDate: string }>()
  const normalizedTuples: Array<{ date: string; devise: string }> = []

  for (const t of tuples) {
    const dateStr = normalizeDate(t.date)
    const deviseCaps = (t.devise || '').toUpperCase()
    normalizedTuples.push({ date: dateStr, devise: deviseCaps })

    if (deviseCaps === 'MUR') {
      result[cacheKey(dateStr, 'MUR')] = 1
      continue
    }

    // Cache hit — resolve immediately.
    const cached = rateCache.get(cacheKey(dateStr, deviseCaps))
    if (cached !== undefined) {
      result[cacheKey(dateStr, deviseCaps)] = cached
      continue
    }

    const existing = byDevise.get(deviseCaps)
    if (!existing) {
      byDevise.set(deviseCaps, { dates: [dateStr], maxDate: dateStr })
    } else {
      existing.dates.push(dateStr)
      if (dateStr > existing.maxDate) existing.maxDate = dateStr
    }
  }

  // For each devise, fetch all rows <= maxDate in one query.
  for (const [deviseCaps, { maxDate }] of byDevise.entries()) {
    const { data, error } = await supabase
      .from('taux_change_historique')
      .select('taux_vers_mur, date_taux')
      .eq('devise', deviseCaps)
      .lte('date_taux', maxDate)
      .order('date_taux', { ascending: false })

    if (error) {
      throw new Error(
        `[historical-rates] DB error batch-fetching ${deviseCaps}: ${error.message}`
      )
    }

    const rows = (data || []) as Array<{ taux_vers_mur: number; date_taux: string }>

    // Resolve each tuple for this devise : walk rows DESC and pick first
    // row with date_taux <= tuple.date.
    for (const { date, devise } of normalizedTuples) {
      if (devise !== deviseCaps) continue
      const k = cacheKey(date, devise)
      if (k in result) continue // already resolved via cache

      const match = rows.find(r => r.date_taux <= date)
      if (match) {
        const rate = Number(match.taux_vers_mur)
        result[k] = rate
        rateCache.set(k, rate)
      }
      // else: omitted from result — caller handles via MissingHistoricalRateError
    }
  }

  return result
}

/**
 * Test-only helper. Do not call in production code — the cache is process-wide
 * and clearing it mid-request can produce inconsistent results across a render.
 */
export function _clearHistoricalRateCache(): void {
  rateCache.clear()
}
