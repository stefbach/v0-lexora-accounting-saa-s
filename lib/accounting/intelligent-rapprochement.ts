/**
 * intelligent-rapprochement.ts — Moteur de rapprochement intelligent 4 phases
 *
 * Raisonne comme un vrai comptable :
 *
 * PHASE 1 — Identification des tiers
 *   Construit un registre de fournisseurs/clients à partir des factures
 *   existantes, puis identifie chaque transaction bancaire à un tiers connu
 *   via matching flou (Jaccard, sous-chaîne, alias).
 *
 * PHASE 2 — Rapprochement intermédiaire par tiers
 *   Pour chaque tiers identifié, met face à face tous les paiements et
 *   toutes les factures impayées. Tente :
 *   - 1 paiement → 1 facture (montant exact ou proche, date décalée OK)
 *   - 1 paiement → N factures (somme de N factures ≈ paiement, même période)
 *   - N paiements → 1 facture (acomptes successifs)
 *
 * PHASE 3 — Classifications automatiques (sans pièce comptable)
 *   Salaires (bulk + individuel), charges sociales (CSG/NSF/PAYE/MRA),
 *   frais bancaires, virements internes — lettrés automatiquement.
 *
 * PHASE 4 — Consolidation
 *   Agrège les résultats des 3 phases, priorise par confiance, déduplique.
 */

import { normalize, tiersScore, toMUR } from './matching-engine'
import type { MatchingFacture, MatchingTransaction } from './matching-engine'

// ═══════════════════════════════════════════════════════════════
// ALIAS FOURNISSEURS — DB + FALLBACK GLOBAL
//
// Les alias sont chargés depuis supplier_aliases (migration 127).
// Si la table n'existe pas ou est vide, un jeu de fallback global
// (commun à Maurice) est utilisé automatiquement. Ceci garantit
// que le moteur fonctionne même sans la migration appliquée.
// ═══════════════════════════════════════════════════════════════

export interface SupplierAlias {
  canonical: string
  alias: string
}

/** Alias globaux fallback — utilisés quand la table supplier_aliases est vide */
const GLOBAL_FALLBACK_ALIASES: SupplierAlias[] = [
  // Telecom
  { canonical: 'mauritius telecom', alias: 'myt' },
  { canonical: 'mauritius telecom', alias: 'my.t' },
  { canonical: 'mauritius telecom', alias: 'mauritius telecom' },
  { canonical: 'mauritius telecom', alias: 'mauritius telecom ltd' },
  { canonical: 'mauritius telecom', alias: 'cellplus' },
  { canonical: 'mauritius telecom', alias: 'cellplus mobile' },
  { canonical: 'mauritius telecom', alias: 'cellplus mobile communications' },
  { canonical: 'mauritius telecom', alias: 'cellplus mobile communications ltd' },
  { canonical: 'mauritius telecom', alias: 'myt mauritius telecom' },
  { canonical: 'emtel', alias: 'emtel' },
  { canonical: 'emtel', alias: 'emtel ltd' },
  { canonical: 'emtel', alias: 'emtel limited' },
  // Banques
  { canonical: 'mcb', alias: 'mcb' },
  { canonical: 'mcb', alias: 'mauritius commercial bank' },
  { canonical: 'sbm', alias: 'sbm' },
  { canonical: 'sbm', alias: 'state bank of mauritius' },
  { canonical: 'sbm', alias: 'sbm bank' },
  // Services publics
  { canonical: 'ceb', alias: 'ceb' },
  { canonical: 'ceb', alias: 'central electricity board' },
  { canonical: 'cwa', alias: 'cwa' },
  { canonical: 'cwa', alias: 'central water authority' },
  // Gouvernement
  { canonical: 'mra', alias: 'mra' },
  { canonical: 'mra', alias: 'mauritius revenue authority' },
  { canonical: 'mra', alias: 'mauritius revenue' },
  // Cloud
  { canonical: 'google cloud', alias: 'google' },
  { canonical: 'google cloud', alias: 'google cloud' },
  { canonical: 'google cloud', alias: 'google cloud emea' },
  { canonical: 'google cloud', alias: 'google cloud emea limited' },
]

/** Build a lookup map from alias → canonical, from DB-loaded alias records.
 *  If the input is empty, uses GLOBAL_FALLBACK_ALIASES automatically. */
export function buildAliasMap(aliases: SupplierAlias[]): Map<string, string> {
  // Use DB aliases if available, otherwise fall back to globals
  const source = aliases.length > 0 ? aliases : GLOBAL_FALLBACK_ALIASES
  const map = new Map<string, string>()
  for (const { canonical, alias } of source) {
    const norm = (alias || '').toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim()
    const canon = (canonical || '').toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim()
    if (!norm || !canon) continue
    map.set(norm, canon)
    // Also add without spaces for tight matching (e.g. "myt" matches "my.t")
    map.set(norm.replace(/[\s.]+/g, ''), canon)
  }
  if (aliases.length === 0) {
    console.log(`[intelligent] Using ${GLOBAL_FALLBACK_ALIASES.length} fallback aliases (supplier_aliases table empty or not applied)`)
  }
  return map
}

/** Resolve a name to its canonical supplier key via the alias map.
 *  Checks the full name, then without spaces, then each individual word. */
function resolveAlias(name: string, aliasMap: Map<string, string>): string | null {
  if (aliasMap.size === 0) return null
  const norm = (name || '').toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim()
  // Direct hit
  if (aliasMap.has(norm)) return aliasMap.get(norm)!
  // Without spaces/dots
  const nospace = norm.replace(/[\s.]+/g, '')
  if (aliasMap.has(nospace)) return aliasMap.get(nospace)!
  // Try each word as a standalone lookup (for "MyT" in a long libellé)
  const words = norm.split(/\s+/)
  for (const w of words) {
    if (w.length >= 3 && aliasMap.has(w)) return aliasMap.get(w)!
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SupplierProfile {
  /** Nom normalisé (clé unique) */
  key: string
  /** Noms bruts connus (tous les alias vus dans factures + banque) */
  rawNames: string[]
  /** Type : fournisseur ou client */
  type: 'fournisseur' | 'client' | 'mixte'
  /** Factures impayées de ce tiers */
  factures: MatchingFacture[]
  /** Transactions bancaires identifiées comme venant de ce tiers */
  transactions: Array<MatchingTransaction & { releveIdx: number }>
}

export interface IntermediateMatch {
  supplierKey: string
  supplierName: string
  transactionKey: string // releve_id:idx
  transaction: MatchingTransaction
  factureIds: string[]
  factures: MatchingFacture[]
  strategy: string
  confidence: number
  reasoning: string
  amountDiff: number
  phase: 'supplier_match' | 'auto_classify' | 'fallback'
}

export interface AutoClassification {
  transactionKey: string
  transaction: MatchingTransaction
  type: 'transfert_interne' | 'frais_bancaires' | 'salaire_bulk' | 'salaire_individuel' | 'paiement_mra' | 'charges_sociales' | 'reversal_salaire'
  note: string
  ecritureId?: string
  confidence: number
}

export interface IntelligentResult {
  matches: IntermediateMatch[]
  classifications: AutoClassification[]
  supplierProfiles: SupplierProfile[]
  stats: {
    totalTransactions: number
    identified: number
    matched: number
    classified: number
    remaining: number
    byStrategy: Record<string, number>
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers avancés
// ═══════════════════════════════════════════════════════════════

/** Extraction intelligente du tiers depuis un libellé bancaire */
function extractTiers(libelle: string, tiersDetecte?: string | null): string {
  if (tiersDetecte && tiersDetecte.length > 2) return tiersDetecte
  const lib = (libelle || '').trim()
  // Patterns bancaires MCB/SBM courants — extraire le nom après le préfixe
  const patterns = [
    /(?:outward tt|inward tt|ib ft|ib own account ft)\s+(.+?)(?:\s+\d|$)/i,
    /(?:pos purchase|pos payment)\s+(.+?)(?:\s+\d|$)/i,
    /(?:direct debit|standing order|dd payment)\s+(.+?)(?:\s+\d|$)/i,
    /(?:cheque deposit|chq dep|chq no)\s*\d*\s*(.+)/i,
    /(?:bulk payment)\s+(.+?)(?:\s+\d|$)/i,
  ]
  for (const p of patterns) {
    const m = lib.match(p)
    if (m?.[1] && m[1].length > 2) return m[1].trim()
  }
  // Fallback : prendre les premiers mots significatifs (ignorer les codes TX)
  const words = lib.replace(/\b[A-Z0-9]{10,}\b/g, '').replace(/\d{4,}/g, '').trim()
  return words.split(/\s+/).slice(0, 4).join(' ') || lib.substring(0, 40)
}

/** Normalisation avancée avec gestion des abréviations mauriciennes */
function normalizeAdvanced(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltd|limited|sarl|sas|sa|eurl|co\.?|inc|llc|plc|pvt|pty|bv|gmbh|cie|company)\b/gi, '')
    .replace(/[.,;:!?()/\\'\-"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Score de similarité avancé (combine Jaccard + sous-chaîne + initiales + alias) */
function advancedTiersScore(bankName: string, factureName: string, aliasMap?: Map<string, string>): number {
  const a = normalizeAdvanced(bankName)
  const b = normalizeAdvanced(factureName)
  if (!a || !b) return 0
  if (a === b) return 1.0

  // Alias check — si les deux résolvent au même canonical, c'est le même fournisseur
  const am = aliasMap || new Map()
  const aliasA = resolveAlias(bankName, am)
  const aliasB = resolveAlias(factureName, am)
  if (aliasA && aliasB && aliasA === aliasB) return 0.96
  // Un seul résout mais le canonical apparaît dans l'autre nom
  if (aliasA && b.includes(aliasA)) return 0.93
  if (aliasB && a.includes(aliasB)) return 0.93

  // Sous-chaîne complète
  if (a.includes(b) || b.includes(a)) return 0.92

  // Jaccard sur les mots
  const wordsA = new Set(a.split(' ').filter(w => w.length > 1))
  const wordsB = new Set(b.split(' ').filter(w => w.length > 1))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  const inter = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  const jaccard = inter / union

  // Bonus : mot principal (le plus long) en commun
  const mainA = [...wordsA].sort((x, y) => y.length - x.length)[0]
  const mainB = [...wordsB].sort((x, y) => y.length - x.length)[0]
  const mainMatch = mainA && mainB && (mainA.includes(mainB) || mainB.includes(mainA)) ? 0.15 : 0

  // Bonus : mots partiels (un mot de A est début d'un mot de B, ou l'inverse)
  let partialBonus = 0
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa.length >= 3 && wb.length >= 3 && (wa.startsWith(wb.substring(0, 3)) || wb.startsWith(wa.substring(0, 3)))) {
        partialBonus = Math.max(partialBonus, 0.08)
      }
    }
  }

  return Math.min(1.0, jaccard + mainMatch + partialBonus)
}

function txKey(tx: MatchingTransaction): string {
  return `${tx.releve_id}:${tx.transaction_idx}`
}

function daysBetween(d1: string, d2: string): number {
  if (!d1 || !d2) return 999
  const a = new Date(d1).getTime()
  const b = new Date(d2).getTime()
  if (isNaN(a) || isNaN(b)) return 999
  return Math.abs(Math.floor((b - a) / (1000 * 60 * 60 * 24)))
}

function sameMonth(d1: string, d2: string): boolean {
  return (d1 || '').substring(0, 7) === (d2 || '').substring(0, 7)
}

function monthDiff(d1: string, d2: string): number {
  if (!d1 || !d2) return 999
  const a = new Date(d1)
  const b = new Date(d2)
  return Math.abs((b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth())
}

// ═══════════════════════════════════════════════════════════════
// PHASE 1 — Identification des tiers
// ═══════════════════════════════════════════════════════════════

export function buildSupplierRegistry(
  factures: MatchingFacture[],
  transactions: MatchingTransaction[],
  aliasMap?: Map<string, string>,
): Map<string, SupplierProfile> {
  const registry = new Map<string, SupplierProfile>()
  const am = aliasMap || new Map()

  // Helper: find or create profile, merging by alias
  function getOrCreateProfile(name: string, type: 'fournisseur' | 'client' | 'mixte'): SupplierProfile {
    const key = normalizeAdvanced(name)
    // Check if this name resolves to a known alias
    const canonical = resolveAlias(name, am)

    // Try to find existing profile by key, canonical alias, or fuzzy match
    if (registry.has(key)) return registry.get(key)!
    if (canonical) {
      // Look for a profile whose key or rawNames resolve to the same canonical
      for (const [k, profile] of registry) {
        const profileCanonical = resolveAlias(k, am) || resolveAlias(profile.rawNames[0], am)
        if (profileCanonical === canonical) {
          if (!profile.rawNames.includes(name)) profile.rawNames.push(name)
          return profile
        }
      }
    }
    // Create new profile
    const profile: SupplierProfile = {
      key: canonical || key,
      rawNames: [name],
      type,
      factures: [],
      transactions: [],
    }
    registry.set(canonical || key, profile)
    return profile
  }

  // Seed from factures — chaque tiers de facture est un profil
  for (const f of factures) {
    if (!f.tiers) continue
    const key = normalizeAdvanced(f.tiers)
    if (!key || key.length < 2) continue

    const profile = getOrCreateProfile(f.tiers, f.type_facture || 'fournisseur')
    if (!profile.rawNames.includes(f.tiers)) profile.rawNames.push(f.tiers)
    profile.factures.push(f)
  }

  // Now identify each bank transaction to a known supplier
  for (const tx of transactions) {
    const bankTiers = extractTiers(tx.libelle, tx.tiers_detecte)
    const bankKey = normalizeAdvanced(bankTiers)
    if (!bankKey || bankKey.length < 2) continue

    // First try alias resolution — if bank tiers resolves to same canonical as a profile, instant match
    const bankCanonical = resolveAlias(bankTiers, am)
    let matched = false
    if (bankCanonical) {
      for (const [, profile] of registry) {
        const profileCanonical = resolveAlias(profile.key, am) || resolveAlias(profile.rawNames[0], am)
        if (profileCanonical === bankCanonical) {
          profile.transactions.push({ ...tx, releveIdx: tx.transaction_idx })
          if (!profile.rawNames.includes(bankTiers)) profile.rawNames.push(bankTiers)
          matched = true
          break
        }
      }
    }

    if (!matched) {
      // Fallback: fuzzy score matching against all profiles
      let bestKey: string | null = null
      let bestScore = 0

      for (const [key, profile] of registry) {
        let score = advancedTiersScore(bankTiers, key, am)
        for (const rawName of profile.rawNames) {
          const s = advancedTiersScore(bankTiers, rawName, am)
          if (s > score) score = s
        }
        if (score > bestScore && score >= 0.35) {
          bestScore = score
          bestKey = key
        }
      }

      if (bestKey) {
        const prof = registry.get(bestKey)!
        prof.transactions.push({ ...tx, releveIdx: tx.transaction_idx })
        if (!prof.rawNames.includes(bankTiers)) prof.rawNames.push(bankTiers)
      } else {
        // Tiers inconnu — créer un profil orphelin
        const isOutgoing = tx.debit > 0
        const profile = getOrCreateProfile(bankTiers, isOutgoing ? 'fournisseur' : 'client')
        profile.transactions.push({ ...tx, releveIdx: tx.transaction_idx })
      }
    }
  }

  return registry
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2 — Rapprochement intermédiaire par tiers
// ═══════════════════════════════════════════════════════════════

export function matchBySupplier(
  registry: Map<string, SupplierProfile>,
  rates?: Record<string, number>,
  _aliasMap?: Map<string, string>,
): IntermediateMatch[] {
  const allMatches: IntermediateMatch[] = []
  const usedFactureIds = new Set<string>()
  const usedTxKeys = new Set<string>()

  for (const [, profile] of registry) {
    if (profile.factures.length === 0 || profile.transactions.length === 0) continue

    const unpaidFactures = profile.factures.filter(f => !usedFactureIds.has(f.id))
    const unmatchedTxs = profile.transactions.filter(t => !usedTxKeys.has(txKey(t)))

    if (unpaidFactures.length === 0 || unmatchedTxs.length === 0) continue

    // Sort transactions by date (oldest first) for chronological matching
    unmatchedTxs.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    // ── Strategy A: 1 paiement → 1 facture (exact ou proche, délai décalé OK) ──
    for (const tx of unmatchedTxs) {
      if (usedTxKeys.has(txKey(tx))) continue
      const txRaw = Math.max(tx.debit, tx.credit)
      const txDevise = (tx.devise || 'MUR').toUpperCase()
      const txAmtMUR = toMUR(txRaw, tx.devise, rates)
      if (txRaw === 0) continue

      let bestFac: MatchingFacture | null = null
      let bestDiff = Infinity
      let bestDelay = 999

      for (const f of unpaidFactures) {
        if (usedFactureIds.has(f.id)) continue
        const fTTC = Number(f.montant_ttc) || 0
        const fMUR = Number(f.montant_mur) || 0
        const fDevise = (f.devise || 'MUR').toUpperCase()
        if (fTTC === 0 && fMUR === 0) continue

        // Smart comparison: same currency → compare raw amounts directly
        // Cross-currency → compare in MUR
        let diff: number
        if (txDevise === fDevise && fTTC > 0) {
          // Same currency (EUR vs EUR, MUR vs MUR) → compare directly
          diff = Math.abs(txRaw - fTTC) / fTTC
        } else if (fMUR > 0) {
          // Facture has MUR amount → compare in MUR
          diff = Math.abs(txAmtMUR - fMUR) / fMUR
        } else {
          // Cross-currency fallback → convert both to MUR
          const fAmtMUR = toMUR(fTTC, f.devise, rates)
          if (fAmtMUR === 0) continue
          diff = Math.abs(txAmtMUR - fAmtMUR) / fAmtMUR
        }

        if (diff > 0.08) continue // 8% tolerance (TDS + bank fees)

        const delay = daysBetween(f.date_facture || '', tx.date)

        // Préférer le match le plus proche en montant, puis en date
        if (diff < bestDiff || (diff === bestDiff && delay < bestDelay)) {
          bestDiff = diff
          bestDelay = delay
          bestFac = f
        }
      }

      if (bestFac) {
        const isExact = bestDiff < 0.005
        const looksLikeTDS = bestDiff >= 0.02 && bestDiff <= 0.06
        let confidence = 0.60
        if (isExact) confidence = 0.95
        else if (looksLikeTDS) confidence = 0.88
        else confidence = 0.75

        if (bestDelay <= 45) confidence += 0.03
        if (bestDelay > 120) confidence -= 0.08

        allMatches.push({
          supplierKey: profile.key,
          supplierName: profile.rawNames[0],
          transactionKey: txKey(tx),
          transaction: tx,
          factureIds: [bestFac.id],
          factures: [bestFac],
          strategy: isExact ? 'supplier_exact' : looksLikeTDS ? 'supplier_tds' : 'supplier_close',
          confidence: Math.min(0.98, Math.max(0, confidence)),
          reasoning: `Fournisseur "${profile.rawNames[0]}" — facture ${bestFac.numero_facture || ''} montant ${isExact ? 'exact' : `écart ${(bestDiff * 100).toFixed(1)}%`}${looksLikeTDS ? ' (probable TDS)' : ''}, délai ${bestDelay}j`,
          amountDiff: bestDiff * txRaw,
          phase: 'supplier_match',
        })
        usedFactureIds.add(bestFac.id)
        usedTxKeys.add(txKey(tx))
      }
    }

    // ── Strategy B: 1 paiement → N factures ──
    for (const tx of unmatchedTxs) {
      if (usedTxKeys.has(txKey(tx))) continue
      const txRawB = Math.max(tx.debit, tx.credit)
      const txDeviseB = (tx.devise || 'MUR').toUpperCase()
      const txAmtMURb = toMUR(txRawB, tx.devise, rates)
      if (txRawB === 0) continue

      const available = unpaidFactures.filter(f => !usedFactureIds.has(f.id))
      if (available.length < 2) continue

      // Trier par date
      const sortedFacs = [...available].sort((a, b) => (a.date_facture || '').localeCompare(b.date_facture || ''))

      const n = Math.min(sortedFacs.length, 8)
      let bestCombo: MatchingFacture[] | null = null
      let bestComboDiff = Infinity

      for (let mask = 3; mask < (1 << n); mask++) {
        let bits = 0
        for (let i = 0; i < n; i++) if (mask & (1 << i)) bits++
        if (bits < 2 || bits > 5) continue

        const subset: MatchingFacture[] = []
        let sum = 0
        let allSameCcy = true
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) {
            const f = sortedFacs[i]
            const fDevise = (f.devise || 'MUR').toUpperCase()
            // Same-currency sum when all factures share the tx currency
            if (fDevise === txDeviseB && Number(f.montant_ttc) > 0) {
              sum += Number(f.montant_ttc)
            } else {
              allSameCcy = false
              sum += Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates)
            }
            subset.push(f)
          }
        }
        if (sum === 0) continue
        const compareAmt = allSameCcy ? txRawB : txAmtMURb
        const diff = Math.abs(compareAmt - sum) / sum
        if (diff > 0.08) continue

        // Vérifier que les factures sont dans une période raisonnable (même trimestre)
        const months = subset.map(f => f.date_facture?.substring(0, 7) || '')
        const uniqueMonths = new Set(months.filter(Boolean))
        const spanMonths = uniqueMonths.size > 0
          ? monthDiff(
              [...uniqueMonths].sort()[0] + '-01',
              [...uniqueMonths].sort().pop()! + '-01'
            )
          : 0

        // Bonus si toutes dans le même trimestre
        const periodBonus = spanMonths <= 3 ? 0.05 : 0

        if (diff < bestComboDiff) {
          bestComboDiff = diff
          bestCombo = subset
        }
      }

      if (bestCombo && bestComboDiff < 0.08) {
        const looksLikeTDS = bestComboDiff >= 0.02 && bestComboDiff <= 0.06
        let confidence = 0.82
        if (bestComboDiff < 0.005) confidence = 0.94
        if (looksLikeTDS) confidence += 0.05

        allMatches.push({
          supplierKey: profile.key,
          supplierName: profile.rawNames[0],
          transactionKey: txKey(tx),
          transaction: tx,
          factureIds: bestCombo.map(f => f.id),
          factures: bestCombo,
          strategy: 'supplier_multi_facture',
          confidence: Math.min(0.96, confidence),
          reasoning: `${bestCombo.length} factures de "${profile.rawNames[0]}" → total ${bestComboDiff < 0.005 ? 'exact' : `écart ${(bestComboDiff * 100).toFixed(1)}%`}${looksLikeTDS ? ' (probable TDS)' : ''}`,
          amountDiff: bestComboDiff * txRawB,
          phase: 'supplier_match',
        })
        for (const f of bestCombo) usedFactureIds.add(f.id)
        usedTxKeys.add(txKey(tx))
      }
    }

    // ── Strategy C: N paiements → 1 facture (acomptes successifs) ──
    for (const f of unpaidFactures) {
      if (usedFactureIds.has(f.id)) continue
      const fDeviseC = (f.devise || 'MUR').toUpperCase()
      const fRaw = Number(f.montant_ttc) || 0
      const fAmt = Number(f.montant_mur) || toMUR(fRaw, f.devise, rates)
      if (fAmt === 0 && fRaw === 0) continue

      const availableTxs = unmatchedTxs.filter(t => !usedTxKeys.has(txKey(t)))
      if (availableTxs.length < 2) continue

      // Chercher des paiements dont la somme ≈ montant facture
      // Use same-currency when all transactions share the facture's currency
      const txsWithAmounts = availableTxs.map(t => {
        const tDevise = (t.devise || 'MUR').toUpperCase()
        const tRaw = Math.max(t.debit, t.credit)
        const amt = (tDevise === fDeviseC && fRaw > 0) ? tRaw : toMUR(tRaw, t.devise, rates)
        return { tx: t, amt }
      })
      const compareBase = txsWithAmounts.some(t => (t.tx.devise || 'MUR').toUpperCase() === fDeviseC) && fRaw > 0 ? fRaw : fAmt
      const filtered = txsWithAmounts.filter(t => t.amt > 0 && t.amt < compareBase)

      const m = Math.min(filtered.length, 6)
      let bestCombo: typeof txsWithAmounts | null = null
      let bestDiff = Infinity

      for (let mask = 3; mask < (1 << m); mask++) {
        let bits = 0
        for (let i = 0; i < m; i++) if (mask & (1 << i)) bits++
        if (bits < 2 || bits > 5) continue

        const subset = []
        let sum = 0
        for (let i = 0; i < m; i++) {
          if (mask & (1 << i)) {
            subset.push(filtered[i])
            sum += filtered[i].amt
          }
        }
        const diff = Math.abs(compareBase - sum) / compareBase
        if (diff > 0.05 || diff >= bestDiff) continue
        bestDiff = diff
        bestCombo = subset
      }

      if (bestCombo) {
        // Create a match for the first tx, noting that it covers partial
        for (const item of bestCombo) {
          allMatches.push({
            supplierKey: profile.key,
            supplierName: profile.rawNames[0],
            transactionKey: txKey(item.tx),
            transaction: item.tx,
            factureIds: [f.id],
            factures: [f],
            strategy: 'supplier_acomptes',
            confidence: 0.78,
            reasoning: `Acompte ${bestCombo.length} paiements → facture ${f.numero_facture || ''} de "${profile.rawNames[0]}" (écart final ${(bestDiff * 100).toFixed(1)}%)`,
            amountDiff: item.amt,
            phase: 'supplier_match',
          })
          usedTxKeys.add(txKey(item.tx))
        }
        usedFactureIds.add(f.id)
      }
    }
  }

  return allMatches
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3 — Classifications automatiques
// ═══════════════════════════════════════════════════════════════

const BANK_FEE_PATTERNS = [
  'service fee', 'banking subs fee', 'merchant monthly fee', 'payment fee',
  'outward transfer charge', 'tax amount due', 'card repayment', 'merchant discount',
  'merchant settlement', 'e-commerce transaction fee', 'contra entry', 'commission',
  'frais', 'bank charge', 'monthly fee', 'annual fee', 'interest charge',
  'stamp duty', 'account maintenance', 'facility fee', 'swift charge',
]

const SALARY_PATTERNS = [
  'bulk payment', 'salary', 'salaire', 'bonus', 'overtime', 'personnel',
  'paie', 'payroll', 'indemnite', 'wage',
]

const MRA_PATTERNS = [
  'mauritius revenue', 'mauritius revenue authority',
]

// Separate pattern for CSG/NSF — only match on TIERS, not libellé
const CSG_TIERS_PATTERNS = [
  'csg', 'nsf', 'nps', 'national savings', 'national pension',
  'income tax', 'paye',
]

const INTERNAL_PATTERNS = [
  'own account transfer', 'ib own account',
  'virement interne', 'internal transfer',
]
// NOTE: 'ib account transfer' REMOVED — at MCB it means inter-bank transfer
// (payment to another company), NOT internal transfer between own accounts.

export function autoClassify(
  transactions: MatchingTransaction[],
  matchedTxKeys: Set<string>,
  context: {
    societeNames: string[]
    selfNames?: string[]
    bulletins?: Array<{ periode: string; salaire_net: number }>
    ecritures?: Array<{ id: string; compte: string; debit: number; credit: number; libelle: string }>
    aliasMap?: Map<string, string>
  }
): AutoClassification[] {
  const results: AutoClassification[] = []

  for (const tx of transactions) {
    if (matchedTxKeys.has(txKey(tx))) continue
    const txAmt = Math.max(tx.debit, tx.credit)
    if (txAmt === 0) continue

    const lib = (tx.libelle || '').toLowerCase()
    const tiers = (tx.tiers_detecte || '').toLowerCase()

    // ── Virements internes ──
    // ULTRA-STRICT: un virement interne = UNIQUEMENT quand le TIERS est la société ELLE-MÊME
    // PAS les sociétés liées du même groupe (interco = paiement, pas interne)
    const selfNamesRaw = context.selfNames || context.societeNames
    const selfNamesNorm = selfNamesRaw.map(n => n.replace(/\b(ltd|limited|sarl|sa|co)\b\.?/gi, '').replace(/\s+/g, ' ').trim()).filter(n => n.length > 3)
    const tiersNorm = tiers.replace(/\b(ltd|limited|sarl|sa|co)\b\.?/gi, '').replace(/\s+/g, ' ').trim()

    // Match intelligent: tous les mots de self dans tiers, aucun mot extra dans tiers
    function isSelfMatchEngine(selfName: string, tiersName: string): boolean {
      const selfWords = selfName.split(/\s+/).filter(w => w.length > 2)
      const tiersWords = tiersName.split(/\s+/).filter(w => w.length > 2)
      if (selfWords.length === 0 || tiersWords.length === 0) return false
      const matchedSelf = selfWords.filter(sw => tiersWords.some(tw => tw.startsWith(sw.substring(0, 3)) || sw.startsWith(tw.substring(0, 3))))
      if (matchedSelf.length < selfWords.length * 0.7) return false
      const unmatchedTiers = tiersWords.filter(tw => !selfWords.some(sw => tw.startsWith(sw.substring(0, 3)) || sw.startsWith(tw.substring(0, 3))))
      return unmatchedTiers.length === 0
    }

    const isInternalByPattern = INTERNAL_PATTERNS.some(p => lib.includes(p)) && selfNamesNorm.some(n => isSelfMatchEngine(n, tiersNorm))
    const isInternalByName = false // Désactivé — trop de faux positifs avec societeNames du groupe
    const isInternalByAlias = (() => {
      const am = context.aliasMap || new Map()
      const candidates = [tx.tiers_detecte || '']
      for (const candidate of candidates) {
        const bankAlias = resolveAlias(candidate, am)
        if (!bankAlias) continue
        if (selfNamesNorm.some((socName: string) => {
          const socAlias = resolveAlias(socName, am)
          return socAlias === bankAlias
        })) return true
      }
      return false
    })()

    if (isInternalByPattern || isInternalByName || isInternalByAlias) {
      console.log(`[autoClassify] INTERNE: tiers="${tiers}" lib="${lib.substring(0,40)}" pattern=${isInternalByPattern} name=${isInternalByName} alias=${isInternalByAlias} selfNames=[${selfNamesNorm.join(',')}]`)
      results.push({
        transactionKey: txKey(tx), transaction: tx,
        type: 'transfert_interne',
        note: `Virement interne détecté${isInternalByAlias ? ' (alias)' : ''}`,
        confidence: 0.95,
      })
      matchedTxKeys.add(txKey(tx))
      continue
    }

    // ── Frais bancaires ──
    if (BANK_FEE_PATTERNS.some(p => lib.includes(p))) {
      let ecritureId: string | undefined
      if (context.ecritures) {
        const fee = context.ecritures.find(e =>
          e.compte?.startsWith('627') &&
          Math.abs((e.debit || 0) - tx.debit) / Math.max(tx.debit, 1) < 0.15
        )
        if (fee) ecritureId = fee.id
      }
      results.push({
        transactionKey: txKey(tx), transaction: tx,
        type: 'frais_bancaires', note: `Frais bancaires — ${lib.substring(0, 60)}`,
        ecritureId, confidence: 0.92,
      })
      matchedTxKeys.add(txKey(tx))
      continue
    }

    // Détection personne physique (MR/MRS/MISS) — utilisé par salaires ET CSG
    const looksLikePerson = /\b(mr|mrs|miss|mme|monsieur|madame)\b/i.test(tiers + ' ' + lib)

    // ── Salaires ──
    // Aussi classer comme salaire si le tiers est une personne (MR/MRS/MISS)
    // et que le montant est un débit (paiement sortant vers une personne)
    const isSalaryByPattern = SALARY_PATTERNS.some(p => lib.includes(p) || tiers.includes(p))
    const isSalaryByPerson = looksLikePerson && tx.debit > 0 && !isMRA
    if (isSalaryByPattern || isSalaryByPerson) {
      let note = 'Salaire / paie'
      let confidence = 0.85

      if (lib.includes('bulk payment') || lib.includes('payroll')) {
        // Vérifier contre la masse salariale du mois
        const txMonth = tx.date?.substring(0, 7) || ''
        if (txMonth && context.bulletins) {
          const monthBulletins = context.bulletins.filter(b => b.periode?.startsWith(txMonth))
          const sumNet = monthBulletins.reduce((s, b) => s + (b.salaire_net || 0), 0)
          if (sumNet > 0 && Math.abs(tx.debit - sumNet) / sumNet < 0.05) {
            note = `Masse salariale ${txMonth} — vérifié (${monthBulletins.length} bulletins, total ${sumNet.toFixed(0)} MUR)`
            confidence = 0.97
          } else {
            note = `Masse salariale ${txMonth} — non vérifié (bulletins: ${sumNet.toFixed(0)}, banque: ${tx.debit.toFixed(0)})`
            confidence = 0.80
          }
        }
        results.push({
          transactionKey: txKey(tx), transaction: tx,
          type: 'salaire_bulk', note, confidence,
        })
      } else {
        results.push({
          transactionKey: txKey(tx), transaction: tx,
          type: 'salaire_individuel', note: `Salaire individuel — ${tiers || lib.substring(0, 50)}`,
          confidence: 0.82,
        })
      }
      matchedTxKeys.add(txKey(tx))
      continue
    }

    // ── Reversals de salaires ──
    if (/reversal|salary proceeds|salary reversal|bulk.*reversal/.test(lib)) {
      results.push({
        transactionKey: txKey(tx), transaction: tx,
        type: 'reversal_salaire', note: 'Reversal virement salaire',
        confidence: 0.90,
      })
      matchedTxKeys.add(txKey(tx))
      continue
    }

    // ── MRA / Charges sociales ──
    // STRICT: MRA only matches on tiers containing "mauritius revenue"
    // CSG/NSF only matches on tiers (not libellé — too many false positives)
    // GARDE-FOU : si le tiers contient un nom de personne (MR/MRS/MISS + prénom + nom),
    // c'est probablement un salaire ou un CCA, PAS une charge sociale.
    // Les vrais paiements CSG/NSF vont vers des ORGANISMES, pas des personnes.
    const isMRA = MRA_PATTERNS.some(p => tiers.includes(p))
    const isCSG = !looksLikePerson && CSG_TIERS_PATTERNS.some(p => tiers.includes(p))
    if (isMRA || isCSG) {
      let ecritureId: string | undefined
      let note = 'Paiement MRA / charges sociales'

      if (context.ecritures) {
        const mraEcr = context.ecritures.find(e => {
          if (!e.compte?.match(/^(444|431|432|4457|447)/)) return false
          const eAmt = (e.credit || 0) || (e.debit || 0)
          return eAmt > 0 && Math.abs(tx.debit - eAmt) / eAmt < 0.10
        })
        if (mraEcr) {
          ecritureId = mraEcr.id
          note = `Paiement MRA — compte ${mraEcr.compte} — ${mraEcr.libelle || ''}`
        }
      }

      const isCsg = /csg|nsf|nps|national savings|national pension/.test(lib + tiers)
      results.push({
        transactionKey: txKey(tx), transaction: tx,
        type: isCsg ? 'charges_sociales' : 'paiement_mra',
        note, ecritureId, confidence: ecritureId ? 0.93 : 0.85,
      })
      matchedTxKeys.add(txKey(tx))
      continue
    }
  }

  return results
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4 — Consolidation : exécuter les 3 phases et agréger
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// PHASE 2.5 — Fallback : match par montant seul (sans alias)
// ═══════════════════════════════════════════════════════════════
// Un comptable humain regarde un relevé et une liste de factures.
// Même s'il ne connaît pas le tiers, il voit :
//   - 1 tx de 50 000 MUR + 1 facture de 50 000 MUR → match évident
//   - 1 tx de 97 000 MUR + 2 factures de 50 000 + 47 000 → match groupé
//   - 1 tx de 48 500 MUR vs facture de 50 000 → probable TDS 3%
//
// Ce fallback reproduit cette logique. Il est PLUS PRUDENT que le match
// par alias (confidence plus basse, conditions plus strictes pour le
// multi-factures) parce qu'il n'a pas la garantie du tiers.

function matchByAmountFallback(
  unmatchedTxs: MatchingTransaction[],
  unpaidFactures: MatchingFacture[],
  rates?: Record<string, number>,
): IntermediateMatch[] {
  const matches: IntermediateMatch[] = []
  const usedTxKeys = new Set<string>()
  const usedFactureIds = new Set<string>()

  // ── Passe 1 : 1 tx → 1 facture (match exact ou TDS) ──────────
  for (const tx of unmatchedTxs) {
    if (usedTxKeys.has(txKey(tx))) continue
    const txRaw = Math.max(tx.debit, tx.credit)
    if (txRaw === 0) continue
    const txDevise = (tx.devise || 'MUR').toUpperCase()
    const txAmtMUR = toMUR(txRaw, tx.devise, rates)

    // Collecter TOUS les candidats (pas juste le meilleur) pour évaluer l'ambiguïté
    const candidates: Array<{ f: MatchingFacture; diff: number; delay: number; tiersSim: number }> = []

    for (const f of unpaidFactures) {
      if (usedFactureIds.has(f.id)) continue
      const fTTC = Number(f.montant_ttc) || 0
      const fMUR = Number(f.montant_mur) || 0
      if (fTTC === 0 && fMUR === 0) continue
      const fDevise = (f.devise || 'MUR').toUpperCase()

      let diff: number
      if (txDevise === fDevise && fTTC > 0) {
        diff = Math.abs(txRaw - fTTC) / fTTC
      } else if (fMUR > 0) {
        diff = Math.abs(txAmtMUR - fMUR) / fMUR
      } else {
        const fAmtMUR = toMUR(fTTC, f.devise, rates)
        if (fAmtMUR === 0) continue
        diff = Math.abs(txAmtMUR - fAmtMUR) / fAmtMUR
      }

      // Tolérance 12% (plus souple que le match par alias à 8%)
      if (diff > 0.12) continue

      const delay = daysBetween(f.date_facture || '', tx.date)
      // Similarité textuelle entre tiers tx et tiers facture (bonus si noms proches)
      const tiersSim = advancedTiersScore(tx.tiers_detecte || tx.libelle || '', f.tiers || '')

      candidates.push({ f, diff, delay, tiersSim })
    }

    if (candidates.length === 0) continue

    // Trier : montant exact > TDS > reste ; puis tiers similaire > inconnu ; puis date
    candidates.sort((a, b) => {
      const diffBin = (d: number) => d < 0.005 ? 0 : d < 0.06 ? 1 : 2
      const da = diffBin(a.diff), db = diffBin(b.diff)
      if (da !== db) return da - db
      if (Math.abs(a.tiersSim - b.tiersSim) > 0.15) return b.tiersSim - a.tiersSim
      return a.delay - b.delay
    })

    const best = candidates[0]
    // Score d'ambiguïté : si 2+ factures ont un montant très proche, on baisse la confiance
    const closeCompetitors = candidates.filter(c => c !== best && Math.abs(c.diff - best.diff) < 0.02)
    const isAmbiguous = closeCompetitors.length > 0

    // Ne PAS matcher si ambiguïté ET pas de signal tiers fort
    if (isAmbiguous && best.tiersSim < 0.30) continue

    // RÈGLE FONDAMENTALE : si le tiers ne correspond PAS DU TOUT, on ne matche
    // PAS automatiquement, même si le montant est exact. Un montant de 213 EUR
    // peut correspondre à Google Cloud OU à un virement salaire — sans signal
    // tiers, c'est du hasard.
    // On SKIP complètement (même pas "proposé") si tiersSim = 0 et qu'il n'y a
    // aucun mot en commun entre la tx et la facture.
    if (best.tiersSim < 0.10) continue

    const isExact = best.diff < 0.005
    const isTDS = best.diff >= 0.02 && best.diff <= 0.06
    let confidence = 0.50
    if (isExact) confidence = 0.80
    else if (isTDS) confidence = 0.65
    else confidence = 0.50

    // Bonus tiers (texte proche) — le tiers est LE facteur déterminant
    if (best.tiersSim > 0.50) confidence += 0.15
    else if (best.tiersSim > 0.25) confidence += 0.08

    // Bonus date (même mois)
    if (best.delay <= 15) confidence += 0.05
    else if (best.delay <= 45) confidence += 0.02
    if (best.delay > 180) confidence -= 0.10

    // Pénalité ambiguïté
    if (isAmbiguous) confidence -= 0.15

    confidence = Math.min(0.95, Math.max(0.20, confidence))

    const tiersTx = (tx.tiers_detecte || tx.libelle || '').substring(0, 40)
    matches.push({
      supplierKey: `__fallback_${tiersTx}`,
      supplierName: tiersTx,
      transactionKey: txKey(tx),
      transaction: tx,
      factureIds: [best.f.id],
      factures: [best.f],
      strategy: isExact ? 'amount_exact' : isTDS ? 'amount_tds' : 'amount_close',
      confidence,
      reasoning: `Match par montant${isExact ? ' exact' : ` (écart ${(best.diff * 100).toFixed(1)}%)`}${isTDS ? ' (probable TDS)' : ''} — ${best.f.tiers || best.f.numero_facture || ''}, délai ${best.delay}j${best.tiersSim > 0.25 ? `, tiers similaire (${(best.tiersSim * 100).toFixed(0)}%)` : ''}${isAmbiguous ? ' ⚠ ambiguïté détectée' : ''}`,
      amountDiff: best.diff * txRaw,
      phase: 'supplier_match',
    })
    usedTxKeys.add(txKey(tx))
    usedFactureIds.add(best.f.id)
  }

  // ── Passe 2 : 1 tx → N factures MÊME FOURNISSEUR ─────────────
  // Cas Emtel / MyT / Mauritius Telecom : 5 factures mensuelles payées
  // en un seul virement. On regroupe d'abord par tiers similaire, puis
  // on vérifie si la somme colle au montant de la tx.
  for (const tx of unmatchedTxs) {
    if (usedTxKeys.has(txKey(tx))) continue
    const txRaw = Math.max(tx.debit, tx.credit)
    if (txRaw === 0) continue
    const txDevise = (tx.devise || 'MUR').toUpperCase()
    const txAmtMUR = toMUR(txRaw, tx.devise, rates)
    const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
    if (txTiers.length < 2) continue

    const available = unpaidFactures.filter(f => !usedFactureIds.has(f.id))
    if (available.length < 2) continue

    // Grouper les factures par tiers similaire à la tx
    const sameTiers = available.filter(f => {
      const sim = advancedTiersScore(txTiers, f.tiers || '')
      return sim > 0.25
    })
    if (sameTiers.length < 2) continue

    // Calculer la somme de toutes les factures du même tiers
    let totalFacs = 0
    const combo: MatchingFacture[] = []
    for (const f of sameTiers) {
      const fDevise = (f.devise || 'MUR').toUpperCase()
      const fAmt = (txDevise === fDevise && Number(f.montant_ttc) > 0)
        ? Number(f.montant_ttc)
        : (Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates))
      if (fAmt <= 0) continue
      totalFacs += fAmt
      combo.push(f)
    }

    const compareAmt = combo[0]?.devise?.toUpperCase() === txDevise ? txRaw : txAmtMUR
    const diff = totalFacs > 0 ? Math.abs(compareAmt - totalFacs) / totalFacs : 999

    // Tolérance 10% pour le regroupement fournisseur (TDS, frais, arrondis)
    if (diff > 0.10 || combo.length < 2) continue

    const isExact = diff < 0.005
    const tiersSim = advancedTiersScore(txTiers, combo[0]?.tiers || '')
    let confidence = 0.82
    if (isExact) confidence = 0.93
    if (tiersSim > 0.50) confidence += 0.05
    if (combo.length > 6) confidence -= 0.05

    matches.push({
      supplierKey: `__fallback_group_${txTiers.substring(0, 30)}`,
      supplierName: combo[0]?.tiers || txTiers,
      transactionKey: txKey(tx),
      transaction: tx,
      factureIds: combo.map(f => f.id),
      factures: [...combo],
      strategy: 'amount_same_supplier_group',
      confidence: Math.min(0.95, Math.max(0.50, confidence)),
      reasoning: `${combo.length} factures "${combo[0]?.tiers || '?'}" → total ${isExact ? 'exact' : `écart ${(diff * 100).toFixed(1)}%`}`,
      amountDiff: diff * compareAmt,
      phase: 'supplier_match',
    })
    for (const f of combo) usedFactureIds.add(f.id)
    usedTxKeys.add(txKey(tx))
  }

  // ── Passe 3 : 1 tx → N factures (greedy cross-supplier) ──────
  for (const tx of unmatchedTxs) {
    if (usedTxKeys.has(txKey(tx))) continue
    const txRaw = Math.max(tx.debit, tx.credit)
    if (txRaw === 0) continue
    const txDevise = (tx.devise || 'MUR').toUpperCase()
    const txAmtMUR = toMUR(txRaw, tx.devise, rates)

    const available = unpaidFactures.filter(f => !usedFactureIds.has(f.id))
    if (available.length < 2) continue

    // Stratégie greedy : on accumule les factures les plus proches en montant
    // jusqu'à atteindre le montant de la tx (±8%), trié par montant décroissant.
    // Plus rapide que le bruteforce combinatoire, et plus réaliste : un comptable
    // regroupe naturellement les grosses factures d'abord.
    const sortedByAmount = [...available]
      .map(f => {
        const fDevise = (f.devise || 'MUR').toUpperCase()
        const fAmt = (txDevise === fDevise && Number(f.montant_ttc) > 0)
          ? Number(f.montant_ttc)
          : (Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise, rates))
        return { f, amt: fAmt }
      })
      .filter(({ amt }) => amt > 0 && amt <= txRaw * 1.02) // exclure les factures > tx
      .sort((a, b) => b.amt - a.amt)

    const compareAmt = sortedByAmount[0]?.f.devise?.toUpperCase() === txDevise ? txRaw : txAmtMUR
    let runningSum = 0
    const combo: MatchingFacture[] = []

    for (const { f, amt } of sortedByAmount) {
      if (combo.length >= 10) break // max 10 factures
      if (runningSum + amt > compareAmt * 1.08) continue // dépasse le tx
      combo.push(f)
      runningSum += amt
      const diff = Math.abs(compareAmt - runningSum) / compareAmt
      if (diff < 0.08) {
        // Match trouvé
        const isExact = diff < 0.005
        let confidence = combo.length <= 3 ? 0.80 : 0.70
        if (isExact) confidence += 0.10
        if (combo.length > 5) confidence -= 0.10

        const tiersTx = (tx.tiers_detecte || tx.libelle || '').substring(0, 40)
        matches.push({
          supplierKey: `__fallback_multi_${tiersTx}`,
          supplierName: tiersTx,
          transactionKey: txKey(tx),
          transaction: tx,
          factureIds: combo.map(f2 => f2.id),
          factures: [...combo],
          strategy: 'amount_multi_facture',
          confidence: Math.min(0.92, Math.max(0.40, confidence)),
          reasoning: `${combo.length} factures → total ${isExact ? 'exact' : `écart ${(diff * 100).toFixed(1)}%`}`,
          amountDiff: diff * compareAmt,
          phase: 'supplier_match',
        })
        for (const f2 of combo) usedFactureIds.add(f2.id)
        usedTxKeys.add(txKey(tx))
        break
      }
    }
  }

  console.log(`[intelligent/fallback] ${matches.length} matches trouvés sans alias (${matches.filter(m => m.strategy === 'amount_exact').length} exact, ${matches.filter(m => m.strategy === 'amount_tds').length} TDS, ${matches.filter(m => m.strategy === 'amount_close').length} close, ${matches.filter(m => m.strategy === 'amount_multi_facture').length} multi-factures)`)
  return matches
}

export function runIntelligentRapprochement(
  transactions: MatchingTransaction[],
  factures: MatchingFacture[],
  context: {
    societeNames: string[]
    selfNames?: string[]
    bulletins?: Array<{ periode: string; salaire_net: number }>
    ecritures?: Array<{ id: string; compte: string; debit: number; credit: number; libelle: string }>
    rates?: Record<string, number>
    /** Loaded from supplier_aliases table — alias→canonical map */
    aliasMap?: Map<string, string>
  }
): IntelligentResult {
  const aliasMap = context.aliasMap || new Map()

  // Phase 1: Build supplier registry (with alias-aware grouping)
  const registry = buildSupplierRegistry(factures, transactions, aliasMap)

  // Debug: log supplier profiles with both factures AND transactions
  for (const [key, profile] of registry) {
    if (profile.factures.length > 0 && profile.transactions.length > 0) {
      console.log(`[intelligent] Supplier "${key}" (${profile.rawNames.join(', ')}): ${profile.factures.length} factures, ${profile.transactions.length} transactions`)
    } else if (profile.transactions.length > 0 && profile.factures.length === 0) {
      console.log(`[intelligent] Supplier "${key}" has ${profile.transactions.length} bank tx but 0 factures — no match possible`)
    }
  }

  // Phase 2: Match by supplier (alias-aware)
  const supplierMatches = matchBySupplier(registry, context.rates, aliasMap)
  const matchedTxKeys = new Set(supplierMatches.map(m => m.transactionKey))
  const matchedFactureIds = new Set(supplierMatches.flatMap(m => m.factureIds))

  // Phase 2.5: Fallback — match par montant seul (sans alias) pour les tx orphelines.
  // Se comporte "comme un humain" : si une tx de 10 000 MUR correspond à une seule
  // facture de 10 000 MUR et qu'il n'y a aucune ambiguïté, on matche même sans alias.
  // Supporte aussi le multi-factures (1 tx = somme de N factures).
  const fallbackMatches = matchByAmountFallback(
    transactions.filter(t => !matchedTxKeys.has(txKey(t))),
    factures.filter(f => !matchedFactureIds.has(f.id)),
    context.rates,
  )
  for (const m of fallbackMatches) {
    matchedTxKeys.add(m.transactionKey)
    for (const fid of m.factureIds) matchedFactureIds.add(fid)
  }
  const allMatches = [...supplierMatches, ...fallbackMatches]

  // Phase 3: Auto-classify remaining (with alias-aware internal detection)
  const classifications = autoClassify(transactions, matchedTxKeys, {
    ...context,
    aliasMap,
  })

  // Stats
  const byStrategy: Record<string, number> = {}
  for (const m of allMatches) {
    byStrategy[m.strategy] = (byStrategy[m.strategy] || 0) + 1
  }
  for (const c of classifications) {
    byStrategy[c.type] = (byStrategy[c.type] || 0) + 1
  }

  const totalTx = transactions.length
  const matched = supplierMatches.length
  const classified = classifications.length
  const identified = matched + classified

  return {
    matches: allMatches.sort((a, b) => b.confidence - a.confidence),
    classifications,
    supplierProfiles: [...registry.values()].filter(p => p.transactions.length > 0),
    stats: {
      totalTransactions: totalTx,
      identified,
      matched,
      classified,
      remaining: totalTx - identified,
      byStrategy,
    },
  }
}
