/**
 * FIX 10 — Shared classification rules for bank transaction → accounting category.
 *
 * This module is imported by:
 *   • client preview   — `app/client/rapprochement/page.tsx` → computeAutoPreview
 *   • server agent     — `app/api/comptable/rapprochement/agent/deterministic`
 *   • server matcher   — `app/api/comptable/rapprochement/route.ts` (auto_rapprocher)
 *
 * The previous architecture had the client preview running its own keyword
 * matchers and the server running completely different ones, so users saw
 * "5 frais bancaires détectés" in the preview but after clicking the server
 * only reconciled 2. This file is the single source of truth.
 *
 * PCG/Mauritius categories handled here:
 *   • transfert_interne       — IB Own Account Transfer between the
 *                               société's own comptes (no lettrage, 580).
 *   • frais_bancaires         — service fees, commission, MCB charges
 *                               (compte 627, no lettrage — règle R7).
 *   • paiement_mra            — tax payments (CSG, NSF, PRGF, TL, PAYE, VAT)
 *                               (compte 444 — géré par déclaration).
 *   • salaire_bulk            — bulk payroll run (compte 421).
 *   • salaire_individuel      — single employee salary (compte 421).
 *   • remboursement_personnel — CCA associé refund (compte 455).
 *   • inconnu                 — no rule matched — needs manual review.
 *
 * Not handled here (by design — they need context beyond the transaction):
 *   • facture_unique / facture_groupee  — need an active facture DB lookup.
 *   • virement_inter_societe            — needs list of sister sociétés.
 *   • compte_courant_associe            — needs list of associés.
 */

export type ClassificationCategory =
  | 'transfert_interne'
  | 'frais_bancaires'
  | 'paiement_mra'
  | 'salaire_bulk'
  | 'salaire_individuel'
  | 'remboursement_personnel'
  | 'remboursement_frais' // FIX 8 — note de frais salarié (421) ou tiers (467)
  | 'inconnu'

export interface TransactionLike {
  libelle?: string | null
  tiers_detecte?: string | null
  tiers?: string | null
  debit?: number | string | null
  credit?: number | string | null
  date?: string | null
  devise?: string | null
}

export interface Classification {
  category: ClassificationCategory
  confidence: 'high' | 'medium' | 'low'
  matchedPatterns: string[]
  note: string
  /** Default PCG account hint for downstream book-keeping (never blocks). */
  compte_default: string | null
  /** True → no lettrage code should be issued (R7). */
  skip_lettrage: boolean
}

// ─── Patterns (single source of truth) ───────────────────────────────────────

/** Frais bancaires — match on libelle, not tiers (MCB appears as tiers even on legit txns). */
export const PATTERNS_FRAIS_BANCAIRES = [
  'service fee',
  'service charge',
  'banking subs fee',
  'merchant monthly fee',
  'payment fee',
  'outward transfer charge',
  'tax amount due', // MCB keeps taxing its own fees
  'card repayment',
  'merchant discount',
  'merchant settlement',
  'e-commerce transaction fee',
  'contra entry',
  'commission',
  'bank charge',
  'frais bancaire',
  'frais banque',
  'stamp duty',
  'levy',
  'annual fee',
  'monthly fee',
  'interest', // intérêts débiteurs
  'penalty',
  'subs', // abonnements bancaires
] as const

/** Bank tiers that are almost always sending fees, not real business. */
export const PATTERNS_BANK_TIERS = [
  'mcb',
  'bom',
  'sbm',
  'abc banking',
  'mastercard',
  'visa',
] as const

/** MRA / tax authority patterns. */
export const PATTERNS_MRA = [
  'mauritius revenue',
  'mauritius revenue authority',
  'mra',
  'tax payment',
  'income tax',
  'vat payment',
  'paye tax',
  'csg',
  'nsf',
  'prgf',
  'levy tax',
] as const

/** Bulk / individual salary patterns. */
export const PATTERNS_SALAIRE = [
  'salary',
  'salaire',
  'wages',
  'remuneration',
  'payroll',
  'bonus',
  'salary proceeds', // MCB's reversal of a bulk salary
] as const

/** CCA / associé personal refund patterns. */
export const PATTERNS_REMBOURSEMENT_PERSONNEL = [
  'rbt cc',
  'remb cc',
  'remboursement cc',
  'compte courant',
  'current account',
  'personal refund',
  'refund associate',
] as const

/**
 * FIX 8 — Notes de frais / remboursement de frais au personnel.
 *
 * Comptes Mauritius visés :
 *   • 421 Personnel — rémunération due (si l'employé est salarié)
 *   • 467 Autres débiteurs/créditeurs (si prestataire externe ou cas isolé)
 *   • 422 Personnel — avances permanentes (JAMAIS lettré — skip)
 *
 * La catégorisation fine 421 vs 467 requiert de connaître le statut du
 * tiers (salarié / externe) — on renvoie juste « remboursement_frais »
 * et on laisse le workflow aval (popup de validation) décider du compte.
 */
export const PATTERNS_REMBOURSEMENT_FRAIS = [
  'note de frais',
  'notes de frais',
  'expense claim',
  'expense report',
  'refund expense',
  'petrol',
  'carburant',
  'fuel',
  'parking',
  'taxi',
  'meal',
  'lunch',
  'dinner',
  'restaurant',
  'hotel',
  'toll',
  'péage',
  'mileage',
  'kilométrique',
  'remboursement frais',
] as const

/** IB Own Account Transfer (between the société's own accounts). */
export const PATTERNS_VIREMENT_INTERNE = [
  'ib own account',
  'own account transfer',
  'virement interne',
  'internal transfer',
  'transfer between accounts',
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return String(s || '').toLowerCase().trim()
}

function anyIn(needles: readonly string[], haystack: string): string | null {
  for (const n of needles) {
    if (haystack.includes(n)) return n
  }
  return null
}

function amountOf(tx: TransactionLike): { debit: number; credit: number; amount: number } {
  const debit = Number(tx.debit) || 0
  const credit = Number(tx.credit) || 0
  return { debit, credit, amount: Math.max(debit, credit) }
}

// ─── PCG account classification (shared with server route) ──────────────────
// FIX 9 — extracted from app/api/comptable/rapprochement/route.ts so it can
// be imported by lib/accounting/accounting-rules.ts without a circular dep.

const LETTRABLE_PREFIXES_LIB = ['401', '411', '421', '425', '431', '455', '467', '409', '486', '580']
const SKIP_LETTRAGE_PREFIXES_LIB = ['627', '444', '422']

/**
 * Classifie un compte PCG/Mauritius en :
 *   • 'lettrable' — tiers / transit : 401/411/421/425/431/455/467/409/486/580
 *   • 'skip'      — 627 frais bancaires, 444 TVA due, 422 avances permanentes
 *   • 'charge'    — 6xxx hors 627/422
 *   • 'produit'   — 7xxx
 *   • 'autre'     — comptes 1/2/3/5 classes non listés ci-dessus
 */
export function accountClass(
  compte: string | null | undefined,
): 'lettrable' | 'skip' | 'charge' | 'produit' | 'autre' {
  const c = String(compte || '').trim()
  if (!c) return 'autre'
  if (SKIP_LETTRAGE_PREFIXES_LIB.some(p => c.startsWith(p))) return 'skip'
  if (LETTRABLE_PREFIXES_LIB.some(p => c.startsWith(p))) return 'lettrable'
  if (c.startsWith('6')) return 'charge'
  if (c.startsWith('7')) return 'produit'
  return 'autre'
}

export function isLettrableAccount(compte: string | null | undefined): boolean {
  return accountClass(compte) === 'lettrable'
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Classify a bank transaction into a PCG/Mauritius category using the
 * shared ruleset. Returns `{ category: 'inconnu' }` when nothing matches —
 * callers should then run richer logic (facture DB lookup, inter-société
 * detection, associé match, …).
 *
 * Deterministic: same input → same output. Pure function, safe to call
 * from both client and server.
 */
export function classifyTransaction(tx: TransactionLike): Classification {
  const libelle = norm(tx.libelle)
  const tiers = norm(tx.tiers_detecte || tx.tiers)
  const { debit, amount } = amountOf(tx)
  const isDebit = debit > 0
  const matched: string[] = []

  // 1. Virement interne (before salaire — "salary proceeds" is also an IB transfer)
  const internePattern = anyIn(PATTERNS_VIREMENT_INTERNE, libelle)
  if (internePattern && !libelle.includes('standard payment')) {
    matched.push(internePattern)
    return {
      category: 'transfert_interne',
      confidence: 'high',
      matchedPatterns: matched,
      note: 'Virement interne (compte 580 transit — règle R3)',
      compte_default: '580',
      skip_lettrage: false, // 580 est lettrable — il DOIT être soldé
    }
  }

  // 2. Frais bancaires — aligné sur le serveur : exige tiers bancaire
  //    ET libellé de frais pour être classé ici. Les transactions qui ont
  //    seulement un tiers bancaire (ex. virement reçu d'une banque) ou
  //    seulement un libellé "fee" sans tiers bancaire sont laissées en
  //    "inconnu" pour arbitrage manuel.
  const feeLibelle = anyIn(PATTERNS_FRAIS_BANCAIRES, libelle)
  const bankTiers = anyIn(PATTERNS_BANK_TIERS, tiers)
  if (isDebit && feeLibelle && bankTiers) {
    matched.push(`tiers:${bankTiers}`)
    matched.push(`libelle:${feeLibelle}`)
    // Bank fees are usually small — flag low confidence above 10 000 MUR
    const conf: 'high' | 'medium' | 'low' =
      amount < 2000 ? 'high' : amount < 10000 ? 'medium' : 'low'
    return {
      category: 'frais_bancaires',
      confidence: conf,
      matchedPatterns: matched,
      note: `Frais bancaires (compte 627 — pas de lettrage, règle R7)`,
      compte_default: '627',
      skip_lettrage: true,
    }
  }

  // 3. Paiement MRA
  const mraPattern = anyIn(PATTERNS_MRA, tiers) || anyIn(PATTERNS_MRA, libelle)
  if (isDebit && mraPattern) {
    matched.push(mraPattern)
    return {
      category: 'paiement_mra',
      confidence: 'high',
      matchedPatterns: matched,
      note: 'Paiement MRA (compte 444 — géré par déclaration fiscale)',
      compte_default: '444',
      skip_lettrage: true,
    }
  }

  // 4. Salaire (bulk vs individuel)
  const salPattern = anyIn(PATTERNS_SALAIRE, libelle) || anyIn(PATTERNS_SALAIRE, tiers)
  if (isDebit && salPattern) {
    matched.push(salPattern)
    const isBulk =
      libelle.includes('bulk payment') ||
      libelle.includes('payroll') ||
      tiers === 'personnel' ||
      amount > 50000 // heuristic
    return {
      category: isBulk ? 'salaire_bulk' : 'salaire_individuel',
      confidence: 'high',
      matchedPatterns: matched,
      note: isBulk
        ? 'Masse salariale (compte 421 — à lettrer avec bulletins_paie)'
        : 'Salaire individuel (compte 421)',
      compte_default: '421',
      skip_lettrage: false,
    }
  }

  // 5. Remboursement de frais (note de frais salarié ou tiers)
  //    FIX 8 — avant la règle CCA associé : un « petrol » n'est
  //    presque jamais un remboursement au titre de CCA.
  const fraisPattern = anyIn(PATTERNS_REMBOURSEMENT_FRAIS, libelle) ||
                       anyIn(PATTERNS_REMBOURSEMENT_FRAIS, tiers)
  if (fraisPattern) {
    matched.push(fraisPattern)
    return {
      category: 'remboursement_frais',
      confidence: 'medium',
      matchedPatterns: matched,
      note: 'Note de frais (compte 421 salarié ou 467 externe — sélection requise). ATTENTION : compte 422 avances permanentes est NON lettrable.',
      compte_default: '421',
      skip_lettrage: false,
    }
  }

  // 6. Remboursement personnel (CCA associé)
  const rbtPattern = anyIn(PATTERNS_REMBOURSEMENT_PERSONNEL, libelle) ||
                     anyIn(PATTERNS_REMBOURSEMENT_PERSONNEL, tiers)
  if (rbtPattern) {
    matched.push(rbtPattern)
    return {
      category: 'remboursement_personnel',
      confidence: 'medium',
      matchedPatterns: matched,
      note: 'Remboursement associé (compte 455 — nécessite sélection d\'un associé)',
      compte_default: '455',
      skip_lettrage: false,
    }
  }

  return {
    category: 'inconnu',
    confidence: 'low',
    matchedPatterns: [],
    note: 'Aucune règle déclenchée — révision manuelle requise',
    compte_default: null,
    skip_lettrage: false,
  }
}

// ─── Bucket aggregation (convenience for UI previews) ────────────────────────

export interface BucketItem {
  id: string
  date: string
  libelle: string
  tiers: string
  amount: number
  devise: string
  category: ClassificationCategory
  note: string
}

export interface BucketSummary {
  count: number
  total: number
  items: BucketItem[]
}

export interface CategorizedBuckets {
  salaires: BucketSummary
  mra: BucketSummary
  frais: BucketSummary
  internes: BucketSummary
  remboursements: BucketSummary
  notes_frais: BucketSummary
  inconnus: BucketSummary
}

/** Given a list of transactions, produce the same bucket shape the preview UI uses. */
export function bucketizeTransactions(txs: Array<TransactionLike & { id?: unknown }>): CategorizedBuckets {
  const mk = (): BucketSummary => ({ count: 0, total: 0, items: [] })
  const buckets: CategorizedBuckets = {
    salaires: mk(),
    mra: mk(),
    frais: mk(),
    internes: mk(),
    remboursements: mk(),
    notes_frais: mk(),
    inconnus: mk(),
  }

  for (const t of txs) {
    const cls = classifyTransaction(t)
    const { amount } = amountOf(t)
    if (amount === 0) continue
    const item: BucketItem = {
      id: String((t as any).id ?? ''),
      date: String(t.date || ''),
      libelle: String(t.libelle || ''),
      tiers: String(t.tiers_detecte || t.tiers || ''),
      amount,
      devise: String(t.devise || 'MUR'),
      category: cls.category,
      note: cls.note,
    }

    const pushTo = (b: BucketSummary) => {
      b.count++
      b.total += amount
      b.items.push(item)
    }

    switch (cls.category) {
      case 'salaire_bulk':
      case 'salaire_individuel': pushTo(buckets.salaires); break
      case 'paiement_mra': pushTo(buckets.mra); break
      case 'frais_bancaires': pushTo(buckets.frais); break
      case 'transfert_interne': pushTo(buckets.internes); break
      case 'remboursement_personnel': pushTo(buckets.remboursements); break
      case 'remboursement_frais': pushTo(buckets.notes_frais); break
      case 'inconnu': pushTo(buckets.inconnus); break
    }
  }

  return buckets
}
