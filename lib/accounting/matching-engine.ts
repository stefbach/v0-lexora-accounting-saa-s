/**
 * Professional bank reconciliation matching engine
 *
 * Multi-strategy cascade with confidence scoring:
 * 1. EXACT_REFERENCE (100%) — invoice number found in bank libellé
 * 2. EXACT_AMOUNT (95%)     — exact amount + strong tiers similarity
 * 3. CLOSE_AMOUNT (85%)     — amount within 2% + tiers match + date proximity
 * 4. GROUPED_SUM (85%)      — sum of N invoices = payment amount
 * 5. PARTIAL (70%)          — payment < invoice amount (acompte)
 * 6. HISTORICAL (80%)       — same tiers was matched this way before (learned pattern)
 * 7. ECRITURE (75%)         — fallback: unlettered 401/411 ecriture with matching amount + account
 * 8. REFUND (80%)           — negative-flow / reversal matching (refund on a previously paid facture)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fallback FX rates MUR — dernier recours (mis à jour manuellement).
 * Le chemin principal est désormais la table `taux_change` (migration 124,
 * colonne `date_taux` + index `idx_taux_change_devise_date`).
 * Note: le spec d'origine mentionne `taux_change_historiques` mais la migration
 * 124 étend en réalité la table `taux_change` avec des colonnes historiques.
 */
const FALLBACK_FX: Record<string, number> = {
  EUR: 46.50, GBP: 54.20, USD: 44.80, MUR: 1,
}

/** Cache en mémoire (clé: devise|YYYY-MM-DD) pour éviter reqs répétées */
const fxCache = new Map<string, number>()

/**
 * Récupère le taux historique devise→MUR à une date donnée.
 * Stratégie :
 * 1. Cache mémoire
 * 2. Table taux_change (date exacte, puis date la plus proche ≤)
 * 3. Fallback statique FALLBACK_FX (avec warning)
 */
export async function getTauxChangeAtDate(
  supabase: SupabaseClient,
  devise: string,
  date: Date | string,
): Promise<{ taux: number; source: 'cache' | 'db_exact' | 'db_near' | 'fallback' }> {
  const devU = (devise ?? 'MUR').toUpperCase()
  if (devU === 'MUR') return { taux: 1, source: 'cache' }

  const dateStr = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10)
  const cacheKey = `${devU}|${dateStr}`

  // 1. Cache
  const cached = fxCache.get(cacheKey)
  if (cached !== undefined) return { taux: cached, source: 'cache' }

  // 2. DB exact match
  try {
    const { data: exact, error: errExact } = await supabase
      .from('taux_change')
      .select('taux, date_taux')
      .eq('devise', devU)
      .eq('date_taux', dateStr)
      .maybeSingle()

    if (!errExact && exact?.taux) {
      const taux = Number(exact.taux)
      fxCache.set(cacheKey, taux)
      return { taux, source: 'db_exact' }
    }

    // 3. DB nearest date ≤ dateStr
    const { data: near, error: errNear } = await supabase
      .from('taux_change')
      .select('taux, date_taux')
      .eq('devise', devU)
      .lte('date_taux', dateStr)
      .order('date_taux', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!errNear && near?.taux) {
      const taux = Number(near.taux)
      fxCache.set(cacheKey, taux)
      return { taux, source: 'db_near' }
    }
  } catch (err) {
    console.warn('[matching-engine] getTauxChangeAtDate db lookup failed, using fallback', err)
  }

  // 4. Fallback statique
  const fallback = FALLBACK_FX[devU]
  if (fallback !== undefined) {
    console.warn(`[matching-engine] FX fallback used for ${devU} at ${dateStr} (devise historique non trouvée)`)
    fxCache.set(cacheKey, fallback)
    return { taux: fallback, source: 'fallback' }
  }

  // Ultime recours : 1:1 (évite crash, mais log erreur)
  console.error(`[matching-engine] No FX available for ${devU}, using 1.0`)
  return { taux: 1, source: 'fallback' }
}

/**
 * Version synchrone qui utilise UNIQUEMENT FALLBACK_FX.
 * Conservée pour compat avec les call-sites qui ne peuvent pas await.
 * À remplacer progressivement par getTauxChangeAtDate.
 */
export function getFxFallbackSync(devise: string): number {
  const devU = (devise ?? 'MUR').toUpperCase()
  return FALLBACK_FX[devU] ?? 1
}

/** Vide le cache FX (utile pour tests ou après maj taux_change) */
export function clearFxCache(): void {
  fxCache.clear()
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
  | 'ecriture_match'
  | 'refund'

export interface MatchingEcriture {
  id: string
  compte: string
  libelle: string | null
  debit: number
  credit: number
  date_ecriture: string | null
  journal: string | null
  piece_justificative: string | null
}

export interface HistoricalPattern {
  id: string
  tiers_banque: string
  libelle_pattern: string | null
  montant_min: number | null
  montant_max: number | null
  type_cible: string
  cible_tiers: string | null
  cible_compte: string | null
  confidence_cumul: number
  nb_utilisations: number
}

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
      const txRaw = Math.max(tx.debit, tx.credit)
      const fRaw = Number(f.montant_ttc) || 0
      const txDevise = (tx.devise || 'MUR').toUpperCase()
      const fDevise = (f.devise || 'MUR').toUpperCase()
      // Same currency → compare raw; cross-currency → compare MUR
      const txAmt = (txDevise === fDevise && txDevise !== 'MUR') ? txRaw : toMUR(txRaw, tx.devise, rates)
      const fAmt = (txDevise === fDevise && txDevise !== 'MUR') ? fRaw : (Number(f.montant_mur) || toMUR(fRaw, f.devise, rates))
      const diff = fAmt > 0 ? Math.abs(txAmt - fAmt) / fAmt : 1
      const delay = daysBetween(f.date_facture || '', tx.date)
      return {
        transaction: tx,
        facture_ids: [f.id],
        factures: [f],
        strategy: 'exact_reference',
        confidence: diff < 0.05 ? 1.0 : 0.9,
        reasoning: `Reference "${f.numero_facture}" trouvee dans le libelle bancaire${txDevise !== 'MUR' ? ` [${txDevise}]` : ''}`,
        amount_diff: Math.abs(txAmt - fAmt),
        delay_days: delay,
        within_terms: delay <= (Number(f.conditions_paiement) || 30) + 10,
      }
    }
  }
  return null
}

// ═══ Strategy 2 & 3: Amount + Tiers ═══
function tryAmountAndTiers(tx: MatchingTransaction, factures: MatchingFacture[], rates?: Record<string, number>): MatchProposal | null {
  const txAmountRaw = Math.max(tx.debit, tx.credit)
  const txAmountMUR = toMUR(txAmountRaw, tx.devise, rates)
  const txDevise = (tx.devise || 'MUR').toUpperCase()
  const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
  if (txAmountMUR === 0) return null

  let best: MatchProposal | null = null
  for (const f of factures) {
    const fMontantMUR = Number(f.montant_mur) || 0
    const fMontantTTC = Number(f.montant_ttc) || 0
    const fDevise = (f.devise || 'MUR').toUpperCase()

    // montant_mur is the ground truth (authoritative MUR amount)
    // Prioritize: txAmountMUR vs montant_mur
    // Fallback: same-currency raw compare, then cross-currency via toMUR
    let diff: number
    let compareLabel: string

    if (fMontantMUR > 0) {
      diff = Math.abs(txAmountMUR - fMontantMUR) / fMontantMUR
      compareLabel = 'MUR'
    } else if (txDevise === fDevise && txDevise !== 'MUR' && fMontantTTC > 0) {
      diff = Math.abs(txAmountRaw - fMontantTTC) / fMontantTTC
      compareLabel = txDevise
    } else if (fMontantTTC > 0) {
      const fAmtMUR = toMUR(fMontantTTC, f.devise, rates)
      diff = fAmtMUR > 0 ? Math.abs(txAmountMUR - fAmtMUR) / fAmtMUR : 1
      compareLabel = 'MUR (converti)'
    } else {
      continue
    }

    const tolerance = 0.08 // 8% covers TDS (5%) + bank fees + rounding
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
        reasoning: `Tiers "${f.tiers}" (similarite ${Math.round(score * 100)}%), montant ${isExactAmount ? 'exact' : `ecart ${(diff * 100).toFixed(1)}%`}${txDevise !== 'MUR' ? ` [${txDevise}]` : ''}, delai ${delay}j ${withinTerms ? '(dans termes)' : '(hors termes)'}`,
        amount_diff: diff * (fMontantMUR > 0 ? fMontantMUR : txAmountMUR),
        delay_days: delay,
        within_terms: withinTerms,
      }
    }
  }
  return best
}

// ═══ Strategy 4: Grouped Sum ═══
function tryGroupedSum(tx: MatchingTransaction, factures: MatchingFacture[], rates?: Record<string, number>): MatchProposal | null {
  const txAmountRaw = Math.max(tx.debit, tx.credit)
  const txAmountMUR = toMUR(txAmountRaw, tx.devise, rates)
  const txDevise = (tx.devise || 'MUR').toUpperCase()
  const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
  if (txAmountMUR === 0) return null

  // Group factures by tiers — lower tiers threshold to 0.3 to catch more
  const byTiers = new Map<string, MatchingFacture[]>()
  for (const f of factures) {
    const key = normalize(f.tiers || '')
    if (!key) continue
    if (tiersScore(txTiers, f.tiers || '') < 0.3) continue
    if (!byTiers.has(key)) byTiers.set(key, [])
    byTiers.get(key)!.push(f)
  }

  for (const [, group] of byTiers) {
    if (group.length < 2) continue
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
          // Always sum in MUR using montant_mur as ground truth
          const fMUR = Number(group[i].montant_mur) || toMUR(Number(group[i].montant_ttc) || 0, group[i].devise, rates)
          sum += fMUR
        }
      }
      if (sum === 0) continue
      const compareAmount = txAmountMUR  // always compare in MUR
      const allSameCurrency = false // not used anymore but keep for reasoning label
      const diff = Math.abs(compareAmount - sum) / sum
      if (diff > 0.08) continue // 8% tolerance — covers TDS/WHT deductions (5%) + bank fees

      const avgDelay = subset.reduce((s, f) => s + daysBetween(f.date_facture || '', tx.date), 0) / subset.length
      const maxTerms = Math.max(...subset.map(f => Number(f.conditions_paiement) || 30))
      const withinTerms = avgDelay <= maxTerms + 15

      const tiersName = subset[0].tiers || ''
      // Boost confidence when diff looks like TDS/WHT (3-6% range is typical for Maurice)
      const looksLikeTDS = diff >= 0.02 && diff <= 0.06
      const baseConf = 0.87 - (diff * 1.5) + (withinTerms ? 0.05 : 0)
      const conf = Math.min(0.96, looksLikeTDS ? baseConf + 0.08 : baseConf)
      return {
        transaction: tx,
        facture_ids: subset.map(f => f.id),
        factures: subset,
        strategy: 'grouped_sum',
        confidence: conf,
        reasoning: `${subset.length} factures de "${tiersName}"${allSameCurrency && txDevise !== 'MUR' ? ` [${txDevise}]` : ''} dont la somme (${sum.toFixed(2)}) correspond au paiement ${diff < 0.005 ? 'exactement' : `(ecart ${(diff * 100).toFixed(1)}%${looksLikeTDS ? ' — probable TDS/retenue' : ''})`}, delai moyen ${Math.round(avgDelay)}j`,
        amount_diff: Math.abs(compareAmount - sum),
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

// ═══ Strategy 6: Historical Pattern ═══
function tryHistorical(
  tx: MatchingTransaction,
  factures: MatchingFacture[],
  patterns: HistoricalPattern[],
  rates?: Record<string, number>
): MatchProposal | null {
  if (!patterns || patterns.length === 0) return null

  const txTiersNorm = normalize(tx.tiers_detecte || tx.libelle || '')
  const txAmt = Math.max(tx.debit, tx.credit)

  let bestPattern: HistoricalPattern | null = null
  let bestScore = 0

  for (const pattern of patterns) {
    const score = tiersScore(txTiersNorm, pattern.tiers_banque)
    if (score < 0.7) continue

    // Check libelle_pattern if set
    if (pattern.libelle_pattern) {
      const libLower = (tx.libelle || '').toLowerCase()
      if (!libLower.includes(pattern.libelle_pattern.toLowerCase())) continue
    }

    // Check amount range if set
    const txAmtMUR = toMUR(txAmt, tx.devise, rates)
    if (pattern.montant_min !== null && txAmtMUR < Number(pattern.montant_min)) continue
    if (pattern.montant_max !== null && txAmtMUR > Number(pattern.montant_max)) continue

    if (score > bestScore) {
      bestScore = score
      bestPattern = pattern
    }
  }

  if (!bestPattern) return null

  const txAmtMUR = toMUR(txAmt, tx.devise, rates)

  // Try to find a matching facture using cible_tiers
  if (bestPattern.cible_tiers) {
    let bestFacture: MatchingFacture | null = null
    let bestFactureDiff = Infinity

    for (const f of factures) {
      const tiersSim = tiersScore(normalize(f.tiers || ''), normalize(bestPattern.cible_tiers))
      if (tiersSim < 0.6) continue
      const fAmt = Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates)
      if (fAmt === 0) continue
      const diff = Math.abs(txAmtMUR - fAmt) / fAmt
      if (diff > 0.05) continue // 5% tolerance
      if (diff < bestFactureDiff) {
        bestFactureDiff = diff
        bestFacture = f
      }
    }

    if (bestFacture) {
      const confidence = Math.min(0.99,
        Number(bestPattern.confidence_cumul) + 0.01 * Math.min(Number(bestPattern.nb_utilisations), 10)
      )
      const delay = daysBetween(bestFacture.date_facture || '', tx.date)
      return {
        transaction: tx,
        facture_ids: [bestFacture.id],
        factures: [bestFacture],
        strategy: 'historical',
        confidence,
        reasoning: `Pattern mémorisé: "${bestPattern.tiers_banque}" → "${bestPattern.cible_tiers}" (${bestPattern.nb_utilisations} util., conf. ${Math.round(Number(bestPattern.confidence_cumul) * 100)}%)`,
        amount_diff: Math.abs(txAmtMUR - (Number(bestFacture.montant_mur) || toMUR(Number(bestFacture.montant_ttc) || 0, bestFacture.devise, rates))),
        delay_days: delay,
        within_terms: delay <= (Number(bestFacture.conditions_paiement) || 30) + 10,
      }
    }
  }

  return null
}

// ═══ Strategy 7: Ecriture match (fallback when no facture matches) ═══
// Tries to match a bank transaction against unlettered ecritures 401 (supplier)
// or 411 (client) using amount proximity and account direction. This does not
// replace facture matching — it's a fallback for transactions where the underlying
// invoice hasn't been entered yet or exists only in the general ledger.
export interface EcritureMatchProposal {
  transaction: MatchingTransaction
  ecriture_id: string
  ecriture: MatchingEcriture
  strategy: 'ecriture_match'
  confidence: number
  reasoning: string
  amount_diff: number
}

export function tryEcritureMatch(
  tx: MatchingTransaction,
  ecritures: MatchingEcriture[],
  rates?: Record<string, number>
): EcritureMatchProposal | null {
  const isOutgoing = tx.debit > 0
  // Outgoing payment → supplier invoice (credit on 401) or any payable
  // Incoming payment → client invoice (debit on 411) or any receivable
  const expectedAccountPrefix = isOutgoing
    ? /^(40|41D|4451|4455)/ // fournisseurs, TVA déductible, acomptes
    : /^(41|411|4456|419)/  // clients, TVA collectée, avances
  const txAmount = Math.max(tx.debit, tx.credit)
  const txAmountMUR = toMUR(txAmount, tx.devise, rates)
  if (txAmountMUR === 0) return null

  let best: EcritureMatchProposal | null = null

  for (const e of ecritures) {
    const compte = (e.compte || '').toString()
    if (!expectedAccountPrefix.test(compte)) continue

    // For outgoing: match against credit side of 401 (supplier owed)
    // For incoming: match against debit side of 411 (client owing)
    const eAmt = isOutgoing ? Number(e.credit) || 0 : Number(e.debit) || 0
    if (eAmt === 0) continue

    const diff = Math.abs(txAmountMUR - eAmt) / eAmt
    if (diff > 0.08) continue // 8% tolerance for bank fees / FX

    const delay = daysBetween(e.date_ecriture || '', tx.date)
    if (delay > 180 || delay < -30) continue // within 6 months past, 1 month future

    const confidence = 0.5
      + (diff < 0.005 ? 0.25 : (diff < 0.02 ? 0.18 : 0.10))
      + (Math.abs(delay) <= 45 ? 0.05 : 0)

    if (!best || confidence > best.confidence) {
      best = {
        transaction: tx,
        ecriture_id: e.id,
        ecriture: e,
        strategy: 'ecriture_match',
        confidence,
        reasoning: `Écriture ${compte} "${e.libelle || ''}" — ${eAmt.toFixed(2)} MUR ${diff < 0.005 ? 'exact' : `(écart ${(diff * 100).toFixed(1)}%)`}, délai ${delay}j`,
        amount_diff: Math.abs(txAmountMUR - eAmt),
      }
    }
  }

  return best
}

// ═══ Strategy 8: Refund / Negative amount ═══
// A refund is an incoming credit on the bank side that matches a previously paid
// supplier invoice (or an outgoing debit that matches a previously received client
// payment — rare but possible). We detect this when a transaction's direction is
// the OPPOSITE of what a regular invoice payment would be, AND the amount matches
// a facture that's already marked as paid.
function tryRefund(
  tx: MatchingTransaction,
  factures: MatchingFacture[],
  rates?: Record<string, number>
): MatchProposal | null {
  // Also accept transactions where ONE side is negative (bank reversals) — treat
  // magnitude as the effective amount and flip the direction.
  const rawDebit = tx.debit
  const rawCredit = tx.credit
  const hasNegative = rawDebit < 0 || rawCredit < 0

  // Effective direction considering negative flows
  const effectiveDebit = rawDebit < 0 ? Math.abs(rawDebit) : rawDebit
  const effectiveCredit = rawCredit < 0 ? Math.abs(rawCredit) : rawCredit
  // If a credit line is negative, it's effectively a refund OUT (debit)
  const refundIsOut = rawCredit < 0
  const refundIsIn  = rawDebit < 0

  if (!hasNegative && effectiveDebit === 0 && effectiveCredit === 0) return null

  // For a standard refund: an incoming credit matches a supplier invoice (we got money back)
  // or an outgoing debit matches a client invoice (we refunded a customer)
  const isRefundOfSupplier = effectiveCredit > 0 || refundIsIn
  const amount = Math.max(effectiveDebit, effectiveCredit)
  const amountMUR = toMUR(amount, tx.devise, rates)
  if (amountMUR === 0) return null

  const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
  const libLower = (tx.libelle || '').toLowerCase()
  const looksLikeReversal = /reversal|refund|chargeback|remboursement|annulation/.test(libLower)

  // Only match factures of the right type (fournisseur when refunding supplier purchase)
  const expectedType: 'client' | 'fournisseur' = isRefundOfSupplier ? 'fournisseur' : 'client'

  let best: MatchProposal | null = null
  for (const f of factures) {
    if (f.type_facture && f.type_facture !== expectedType) continue
    const fAmount = Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates)
    if (fAmount === 0) continue
    const diff = Math.abs(amountMUR - fAmount) / fAmount
    if (diff > 0.05) continue

    const score = tiersScore(txTiers, f.tiers || '')
    if (score < 0.4 && !looksLikeReversal) continue

    const confidence = 0.55
      + (looksLikeReversal ? 0.15 : 0)
      + (score * 0.15)
      + (diff < 0.005 ? 0.10 : 0)

    if (!best || confidence > best.confidence) {
      best = {
        transaction: tx,
        facture_ids: [f.id],
        factures: [f],
        strategy: 'refund',
        confidence: Math.min(0.92, confidence),
        reasoning: `Remboursement${looksLikeReversal ? ' (reversal détecté)' : ''} — facture ${f.numero_facture || ''} de ${f.tiers || ''} (montant ${fAmount.toFixed(2)} MUR)`,
        amount_diff: Math.abs(amountMUR - fAmount),
        delay_days: daysBetween(f.date_facture || '', tx.date),
        within_terms: true,
      }
    }
  }

  return best
}

// ═══ Main engine ═══
export function findBestMatch(
  tx: MatchingTransaction,
  candidateFactures: MatchingFacture[],
  rates?: Record<string, number>,
  patterns?: HistoricalPattern[]
): MatchProposal | null {
  // Filter by direction (considering negative flows)
  const effectiveDebit = tx.debit < 0 ? Math.abs(tx.credit || 0) : tx.debit
  const effectiveCredit = tx.credit < 0 ? Math.abs(tx.debit || 0) : tx.credit
  const isOutgoing = effectiveDebit > 0 && tx.debit >= 0
  const expectedType: 'client' | 'fournisseur' = isOutgoing ? 'fournisseur' : 'client'
  const eligible = candidateFactures.filter(f => f.type_facture === expectedType || !f.type_facture)

  // Always consider refund path — even with no eligible regular factures
  const refund = tryRefund(tx, candidateFactures, rates)

  if (eligible.length === 0) return refund

  // Try strategies in order, return first match with confidence >= 0.5
  const strategies = [
    (t: MatchingTransaction, f: MatchingFacture[]) => tryExactReference(t, f, rates),
    (t: MatchingTransaction, f: MatchingFacture[]) => tryAmountAndTiers(t, f, rates),
    (t: MatchingTransaction, f: MatchingFacture[]) => tryGroupedSum(t, f, rates),
    (t: MatchingTransaction, f: MatchingFacture[]) => tryPartial(t, f, rates),
    (t: MatchingTransaction, f: MatchingFacture[]) => tryHistorical(t, f, patterns || [], rates),
  ]

  let best: MatchProposal | null = refund
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
  rates?: Record<string, number>,
  patterns?: HistoricalPattern[]
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
    const match = findBestMatch(tx, available, rates, patterns)
    if (match && match.confidence >= 0.5) {
      proposals.push(match)
      for (const fid of match.facture_ids) usedFactureIds.add(fid)
    }
  }

  return proposals
}
