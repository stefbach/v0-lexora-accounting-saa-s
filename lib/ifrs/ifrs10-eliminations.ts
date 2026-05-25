/**
 * lib/ifrs/ifrs10-eliminations.ts
 * --------------------------------------------------------------------
 * IFRS 10 §B86 — Élimination des transactions intra-groupe (V1).
 *
 * Ce module est la « tête » fonctionnelle du moteur de consolidation
 * GBC : il prend en entrée la balance brute agrégée du périmètre (telle
 * que retournée par la RPC `consolidate_aggregate`) plus les écritures
 * détaillées de chaque société du périmètre, détecte les paires
 * miroir intra-groupe et produit :
 *
 *   1) Une liste d'éliminations à matérialiser dans
 *      `public.consolidation_eliminations` (cf. mig 254).
 *   2) Une liste de paires détectées à matérialiser dans
 *      `public.intercompany_eliminations` (cf. mig 417, audit trail).
 *   3) Une fonction `applyEliminations()` qui décrémente la balance
 *      agrégée pour produire la balance consolidée IFRS 10.
 *
 * Référence audit : docs/audit-partials/wave2-E-ifrs10-conso.md.
 * Le mapping `elimination_type → comptes ciblés` y est documenté.
 * --------------------------------------------------------------------
 */

// ─────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────

/** Description minimale d'une société du périmètre. */
export interface Societe {
  id: string
  nom: string
  /** ISO-4217 (ex : 'MUR', 'USD'). */
  devise_fonctionnelle?: string | null
  /** Pour info — domestic / gbc1 / authorised_company / holding. */
  regime?: string | null
}

/**
 * Écriture comptable agrégée à la maille « société × compte × jour »,
 * suffisante pour détecter des paires miroir. On suppose les montants
 * déjà translatés en MUR par `ecritures_comptables_v2`.
 */
export interface IntraEcriture {
  id?: string | null
  societe_id: string
  /** Contrepartie déclarée (id de la société tiers, si tracée). */
  contrepartie_societe_id?: string | null
  numero_compte: string
  /** Libellé court — utilisé en heuristique de matching. */
  libelle?: string | null
  debit_mur: number
  credit_mur: number
  /** ISO-8601 (YYYY-MM-DD). */
  date_ecriture: string
}

/** Ligne d'un agrégat consolidé. */
export interface AggregateRow {
  numero_compte: string
  total_debit_mur: number
  total_credit_mur: number
  contributing_societes: string[]
}

/** Une paire d'écritures miroir détectée par detectIntercompanyTransactions. */
export interface IntercompanyMatch {
  detection_type:
    | 'mirror_sale_purchase'
    | 'mirror_ar_ap'
    | 'mirror_intercompany_loan'
    | 'mirror_dividend'
    | 'unrealized_profit_stock'
  from_societe_id: string
  to_societe_id: string
  from_ecriture_id?: string | null
  to_ecriture_id?: string | null
  from_numero_compte: string
  to_numero_compte: string
  amount_mur: number
  match_confidence: number
  match_method:
    | 'exact_amount_date'
    | 'exact_amount_period'
    | 'partial_amount'
    | 'manual'
  /** Type d'élimination IFRS 10 à générer (cf. mig 254). */
  proposed_elimination_type:
    | 'intra_revenue'
    | 'intra_cogs'
    | 'intra_ar_ap'
    | 'intra_loan'
    | 'intra_dividend'
    | 'unrealized_profit_stock'
}

/** Élimination matérialisable (compatible avec consolidation_eliminations). */
export interface EliminationRecord {
  elimination_type: IntercompanyMatch['proposed_elimination_type']
  from_societe_id: string
  to_societe_id: string
  amount_mur: number
  description: string
  source_ecriture_ids: string[]
}

/** Stock pour le calcul du profit non réalisé. */
export interface StockSnapshot {
  societe_id: string
  /** Coût d'achat dans les livres de la société qui détient le stock. */
  cout_unitaire_mur: number
  /** Coût normal hors marge intra (référence vendeur). */
  cout_unitaire_groupe_mur: number
  quantite_en_stock: number
  /** Société du groupe qui a vendu ce stock (= source de la marge interne). */
  source_societe_id: string
}

// ─────────────────────────────────────────────────────────────────────
// Constantes — mapping IFRS 10 §B86
// ─────────────────────────────────────────────────────────────────────

/**
 * Pour chaque `elimination_type`, préfixes de comptes PCM Maurice à
 * impacter. Les préfixes sont triés du plus spécifique au plus général
 * pour que l'algorithme « peel-off » privilégie d'abord les comptes
 * précis (411VENTE-INTRA) avant les comptes parents (411, 41).
 */
const ELIMINATION_RULES: Record<
  IntercompanyMatch['proposed_elimination_type'],
  { reduces_credit_on: string[]; reduces_debit_on: string[] }
> = {
  // Vente intra : on annule un produit (cl 7, sens crédit) ET la
  // charge symétrique (cl 6, sens débit).
  intra_revenue: {
    reduces_credit_on: ['706', '707', '708', '70', '7'],
    reduces_debit_on: ['601', '604', '607', '60', '6'],
  },
  // Refacture de management fees / charges intra (symétrique de intra_revenue).
  intra_cogs: {
    reduces_credit_on: ['706', '708', '70', '7'],
    reduces_debit_on: ['622', '621', '62', '60', '6'],
  },
  // Créance ↔ dette croisées (411 vs 401).
  intra_ar_ap: {
    reduces_debit_on: ['411', '41'],
    reduces_credit_on: ['401', '40'],
  },
  // Prêts intra-groupe (compte courant) : 451/451 ou 16x/26x.
  intra_loan: {
    reduces_debit_on: ['267', '26', '451', '45', '16'],
    reduces_credit_on: ['168', '16', '451', '45', '26'],
  },
  // Dividendes reçus d'une filiale du groupe.
  intra_dividend: {
    reduces_credit_on: ['7611', '761', '76'],
    reduces_debit_on: ['1061', '106', '12'],
  },
  // Profit interne dans le stock : on réduit la valeur de stock ET le
  // résultat (par les produits).
  unrealized_profit_stock: {
    reduces_credit_on: ['706', '70', '7'],
    reduces_debit_on: ['31', '32', '3'],
  },
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const PRODUIT_PREFIXES = ['7']
const CHARGE_PREFIXES = ['6']
const CREANCE_CLIENT_PREFIXES = ['411', '41']
const DETTE_FOURNI_PREFIXES = ['401', '40']
const PRET_PREFIXES = ['267', '451', '16', '26']
const DIVIDENDE_PRODUIT_PREFIXES = ['7611', '761']

function startsWithAny(numero: string, prefixes: string[]): boolean {
  for (const p of prefixes) if (numero.startsWith(p)) return true
  return false
}

function diffDays(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.abs(Math.floor((da - db) / 86_400_000))
}

function eq(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= tol
}

function classifyAccount(numero: string):
  | 'produit'
  | 'charge'
  | 'creance_client'
  | 'dette_fourni'
  | 'pret'
  | 'dividende_produit'
  | 'stock'
  | 'other' {
  if (startsWithAny(numero, DIVIDENDE_PRODUIT_PREFIXES)) return 'dividende_produit'
  if (startsWithAny(numero, PRODUIT_PREFIXES)) return 'produit'
  if (startsWithAny(numero, CHARGE_PREFIXES)) return 'charge'
  if (startsWithAny(numero, CREANCE_CLIENT_PREFIXES)) return 'creance_client'
  if (startsWithAny(numero, DETTE_FOURNI_PREFIXES)) return 'dette_fourni'
  if (startsWithAny(numero, PRET_PREFIXES)) return 'pret'
  if (numero.startsWith('3')) return 'stock'
  return 'other'
}

// ─────────────────────────────────────────────────────────────────────
// detectIntercompanyTransactions
// ─────────────────────────────────────────────────────────────────────

/**
 * Détecte les paires miroir entre toutes les sociétés du périmètre.
 *
 * Heuristique :
 *   - Pour chaque écriture débit d'une société A référencée
 *     contrepartie B, on cherche dans B une écriture crédit miroir
 *     (même montant ± 1 ct, même date ± 2 j, comptes compatibles).
 *   - À défaut de contrepartie explicite, on tente le même match sur
 *     l'ensemble des sociétés du périmètre, à montant exact.
 *
 * Retourne la liste brute des matches. C'est `eliminateRevenues` /
 * `eliminateBalances` qui transforment ensuite ces matches en
 * `EliminationRecord`.
 *
 * Complexité : O(N · M) où N = écritures de la société émettrice et
 * M = candidats de la société réceptrice (filtrés par jour).
 */
export function detectIntercompanyTransactions(
  societes: Societe[],
  ecritures: IntraEcriture[],
): IntercompanyMatch[] {
  const ids = new Set(societes.map((s) => s.id))
  // Index : societe_id → liste d'écritures
  const bySoc = new Map<string, IntraEcriture[]>()
  for (const e of ecritures) {
    if (!ids.has(e.societe_id)) continue
    const arr = bySoc.get(e.societe_id) || []
    arr.push(e)
    bySoc.set(e.societe_id, arr)
  }

  const used = new Set<string>() // identifiants (id||synthetic) d'écritures déjà appariées
  const matches: IntercompanyMatch[] = []

  const keyOf = (e: IntraEcriture, idx: number) =>
    e.id || `${e.societe_id}|${e.numero_compte}|${e.date_ecriture}|${idx}`

  // Index plat pour énumération stable
  const flat: { e: IntraEcriture; key: string }[] = []
  let i = 0
  for (const arr of bySoc.values())
    for (const e of arr) flat.push({ e, key: keyOf(e, i++) })

  for (const { e, key } of flat) {
    if (used.has(key)) continue

    const fromClass = classifyAccount(e.numero_compte)
    // On considère les "émetteurs" : produits (vente), créances (411),
    // prêts (actif 26/45), dividendes reçus (76).
    const isEmitter =
      (fromClass === 'produit' && e.credit_mur > 0) ||
      (fromClass === 'creance_client' && e.debit_mur > 0) ||
      (fromClass === 'pret' && e.debit_mur > 0) ||
      (fromClass === 'dividende_produit' && e.credit_mur > 0)
    if (!isEmitter) continue

    const amount = e.credit_mur > 0 ? e.credit_mur : e.debit_mur

    // Candidats : sociétés du périmètre ≠ e.societe_id
    const candidates = flat.filter(
      (c) =>
        !used.has(c.key) &&
        c.e.societe_id !== e.societe_id &&
        (e.contrepartie_societe_id ? c.e.societe_id === e.contrepartie_societe_id : true),
    )

    // Score chaque candidat
    let best: { c: typeof candidates[number]; score: number; method: IntercompanyMatch['match_method'] } | null = null
    for (const c of candidates) {
      const toClass = classifyAccount(c.e.numero_compte)
      // Compatibilité paire émetteur/récepteur
      const ok =
        (fromClass === 'produit' && toClass === 'charge' && c.e.debit_mur > 0) ||
        (fromClass === 'creance_client' && toClass === 'dette_fourni' && c.e.credit_mur > 0) ||
        (fromClass === 'pret' && toClass === 'pret' && c.e.credit_mur > 0) ||
        (fromClass === 'dividende_produit' && (toClass === 'other' || toClass === 'stock') && c.e.debit_mur > 0)
      if (!ok) continue
      const cAmt = c.e.debit_mur > 0 ? c.e.debit_mur : c.e.credit_mur
      if (!eq(cAmt, amount)) continue

      const days = diffDays(e.date_ecriture, c.e.date_ecriture)
      let method: IntercompanyMatch['match_method'] = 'exact_amount_period'
      let score = 0.7
      if (days <= 2) {
        method = 'exact_amount_date'
        score = 0.95
      } else if (days <= 30) {
        score = 0.8
      }
      if (e.contrepartie_societe_id === c.e.societe_id) score += 0.05

      if (!best || score > best.score) best = { c, score, method }
    }

    if (!best) continue

    const toClass = classifyAccount(best.c.e.numero_compte)
    let detection: IntercompanyMatch['detection_type'] = 'mirror_sale_purchase'
    let proposed: IntercompanyMatch['proposed_elimination_type'] = 'intra_revenue'
    if (fromClass === 'creance_client') {
      detection = 'mirror_ar_ap'
      proposed = 'intra_ar_ap'
    } else if (fromClass === 'pret') {
      detection = 'mirror_intercompany_loan'
      proposed = 'intra_loan'
    } else if (fromClass === 'dividende_produit') {
      detection = 'mirror_dividend'
      proposed = 'intra_dividend'
    } else if (fromClass === 'produit') {
      detection = 'mirror_sale_purchase'
      proposed = 'intra_revenue'
    }
    void toClass

    matches.push({
      detection_type: detection,
      from_societe_id: e.societe_id,
      to_societe_id: best.c.e.societe_id,
      from_ecriture_id: e.id ?? null,
      to_ecriture_id: best.c.e.id ?? null,
      from_numero_compte: e.numero_compte,
      to_numero_compte: best.c.e.numero_compte,
      amount_mur: Number(amount.toFixed(2)),
      match_confidence: Math.min(best.score, 1),
      match_method: best.method,
      proposed_elimination_type: proposed,
    })
    used.add(key)
    used.add(best.c.key)
  }

  return matches
}

// ─────────────────────────────────────────────────────────────────────
// eliminateBalances / eliminateRevenues / eliminateUnrealizedProfits
// ─────────────────────────────────────────────────────────────────────

/**
 * Construit les `EliminationRecord` pour les créances/dettes croisées
 * (411 / 401). Une paire détectée `mirror_ar_ap` ⇒ 1 enregistrement.
 */
export function eliminateBalances(matches: IntercompanyMatch[]): EliminationRecord[] {
  return matches
    .filter((m) => m.detection_type === 'mirror_ar_ap')
    .map((m) => ({
      elimination_type: 'intra_ar_ap',
      from_societe_id: m.from_societe_id,
      to_societe_id: m.to_societe_id,
      amount_mur: m.amount_mur,
      description: `Élimination créance ${m.from_numero_compte} ↔ dette ${m.to_numero_compte}`,
      source_ecriture_ids: [m.from_ecriture_id, m.to_ecriture_id].filter(Boolean) as string[],
    }))
}

/**
 * Construit les `EliminationRecord` pour les produits/charges intra
 * (701 vs 601). Une paire `mirror_sale_purchase` ⇒ 1 enregistrement
 * `intra_revenue`. Les management fees sont reclassés `intra_cogs` si
 * le compte de charge est en 62x (services extérieurs).
 */
export function eliminateRevenues(matches: IntercompanyMatch[]): EliminationRecord[] {
  return matches
    .filter((m) => m.detection_type === 'mirror_sale_purchase')
    .map((m) => {
      const isMgmtFee = m.to_numero_compte.startsWith('62')
      return {
        elimination_type: isMgmtFee ? 'intra_cogs' : 'intra_revenue',
        from_societe_id: m.from_societe_id,
        to_societe_id: m.to_societe_id,
        amount_mur: m.amount_mur,
        description: isMgmtFee
          ? `Élimination refacture intra ${m.from_numero_compte}/${m.to_numero_compte}`
          : `Élimination vente intra ${m.from_numero_compte}/${m.to_numero_compte}`,
        source_ecriture_ids: [m.from_ecriture_id, m.to_ecriture_id].filter(Boolean) as string[],
      }
    })
}

/**
 * Calcule les profits non réalisés (PNR) sur stock détenu en fin de
 * période : si la société A a vendu à B avec marge, et que B détient
 * encore N unités en stock, on neutralise (cout_unitaire - cout_groupe)
 * × N. IFRS 10 §B86(c).
 *
 * @param stocks   - inventaire fin de période, déjà ventilé par source
 * @param intraSales - vente intra détectées (utilisé pour vérifier que
 *                    la marge à neutraliser est effectivement issue
 *                    d'une transaction intra-groupe de la période)
 */
export function eliminateUnrealizedProfits(
  stocks: StockSnapshot[],
  intraSales: IntercompanyMatch[],
): EliminationRecord[] {
  const intraPairs = new Set(
    intraSales
      .filter((m) => m.detection_type === 'mirror_sale_purchase')
      .map((m) => `${m.from_societe_id}->${m.to_societe_id}`),
  )

  const records: EliminationRecord[] = []
  for (const s of stocks) {
    const pairKey = `${s.source_societe_id}->${s.societe_id}`
    if (!intraPairs.has(pairKey)) continue
    const margePerUnit = Math.max(0, s.cout_unitaire_mur - s.cout_unitaire_groupe_mur)
    const pnr = margePerUnit * s.quantite_en_stock
    if (pnr <= 0.01) continue
    records.push({
      elimination_type: 'unrealized_profit_stock',
      from_societe_id: s.source_societe_id,
      to_societe_id: s.societe_id,
      amount_mur: Number(pnr.toFixed(2)),
      description:
        `PNR sur ${s.quantite_en_stock} unité(s) en stock chez la filiale ` +
        `(marge intra = ${margePerUnit.toFixed(2)} MUR/u)`,
      source_ecriture_ids: [],
    })
  }
  return records
}

// ─────────────────────────────────────────────────────────────────────
// applyEliminationsToAggregate — moteur de décrément
// ─────────────────────────────────────────────────────────────────────

/**
 * Applique une liste d'éliminations (matérialisées ou détectées) sur
 * un agrégat brut et retourne l'agrégat consolidé.
 *
 * Algorithme « peel-off » : pour chaque élimination, on décrémente le
 * solde des comptes éligibles (par préfixe), en partant des plus
 * spécifiques (plus longs) vers les plus généraux, et au sein d'un
 * même niveau de spécificité, du compte au solde le plus élevé.
 *
 * Garantit la non-régression sur entrée vide :
 *   applyEliminationsToAggregate(rows, []) ⇒ rows (clonés).
 */
export function applyEliminationsToAggregate(
  rows: AggregateRow[],
  eliminations: EliminationRecord[],
): AggregateRow[] {
  const map = new Map<string, AggregateRow>()
  for (const r of rows) {
    map.set(r.numero_compte, {
      numero_compte: r.numero_compte,
      total_debit_mur: Number(r.total_debit_mur) || 0,
      total_credit_mur: Number(r.total_credit_mur) || 0,
      contributing_societes: [...(r.contributing_societes || [])],
    })
  }

  const decrement = (
    prefixes: string[],
    side: 'debit' | 'credit',
    amount: number,
  ): number => {
    if (amount <= 0 || prefixes.length === 0) return 0
    // Tri : préfixes spécifiques d'abord (plus longs), puis comptes
    // avec le plus gros solde côté concerné.
    const sortedPrefixes = [...prefixes].sort((a, b) => b.length - a.length)
    let remaining = amount
    for (const pref of sortedPrefixes) {
      const candidates = [...map.values()]
        .filter((r) => r.numero_compte.startsWith(pref))
        .sort((a, b) =>
          side === 'debit'
            ? b.total_debit_mur - a.total_debit_mur
            : b.total_credit_mur - a.total_credit_mur,
        )
      for (const r of candidates) {
        const avail = side === 'debit' ? r.total_debit_mur : r.total_credit_mur
        if (avail <= 0) continue
        const take = Math.min(remaining, avail)
        if (side === 'debit') r.total_debit_mur -= take
        else r.total_credit_mur -= take
        remaining -= take
        if (remaining <= 0.005) return amount
      }
    }
    return amount - remaining
  }

  for (const elim of eliminations) {
    const rule = ELIMINATION_RULES[elim.elimination_type]
    if (!rule) continue
    const amt = Number(elim.amount_mur) || 0
    if (amt <= 0) continue
    // Un enregistrement = 1 ligne d'élimination en partie double :
    //   DR <reduces_credit_on> (annule un crédit)
    //   CR <reduces_debit_on>  (annule un débit)
    decrement(rule.reduces_credit_on, 'credit', amt)
    decrement(rule.reduces_debit_on, 'debit', amt)
  }

  return [...map.values()].sort((a, b) =>
    a.numero_compte.localeCompare(b.numero_compte),
  )
}

// ─────────────────────────────────────────────────────────────────────
// Orchestrateur de haut niveau
// ─────────────────────────────────────────────────────────────────────

/**
 * Pipeline complet :
 *   1) détection des paires miroir,
 *   2) génération des EliminationRecord (revenus + balances + PNR),
 *   3) application sur l'agrégat brut.
 *
 * Utilisé par `app/api/comptable/gbc/consolidate/route.ts`. Retourne
 * également les matches et records pour persistance / audit.
 */
export function runIfrs10Consolidation(params: {
  societes: Societe[]
  ecritures: IntraEcriture[]
  stocks?: StockSnapshot[]
  aggregate: AggregateRow[]
}): {
  matches: IntercompanyMatch[]
  eliminations: EliminationRecord[]
  aggregate_consolidated: AggregateRow[]
  consolidation_balanced: boolean
} {
  const matches = detectIntercompanyTransactions(params.societes, params.ecritures)
  const elimRevenues = eliminateRevenues(matches)
  const elimBalances = eliminateBalances(matches)
  const elimPnr = eliminateUnrealizedProfits(params.stocks || [], matches)
  const eliminations = [...elimRevenues, ...elimBalances, ...elimPnr]
  const aggregate_consolidated = applyEliminationsToAggregate(
    params.aggregate,
    eliminations,
  )
  const imbalance = aggregate_consolidated.reduce(
    (s, r) => s + r.total_debit_mur - r.total_credit_mur,
    0,
  )
  return {
    matches,
    eliminations,
    aggregate_consolidated,
    consolidation_balanced: Math.abs(imbalance) < 1,
  }
}
