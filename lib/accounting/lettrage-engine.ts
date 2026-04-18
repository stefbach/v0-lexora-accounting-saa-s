/**
 * Lettrage engine — enhanced auto-matching algorithm.
 *
 * Strategies, tried in order:
 *   1. Exact 1↔1 on same account (debit = credit, date proximity boost)
 *   2. Multi-to-one: N debits = 1 credit, or 1 debit = N credits (k up to 4)
 *   3. Tiers-aware grouping: match within same tier (libelle keyword) when account is 4xx
 *
 * Score: amount match weight + date proximity + tier similarity.
 * Any pair/group scoring ≥ MIN_SCORE is lettered atomically.
 */

export interface Entry {
  id: string
  compte: string
  debit: number
  credit: number
  date_ecriture: string
  libelle?: string | null
  piece_justificative?: string | null
}

export interface MatchGroup {
  ids: string[]
  lettre: string
  compte: string
  total_debit: number
  total_credit: number
  score: number
  strategy: "exact_1to1" | "multi_to_one" | "tier_aware"
  reason: string
}

const AMOUNT_TOLERANCE = 0.01
const MAX_DATE_DAYS = 180
const MIN_SCORE = 0.55
const MAX_COMBO_SIZE = 4

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime()
  const d2 = new Date(b).getTime()
  return Math.abs(d1 - d2) / 86400000
}

function dateProximityScore(d1: string, d2: string): number {
  const days = daysBetween(d1, d2)
  if (days > MAX_DATE_DAYS) return 0
  return 1 - days / MAX_DATE_DAYS
}

function extractTierToken(libelle: string | null | undefined): string {
  if (!libelle) return ""
  return libelle
    .toLowerCase()
    .replace(/[0-9/\-_\\.,;:()]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP.has(w))
    .slice(0, 3)
    .join(" ")
}

const STOP = new Set([
  "facture", "paiement", "virement", "reglement", "invoice", "payment",
  "transfer", "credit", "debit", "client", "fournisseur", "supplier",
  "avoir", "note", "ref", "reference", "echeance", "solde",
])

function tierSimilarity(a?: string | null, b?: string | null): number {
  const t1 = extractTierToken(a).split(" ").filter(Boolean)
  const t2 = extractTierToken(b).split(" ").filter(Boolean)
  if (!t1.length || !t2.length) return 0
  const set1 = new Set(t1)
  let inter = 0
  for (const w of t2) if (set1.has(w)) inter++
  const union = new Set([...t1, ...t2]).size
  return union ? inter / union : 0
}

function scorePair(d: Entry, c: Entry): number {
  const amountDiff = Math.abs(d.debit - c.credit)
  if (amountDiff > AMOUNT_TOLERANCE) return 0
  const dateS = dateProximityScore(d.date_ecriture, c.date_ecriture)
  const tierS = tierSimilarity(d.libelle, c.libelle)
  // base 0.7 for exact amount + same account, + up to 0.2 date + 0.1 tier
  return 0.7 + 0.2 * dateS + 0.1 * tierS
}

function scoreCombo(
  oneSide: Entry,
  manySide: Entry[],
  oneAmount: number,
  manyAmountField: "debit" | "credit",
): number {
  const total = manySide.reduce((s, e) => s + e[manyAmountField], 0)
  if (Math.abs(total - oneAmount) > AMOUNT_TOLERANCE) return 0
  const dateS =
    manySide.reduce((s, e) => s + dateProximityScore(oneSide.date_ecriture, e.date_ecriture), 0) /
    manySide.length
  const tierS =
    manySide.reduce((s, e) => s + tierSimilarity(oneSide.libelle, e.libelle), 0) / manySide.length
  // lower base for combos (0.55) to favor simple pairs
  return 0.55 + 0.25 * dateS + 0.1 * tierS - 0.02 * (manySide.length - 2)
}

function* kCombinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return }
  if (arr.length < k) return
  const [head, ...rest] = arr
  for (const c of kCombinations(rest, k - 1)) yield [head, ...c]
  yield* kCombinations(rest, k)
}

export function buildMatches(entries: Entry[], lettreStart: number = 0): MatchGroup[] {
  const byCompte: Record<string, Entry[]> = {}
  for (const e of entries) (byCompte[e.compte] ||= []).push(e)

  const groups: MatchGroup[] = []
  let lettreIdx = lettreStart
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const nextLettre = () => {
    const i = lettreIdx++
    return i < 26 ? alphabet[i] : alphabet[Math.floor(i / 26) - 1] + alphabet[i % 26]
  }

  for (const [compte, items] of Object.entries(byCompte)) {
    const debits = items.filter(e => e.debit > 0)
    const credits = items.filter(e => e.credit > 0)
    const used = new Set<string>()

    // Strategy 1: 1↔1 exact, best-score first
    const pairs: { d: Entry; c: Entry; score: number }[] = []
    for (const d of debits) for (const c of credits) {
      const s = scorePair(d, c)
      if (s >= MIN_SCORE) pairs.push({ d, c, score: s })
    }
    pairs.sort((a, b) => b.score - a.score)
    for (const p of pairs) {
      if (used.has(p.d.id) || used.has(p.c.id)) continue
      used.add(p.d.id); used.add(p.c.id)
      groups.push({
        ids: [p.d.id, p.c.id],
        lettre: nextLettre(),
        compte,
        total_debit: p.d.debit,
        total_credit: p.c.credit,
        score: p.score,
        strategy: "exact_1to1",
        reason: `Montant exact ${p.d.debit.toFixed(2)}, ${Math.round(daysBetween(p.d.date_ecriture, p.c.date_ecriture))}j d'écart`,
      })
    }

    // Strategy 2: multi-to-one (N debits = 1 credit)
    const freeDebits = debits.filter(e => !used.has(e.id))
    const freeCredits = credits.filter(e => !used.has(e.id))

    for (const c of freeCredits) {
      if (used.has(c.id)) continue
      let best: { combo: Entry[]; score: number } | null = null
      for (let k = 2; k <= Math.min(MAX_COMBO_SIZE, freeDebits.length); k++) {
        const candidates = freeDebits.filter(d =>
          !used.has(d.id) && daysBetween(d.date_ecriture, c.date_ecriture) <= MAX_DATE_DAYS,
        )
        if (candidates.length < k) break
        for (const combo of kCombinations(candidates, k)) {
          const s = scoreCombo(c, combo, c.credit, "debit")
          if (s >= MIN_SCORE && (!best || s > best.score)) best = { combo, score: s }
        }
      }
      if (best) {
        for (const d of best.combo) used.add(d.id)
        used.add(c.id)
        groups.push({
          ids: [c.id, ...best.combo.map(d => d.id)],
          lettre: nextLettre(),
          compte,
          total_debit: best.combo.reduce((s, e) => s + e.debit, 0),
          total_credit: c.credit,
          score: best.score,
          strategy: "multi_to_one",
          reason: `${best.combo.length} débits soldés par 1 crédit (${c.credit.toFixed(2)})`,
        })
      }
    }

    // Strategy 2b: 1 debit = N credits
    const freeDebits2 = debits.filter(e => !used.has(e.id))
    const freeCredits2 = credits.filter(e => !used.has(e.id))
    for (const d of freeDebits2) {
      if (used.has(d.id)) continue
      let best: { combo: Entry[]; score: number } | null = null
      for (let k = 2; k <= Math.min(MAX_COMBO_SIZE, freeCredits2.length); k++) {
        const candidates = freeCredits2.filter(c =>
          !used.has(c.id) && daysBetween(c.date_ecriture, d.date_ecriture) <= MAX_DATE_DAYS,
        )
        if (candidates.length < k) break
        for (const combo of kCombinations(candidates, k)) {
          const s = scoreCombo(d, combo, d.debit, "credit")
          if (s >= MIN_SCORE && (!best || s > best.score)) best = { combo, score: s }
        }
      }
      if (best) {
        for (const c of best.combo) used.add(c.id)
        used.add(d.id)
        groups.push({
          ids: [d.id, ...best.combo.map(c => c.id)],
          lettre: nextLettre(),
          compte,
          total_debit: d.debit,
          total_credit: best.combo.reduce((s, e) => s + e.credit, 0),
          score: best.score,
          strategy: "multi_to_one",
          reason: `1 débit (${d.debit.toFixed(2)}) soldé par ${best.combo.length} crédits`,
        })
      }
    }
  }

  return groups
}

export function balanceCheck(entries: Entry[], ids: string[]): { debit: number; credit: number; ecart: number } {
  const set = new Set(ids)
  const selected = entries.filter(e => set.has(e.id))
  const debit = selected.reduce((s, e) => s + (e.debit || 0), 0)
  const credit = selected.reduce((s, e) => s + (e.credit || 0), 0)
  return { debit, credit, ecart: Math.abs(debit - credit) }
}
