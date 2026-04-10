/**
 * Professional bank reconciliation matching engine
 *
 * Multi-strategy cascade with confidence scoring:
 * 1. EXACT_REFERENCE (100%) — invoice number found in bank libellé
 * 2. EXACT_AMOUNT (95%)     — exact amount + strong tiers similarity
 * 3. CLOSE_AMOUNT (85%)     — amount within 2% + tiers match + date proximity
 * 4. GROUPED_SUM (85%)      — sum of N invoices = payment amount
 * 5. PARTIAL (70%)          — payment < invoice amount (acompte)
 * 6. HISTORICAL (80%)       — same tiers was matched this way before
 */

// Fallback FX rates MUR (used when taux not provided)
const FALLBACK_FX: Record<string, number> = {
  EUR: 46.50, GBP: 54.20, USD: 44.80, MUR: 1,
}

export function toMUR(amount: number, devise: string | null, rates?: Record<string, number>): number {
  if (!devise || devise === 'MUR') return amount
  const r = rates || FALLBACK_FX
  return amount * (r[devise.toUpperCase()] || FALLBACK_FX[devise.toUpperCase()] || 1)
}

export interface MatchingFacture {
  id: string
  numero_facture: string | null
  tiers: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  date_facture: string | null
  date_echeance: string | null
  conditions_paiement: number | null
  type_facture: 'client' | 'fournisseur' | null
  statut: string | null
}

export interface MatchingTransaction {
  releve_id: string
  transaction_idx: number
  date: string
  libelle: string
  tiers_detecte: string | null
  debit: number
  credit: number
  devise: string
}

export type MatchStrategy =
  | 'exact_reference'
  | 'exact_amount'
  | 'close_amount'
  | 'grouped_sum'
  | 'partial'
  | 'historical'

export interface MatchProposal {
  transaction: MatchingTransaction
  facture_ids: string[]
  factures: MatchingFacture[]
  strategy: MatchStrategy
  confidence: number
  reasoning: string
  amount_diff: number
  delay_days: number
  within_terms: boolean
}

// ═══ Helpers ═══

export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltd|limited|sarl|sas|sa|eurl|co\.?|inc|llc|plc|pvt)\b/gi, '')
    .replace(/[.,;:!?()/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tiersScore(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2))
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  const inter = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return inter / union  // Jaccard similarity
}

function daysBetween(d1: string, d2: string): number {
  if (!d1 || !d2) return 0
  const a = new Date(d1).getTime()
  const b = new Date(d2).getTime()
  if (isNaN(a) || isNaN(b)) return 0
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

function cleanRef(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// ═══ Strategy 1: Exact Reference ═══
function tryExactReference(tx: MatchingTransaction, factures: MatchingFacture[], rates?: Record<string, number>): MatchProposal | null {
  const txRef = cleanRef(tx.libelle + ' ' + (tx.tiers_detecte || ''))
  for (const f of factures) {
    if (!f.numero_facture) continue
    const facRef = cleanRef(f.numero_facture)
    if (facRef.length < 3) continue
    if (txRef.includes(facRef)) {
      const txAmountMUR = toMUR(Math.max(tx.debit, tx.credit), tx.devise, rates)
      const fAmount = Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates)
      const diff = fAmount > 0 ? Math.abs(txAmountMUR - fAmount) / fAmount : 1
      const delay = daysBetween(f.date_facture || '', tx.date)
      return {
        transaction: tx,
        facture_ids: [f.id],
        factures: [f],
        strategy: 'exact_reference',
        confidence: diff < 0.05 ? 1.0 : 0.9,
        reasoning: `Reference "${f.numero_facture}" trouvee dans le libelle bancaire (montant ${tx.devise !== 'MUR' ? tx.devise + ' → MUR converti' : 'MUR'})`,
        amount_diff: Math.abs(txAmountMUR - fAmount),
        delay_days: delay,
        within_terms: delay <= (Number(f.conditions_paiement) || 30) + 10,
      }
    }
  }
  return null
}

// ═══ Strategy 2 & 3: Amount + Tiers ═══
function tryAmountAndTiers(tx: MatchingTransaction, factures: MatchingFacture[], rates?: Record<string, number>): MatchProposal | null {
  const txAmountMUR = toMUR(Math.max(tx.debit, tx.credit), tx.devise, rates)
  const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
  if (txAmountMUR === 0) return null

  let best: MatchProposal | null = null
  for (const f of factures) {
    const fAmount = Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates)
    if (fAmount === 0) continue
    const diff = Math.abs(txAmountMUR - fAmount) / fAmount
    // Cross-currency: 5% tolerance; same currency: 1%
    const sameCurrency = (tx.devise || 'MUR') === (f.devise || 'MUR')
    const tolerance = sameCurrency ? 0.01 : 0.05
    if (diff > tolerance) continue

    const score = tiersScore(txTiers, f.tiers || '')
    // Lower threshold for short names (MyT, MRA, MCB...) — min 0.25 if name very short
    const tiersSeuil = Math.min(f.tiers?.length || 99, tx.tiers_detecte?.length || 99) <= 5 ? 0.25 : 0.40
    if (score < tiersSeuil) continue

    const delay = daysBetween(f.date_facture || '', tx.date)
    const terms = Number(f.conditions_paiement) || 30
    const withinTerms = delay <= terms + 10

    const isExactAmount = diff < 0.005
    const isStrongTiers = score >= 0.75

    let confidence = 0.5
    let strategy: MatchStrategy = 'close_amount'

    if (isExactAmount && isStrongTiers) {
      confidence = 0.95
      strategy = 'exact_amount'
    } else if (isExactAmount) {
      confidence = 0.85
      strategy = 'exact_amount'
    } else if (isStrongTiers) {
      confidence = 0.80
      strategy = 'close_amount'
    } else {
      confidence = 0.60 + (score * 0.15)
      strategy = 'close_amount'
    }

    if (withinTerms) confidence += 0.05
    if (delay > 90) confidence -= 0.1

    if (!best || confidence > best.confidence) {
      best = {
        transaction: tx,
        facture_ids: [f.id],
        factures: [f],
        strategy,
        confidence: Math.min(1, Math.max(0, confidence)),
        reasoning: `Tiers "${f.tiers}" (similarite ${Math.round(score * 100)}%), montant ${isExactAmount ? 'exact' : `ecart ${(diff * 100).toFixed(1)}%`}${tx.devise !== 'MUR' ? ` [${tx.devise}→MUR]` : ''}, delai ${delay}j ${withinTerms ? '(dans termes)' : '(hors termes)'}`,
        amount_diff: Math.abs(txAmountMUR - fAmount),
        delay_days: delay,
        within_terms: withinTerms,
      }
    }
  }
  return best
}

// ═══ Strategy 4: Grouped Sum ═══
function tryGroupedSum(tx: MatchingTransaction, factures: MatchingFacture[], rates?: Record<string, number>): MatchProposal | null {
  const txAmountMUR = toMUR(Math.max(tx.debit, tx.credit), tx.devise, rates)
  const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
  if (txAmountMUR === 0) return null

  // Group factures by tiers
  const byTiers = new Map<string, MatchingFacture[]>()
  for (const f of factures) {
    const key = normalize(f.tiers || '')
    if (!key) continue
    // Only include tiers with decent similarity to bank libellé
    if (tiersScore(txTiers, f.tiers || '') < 0.5) continue
    if (!byTiers.has(key)) byTiers.set(key, [])
    byTiers.get(key)!.push(f)
  }

  for (const [, group] of byTiers) {
    if (group.length < 2) continue
    // Try subsets of size 2..5 (limit combinatorial explosion)
    const n = Math.min(group.length, 6)
    for (let mask = 1; mask < (1 << n); mask++) {
      let bits = 0
      for (let i = 0; i < n; i++) if (mask & (1 << i)) bits++
      if (bits < 2 || bits > 5) continue
      const subset: MatchingFacture[] = []
      let sum = 0
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          subset.push(group[i])
          sum += Number(group[i].montant_mur) || toMUR(Number(group[i].montant_ttc) || 0, group[i].devise, rates)
        }
      }
      if (sum === 0) continue
      const diff = Math.abs(txAmountMUR - sum) / sum
      if (diff > 0.05) continue // 5% tolerance for grouped (cross-currency)

      const avgDelay = subset.reduce((s, f) => s + daysBetween(f.date_facture || '', tx.date), 0) / subset.length
      const maxTerms = Math.max(...subset.map(f => Number(f.conditions_paiement) || 30))
      const withinTerms = avgDelay <= maxTerms + 15

      const tiersName = subset[0].tiers || ''
      return {
        transaction: tx,
        facture_ids: subset.map(f => f.id),
        factures: subset,
        strategy: 'grouped_sum',
        confidence: 0.85 - (diff * 2) + (withinTerms ? 0.05 : 0),
        reasoning: `${subset.length} factures de "${tiersName}" dont la somme MUR (${sum.toFixed(2)}) correspond au paiement${tx.devise !== 'MUR' ? ` [${tx.devise}→MUR]` : ''} ${diff < 0.005 ? 'exactement' : `(ecart ${(diff * 100).toFixed(1)}%)`}, delai moyen ${Math.round(avgDelay)}j`,
        amount_diff: Math.abs(txAmountMUR - sum),
        delay_days: Math.round(avgDelay),
        within_terms: withinTerms,
      }
    }
  }
  return null
}

// ═══ Strategy 5: Partial Payment (acompte) ═══
function tryPartial(tx: MatchingTransaction, factures: MatchingFacture[], rates?: Record<string, number>): MatchProposal | null {
  const txAmountMUR = toMUR(Math.max(tx.debit, tx.credit), tx.devise, rates)
  const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
  if (txAmountMUR === 0) return null

  let best: MatchProposal | null = null
  for (const f of factures) {
    const fAmount = Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates)
    if (fAmount <= 0) continue
    // Payment must be smaller than invoice (partial) by 10-90%
    if (txAmountMUR >= fAmount) continue
    const ratio = txAmountMUR / fAmount
    if (ratio < 0.1 || ratio > 0.9) continue

    const score = tiersScore(txTiers, f.tiers || '')
    if (score < 0.7) continue // Strong tiers match required for partial

    const delay = daysBetween(f.date_facture || '', tx.date)
    const confidence = 0.55 + (score * 0.15) + (ratio > 0.5 ? 0.05 : 0)

    if (!best || confidence > best.confidence) {
      best = {
        transaction: tx,
        facture_ids: [f.id],
        factures: [f],
        strategy: 'partial',
        confidence,
        reasoning: `Paiement partiel (${Math.round(ratio * 100)}% de la facture ${f.numero_facture || ''} de ${f.tiers || ''})`,
        amount_diff: fAmount - txAmountMUR,
        delay_days: delay,
        within_terms: delay <= (Number(f.conditions_paiement) || 30) + 15,
      }
    }
  }
  return best
}

// ═══ Main engine ═══
export function findBestMatch(
  tx: MatchingTransaction,
  candidateFactures: MatchingFacture[],
  rates?: Record<string, number>
): MatchProposal | null {
  // Filter by direction
  const isOutgoing = tx.debit > 0
  const expectedType: 'client' | 'fournisseur' = isOutgoing ? 'fournisseur' : 'client'
  const eligible = candidateFactures.filter(f => f.type_facture === expectedType || !f.type_facture)

  if (eligible.length === 0) return null

  // Try strategies in order, return first match with confidence >= 0.5
  const strategies = [
    (t: MatchingTransaction, f: MatchingFacture[]) => tryExactReference(t, f, rates),
    (t: MatchingTransaction, f: MatchingFacture[]) => tryAmountAndTiers(t, f, rates),
    tryGroupedSum,
    tryPartial,
  ]

  let best: MatchProposal | null = null
  for (const strategy of strategies) {
    const result = strategy(tx, eligible)
    if (result && (!best || result.confidence > best.confidence)) {
      best = result
      if (best.confidence >= 0.95) break // early exit on very high confidence
    }
  }

  return best
}

export function analyzeAllTransactions(
  transactions: MatchingTransaction[],
  factures: MatchingFacture[],
  rates?: Record<string, number>
): MatchProposal[] {
  const proposals: MatchProposal[] = []
  const usedFactureIds = new Set<string>()

  const sorted = [...transactions].sort((a, b) => {
    const aHasRef = /[A-Z]{2,}-?\d+/.test(a.libelle || '') ? 1 : 0
    const bHasRef = /[A-Z]{2,}-?\d+/.test(b.libelle || '') ? 1 : 0
    return bHasRef - aHasRef
  })

  for (const tx of sorted) {
    const available = factures.filter(f => !usedFactureIds.has(f.id))
    const match = findBestMatch(tx, available, rates)
    if (match && match.confidence >= 0.5) {
      proposals.push(match)
      for (const fid of match.facture_ids) usedFactureIds.add(fid)
    }
  }

  return proposals
}
