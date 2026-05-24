/**
 * Matching-engine helpers extraits du monolithe
 * `app/api/comptable/rapprochement/route.ts` (5235 lignes).
 *
 * NB : ce fichier complète `lib/accounting/matching-engine.ts` (qui
 * porte la cascade `analyzeAllTransactions` partagée avec
 * `lib/accounting/intelligent-rapprochement.ts`). Ici on regroupe les
 * petits utilitaires qui étaient inlinés dans la route et qui ont
 * vocation à être réutilisés (lettrage Phase 5, VI pairing, etc.).
 *
 * Mission V3-21/30 (Vague 3 Code Quality) — extraction batch 1.
 *
 * AUCUN CHANGEMENT DE LOGIQUE MÉTIER : copies à l'identique des
 * implémentations originales (lignes 110-140, 630-643, 685-687,
 * 759-774, 910-914 du route.ts d'origine).
 */

// ─────────────────────────────────────────────────────────────────────────
// Currency helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Devise effective d'une transaction.
 * Priorité : `tx.devise` (si OCR a extrait la devise au niveau tx)
 *   → puis devise du compte bancaire (legacy tx sans `tx.devise`).
 */
export type TxDeviseLike = string | { devise?: string | null } | null | undefined

/**
 * Convertit un montant en MUR selon les taux fournis.
 *
 * Surcharge tx-aware : on accepte un objet `{ devise }` ou directement
 * un code devise string. Quand la devise effective est MUR (ou absente),
 * on retourne le montant tel quel. Sinon, on applique `rates[devise]`
 * (fallback 1 si la devise est inconnue dans la map).
 *
 * Extrait de `app/api/comptable/rapprochement/route.ts` (ligne 630 du
 * fichier d'origine) — la version inline qui capturait `rates` en
 * closure est remplacée par cette signature pure.
 */
export function toMURWithRates(
  amount: number,
  txOrDevise: TxDeviseLike,
  rates: Record<string, number>,
  compteDeviseFallback?: string,
): number {
  let effectiveDevise: string
  if (txOrDevise && typeof txOrDevise === 'object') {
    effectiveDevise = (txOrDevise.devise || compteDeviseFallback || 'MUR').toUpperCase()
  } else {
    effectiveDevise = ((txOrDevise as string | null | undefined) || 'MUR').toUpperCase()
  }
  if (!effectiveDevise || effectiveDevise === 'MUR') return amount
  return amount * (rates[effectiveDevise] || 1)
}

// ─────────────────────────────────────────────────────────────────────────
// Tiers (third party) name matching
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalise un nom de tiers pour comparaison stricte :
 *   • lowercase
 *   • supprime suffixes corporatifs (Ltd / Limited / SARL / SA / Co /
 *     Company / Cie / Inc)
 *   • supprime tout ce qui n'est pas alphanumérique
 *
 * Variante "stricte" utilisée par les helpers de lettrage Phase 5 / VI
 * pairing. Pour les comparaisons cascade (matching-engine principal),
 * voir `normalize()` dans `lib/accounting/matching-engine.ts`.
 */
export function normalizeTiers(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\s+(ltd|limited|sarl|sas|sa|co|company|cie|inc)\.?\s*$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

/**
 * Score Jaccard pondéré sur les mots de 3 caractères ou plus.
 *
 * - Identité parfaite → 1
 * - Inclusion        → 0.9
 * - Sinon            → |inter| / |union|
 *
 * Utilisé pour scorer la similarité tiers banque ↔ tiers facture
 * dans le lettrage Phase 5 (BNQ ↔ ACH) — règle "priorité NOM".
 */
export function advancedTiersScore(a: string, b: string): number {
  const na = (a || '')
    .toLowerCase()
    .replace(/\b(ltd|limited|sarl|sa|co|inc|pvt)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const nb = (b || '')
    .toLowerCase()
    .replace(/\b(ltd|limited|sarl|sa|co|inc|pvt)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const wA = new Set(na.split(' ').filter(w => w.length > 2))
  const wB = new Set(nb.split(' ').filter(w => w.length > 2))
  if (wA.size === 0 || wB.size === 0) return 0
  const inter = [...wA].filter(w => wB.has(w)).length
  return inter / new Set([...wA, ...wB]).size
}

/**
 * Score d'overlap mot-à-mot (chaque mot peut matcher par préfixe).
 * Utilisé en complément de `advancedTiersScore` quand on veut détecter
 * les variations d'abréviations (ex: "Mauritius Telecom" ↔ "MT Ltd").
 */
export function wordOverlap(a: string, b: string): number {
  const wordsA = normalizeTiers(a).split(/\s+/).filter(w => w.length > 2)
  const wordsB = normalizeTiers(b).split(/\s+/).filter(w => w.length > 2)
  if (wordsA.length === 0 || wordsB.length === 0) return 0
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb))).length
  return overlap / Math.max(wordsA.length, wordsB.length)
}

/**
 * Détecte si un tiers bancaire désigne la société elle-même.
 *
 * RÈGLE ULTRA-STRICTE (anti-faux-positifs) — extraite de route.ts
 * ligne 759. Critères cumulatifs :
 *   1. Au moins 70% des mots du nom de société sont retrouvés (par
 *      préfixe 4-car) dans les mots du tiers détecté.
 *   2. Tous les mots du tiers détecté sont liés à un mot société
 *      (aucun mot "étranger").
 *
 * Permet de classer une tx "Own Account Transfer — MyCompany Ltd" en
 * `interne` même quand le tiers contient des variantes (abréviations,
 * suffixes corporatifs supprimés). Doit être appelé sur des chaînes
 * déjà normalisées (Ltd/SA/etc. retirés).
 */
export function isSelfMatch(selfName: string, tiersName: string): boolean {
  const selfWords = selfName.split(/\s+/).filter((w: string) => w.length > 2)
  const tiersWords = tiersName.split(/\s+/).filter((w: string) => w.length > 2)
  if (selfWords.length === 0 || tiersWords.length === 0) return false
  // Minimum 4 caractères pour le matching (évite "myt" matchant n'importe quoi)
  const matchedSelf = selfWords.filter((sw: string) => tiersWords.some((tw: string) => {
    if (sw.length < 4 || tw.length < 4) return false
    return tw.startsWith(sw.substring(0, 4)) || sw.startsWith(tw.substring(0, 4))
  }))
  if (matchedSelf.length < selfWords.length * 0.7) return false
  const unmatchedTiers = tiersWords.filter((tw: string) => !selfWords.some((sw: string) => {
    if (sw.length < 4 || tw.length < 4) return false
    return tw.startsWith(sw.substring(0, 4)) || sw.startsWith(tw.substring(0, 4))
  }))
  return unmatchedTiers.length === 0
}

// ─────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Différence absolue en jours entre deux dates ISO. Retourne 999 si
 * l'une des deux est invalide (sentinel qui désactive tout matching
 * basé sur la proximité date).
 *
 * Utilisé par le matching VI (virements internes) pour apparier deux
 * mouvements miroir : tolérance ±2 jours (cf route.ts ligne 910).
 */
export function dateDiffDays(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (isNaN(da) || isNaN(db)) return 999
  return Math.abs(da - db) / (1000 * 60 * 60 * 24)
}

// ─────────────────────────────────────────────────────────────────────────
// Classification patterns (pré-cascade)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Liste de patterns lowercase qu'on cherche dans le libellé bancaire
 * pour reconnaître des frais bancaires (Phase 1 du rapprochement, avant
 * la cascade de matching factures).
 *
 * Extraite de route.ts ligne 685. Couvre les libellés MCB / SBM /
 * BankOne / Absa observés en production sur les sociétés Lexora.
 */
export const BANK_FEE_PATTERNS: readonly string[] = [
  'service fee',
  'banking subs fee',
  'merchant monthly fee',
  'payment fee',
  'outward transfer charge',
  'tax amount due',
  'card repayment',
  'merchant discount',
  'merchant settlement',
  'e-commerce transaction fee',
  'contra entry',
  'commission',
  'frais',
]

/**
 * Retourne true si le libellé bancaire correspond à un pattern de frais
 * bancaires connu. Helper trivial mais centralisé pour éviter les
 * répétitions `BANK_FEE_PATTERNS.some(p => libelle.includes(p))`.
 */
export function isBankFeeLibelle(libelle: string | null | undefined): boolean {
  const lower = (libelle || '').toLowerCase()
  if (!lower) return false
  return BANK_FEE_PATTERNS.some(p => lower.includes(p))
}
