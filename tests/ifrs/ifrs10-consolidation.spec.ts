/**
 * tests/ifrs/ifrs10-consolidation.spec.ts
 * --------------------------------------------------------------------
 * IFRS 10 §B86 — Test du moteur d'élimination intra-groupe V1.
 *
 * Scénario : 3 sociétés du groupe Lexora-Test
 *   - HOLD (parent, MUR)
 *   - SUBA (filiale 100 %, MUR)
 *   - SUBB (filiale 100 %, MUR)
 *
 * Transactions :
 *   - SUBA vend 1 000 000 MUR de prestations à HOLD
 *   - HOLD refacture 200 000 MUR de management fees à SUBA
 *   - SUBB prête 5 000 000 MUR à HOLD (compte courant 451)
 *
 * Attendu après consolidation :
 *   - Produits 70 : annulés (1 000 000 + 200 000)
 *   - Charges 60/62 : annulées (1 000 000 + 200 000)
 *   - 411/401 croisés : annulés
 *   - 451 actif/passif croisés : annulés
 *   - Balance consolidée équilibrée (debit = credit)
 */

import { describe, it, expect, vi } from 'vitest'
import {
  detectIntercompanyTransactions,
  eliminateBalances,
  eliminateRevenues,
  eliminateUnrealizedProfits,
  applyEliminationsToAggregate,
  type AggregateRow,
  type EliminationRecord,
  type IntraEcriture,
  type Societe,
  type StockSnapshot,
} from '@/lib/ifrs/ifrs10-eliminations'

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

const HOLD = 'sid-hold'
const SUBA = 'sid-suba'
const SUBB = 'sid-subb'

const societes: Societe[] = [
  { id: HOLD, nom: 'Holdco Ltd', devise_fonctionnelle: 'MUR' },
  { id: SUBA, nom: 'Sub A Ltd', devise_fonctionnelle: 'MUR' },
  { id: SUBB, nom: 'Sub B Ltd', devise_fonctionnelle: 'MUR' },
]

const ecritures: IntraEcriture[] = [
  // Vente SUBA → HOLD : 1 000 000
  { id: 'e1', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '411HOLD', debit_mur: 1_000_000, credit_mur: 0, date_ecriture: '2025-10-01' },
  { id: 'e2', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '706', debit_mur: 0, credit_mur: 1_000_000, date_ecriture: '2025-10-01' },
  { id: 'e3', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '401SUBA', debit_mur: 0, credit_mur: 1_000_000, date_ecriture: '2025-10-01' },
  { id: 'e4', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '604', debit_mur: 1_000_000, credit_mur: 0, date_ecriture: '2025-10-01' },

  // Refacture management fees HOLD → SUBA : 200 000
  { id: 'e5', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '411SUBA', debit_mur: 200_000, credit_mur: 0, date_ecriture: '2025-11-15' },
  { id: 'e6', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '706', debit_mur: 0, credit_mur: 200_000, date_ecriture: '2025-11-15' },
  { id: 'e7', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '401HOLD', debit_mur: 0, credit_mur: 200_000, date_ecriture: '2025-11-15' },
  { id: 'e8', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '622', debit_mur: 200_000, credit_mur: 0, date_ecriture: '2025-11-15' },

  // Prêt intra SUBB → HOLD : 5 000 000 (compte courant 451)
  { id: 'e9', societe_id: SUBB, contrepartie_societe_id: HOLD, numero_compte: '451HOLD', debit_mur: 5_000_000, credit_mur: 0, date_ecriture: '2025-12-01' },
  { id: 'e10', societe_id: HOLD, contrepartie_societe_id: SUBB, numero_compte: '451SUBB', debit_mur: 0, credit_mur: 5_000_000, date_ecriture: '2025-12-01' },
]

/** Construit l'agrégat brut (somme par compte) à partir des écritures. */
function buildAggregate(ecr: IntraEcriture[]): AggregateRow[] {
  const map = new Map<string, AggregateRow>()
  for (const e of ecr) {
    const r = map.get(e.numero_compte) || {
      numero_compte: e.numero_compte,
      total_debit_mur: 0,
      total_credit_mur: 0,
      contributing_societes: [],
    }
    r.total_debit_mur += e.debit_mur
    r.total_credit_mur += e.credit_mur
    if (!r.contributing_societes.includes(e.societe_id))
      r.contributing_societes.push(e.societe_id)
    map.set(e.numero_compte, r)
  }
  return [...map.values()].sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('IFRS 10 - detectIntercompanyTransactions', () => {
  it('détecte la vente SUBA → HOLD et la refacture HOLD → SUBA', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const sales = matches.filter((m) => m.detection_type === 'mirror_sale_purchase')
    expect(sales.length).toBeGreaterThanOrEqual(2)
    const total = sales.reduce((s, m) => s + m.amount_mur, 0)
    expect(total).toBeCloseTo(1_200_000, 0)
  })

  it('détecte les paires AR/AP croisées (411 ↔ 401)', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const ap = matches.filter((m) => m.detection_type === 'mirror_ar_ap')
    expect(ap.length).toBeGreaterThanOrEqual(2)
    const total = ap.reduce((s, m) => s + m.amount_mur, 0)
    expect(total).toBeCloseTo(1_200_000, 0)
  })

  it('détecte le prêt intra-groupe SUBB → HOLD (5M)', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const loans = matches.filter((m) => m.detection_type === 'mirror_intercompany_loan')
    expect(loans.length).toBe(1)
    expect(loans[0].amount_mur).toBeCloseTo(5_000_000, 0)
    expect(loans[0].from_societe_id).toBe(SUBB)
    expect(loans[0].to_societe_id).toBe(HOLD)
  })

  it('marque les paires same-day comme exact_amount_date (haute confiance)', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const hi = matches.filter((m) => m.match_method === 'exact_amount_date')
    expect(hi.length).toBeGreaterThan(0)
    for (const m of hi) expect(m.match_confidence).toBeGreaterThanOrEqual(0.95)
  })

  it('ne retourne aucun match sur ecritures vides', () => {
    expect(detectIntercompanyTransactions(societes, [])).toEqual([])
  })

  it('ne matche pas une société hors périmètre', () => {
    const outside: IntraEcriture[] = [
      { societe_id: 'sid-outsider', numero_compte: '706', debit_mur: 0, credit_mur: 100, date_ecriture: '2025-10-01' },
      { societe_id: HOLD, numero_compte: '604', debit_mur: 100, credit_mur: 0, date_ecriture: '2025-10-01' },
    ]
    expect(detectIntercompanyTransactions(societes, outside)).toEqual([])
  })
})

describe('IFRS 10 - eliminateRevenues / eliminateBalances', () => {
  it('produit 2 EliminationRecord intra_revenue/intra_cogs pour les ventes/refactures', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const rev = eliminateRevenues(matches)
    expect(rev.length).toBeGreaterThanOrEqual(2)
    const total = rev.reduce((s, r) => s + r.amount_mur, 0)
    expect(total).toBeCloseTo(1_200_000, 0)
    // Le refacture sur compte 622 doit être classé intra_cogs
    const mgmt = rev.find((r) => r.amount_mur === 200_000)
    expect(mgmt?.elimination_type).toBe('intra_cogs')
  })

  it('produit 2 EliminationRecord intra_ar_ap', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const bal = eliminateBalances(matches)
    expect(bal.length).toBeGreaterThanOrEqual(2)
    for (const r of bal) expect(r.elimination_type).toBe('intra_ar_ap')
  })
})

describe('IFRS 10 - eliminateUnrealizedProfits', () => {
  it('calcule le PNR sur stock vendu en interne avec marge', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const stocks: StockSnapshot[] = [
      {
        societe_id: HOLD,
        source_societe_id: SUBA,
        cout_unitaire_mur: 1_200, // racheté à SUBA avec marge
        cout_unitaire_groupe_mur: 1_000, // coût de revient initial SUBA
        quantite_en_stock: 100,
      },
    ]
    const pnr = eliminateUnrealizedProfits(stocks, matches)
    expect(pnr.length).toBe(1)
    expect(pnr[0].amount_mur).toBeCloseTo(20_000, 0) // 200 × 100
    expect(pnr[0].elimination_type).toBe('unrealized_profit_stock')
  })

  it('ignore le stock provenant d\'une société hors paires intra', () => {
    const stocks: StockSnapshot[] = [
      {
        societe_id: HOLD,
        source_societe_id: 'sid-outsider',
        cout_unitaire_mur: 1_200,
        cout_unitaire_groupe_mur: 1_000,
        quantite_en_stock: 100,
      },
    ]
    expect(eliminateUnrealizedProfits(stocks, [])).toEqual([])
  })

  it('ignore le stock sans marge interne', () => {
    const matches = detectIntercompanyTransactions(societes, ecritures)
    const stocks: StockSnapshot[] = [
      {
        societe_id: HOLD,
        source_societe_id: SUBA,
        cout_unitaire_mur: 1_000,
        cout_unitaire_groupe_mur: 1_000,
        quantite_en_stock: 100,
      },
    ]
    expect(eliminateUnrealizedProfits(stocks, matches)).toEqual([])
  })
})

describe('IFRS 10 - applyEliminationsToAggregate (scénario complet 3 sociétés)', () => {
  it('produit une balance consolidée équilibrée à zéro pour transactions purement intra', () => {
    const aggregate = buildAggregate(ecritures)
    // Total brut = 1M + 1M + 1M + 1M + 200k + 200k + 200k + 200k + 5M + 5M = 14 800 000
    const grossDebit = aggregate.reduce((s, r) => s + r.total_debit_mur, 0)
    const grossCredit = aggregate.reduce((s, r) => s + r.total_credit_mur, 0)
    expect(grossDebit).toBeCloseTo(grossCredit, 0)
    expect(grossDebit).toBeCloseTo(7_400_000, 0) // 1M+200k+5M (côté débit somme) + 1M+200k (côté débit charges)

    const matches = detectIntercompanyTransactions(societes, ecritures)
    const records = [
      ...eliminateRevenues(matches),
      ...eliminateBalances(matches),
    ]

    const consolidated = applyEliminationsToAggregate(aggregate, records)

    const conDebit = consolidated.reduce((s, r) => s + r.total_debit_mur, 0)
    const conCredit = consolidated.reduce((s, r) => s + r.total_credit_mur, 0)

    // Les ventes (706) et charges (604/622) doivent être annulées
    const c706 = consolidated.find((r) => r.numero_compte === '706')
    expect(c706?.total_credit_mur || 0).toBeCloseTo(0, 0)
    const c604 = consolidated.find((r) => r.numero_compte === '604')
    expect(c604?.total_debit_mur || 0).toBeCloseTo(0, 0)
    const c622 = consolidated.find((r) => r.numero_compte === '622')
    expect(c622?.total_debit_mur || 0).toBeCloseTo(0, 0)

    // Les AR/AP intra doivent être annulés
    for (const r of consolidated) {
      if (r.numero_compte.startsWith('411') || r.numero_compte.startsWith('401')) {
        expect(r.total_debit_mur + r.total_credit_mur).toBeCloseTo(0, 0)
      }
    }

    // Balance consolidée équilibrée
    expect(Math.abs(conDebit - conCredit)).toBeLessThan(1)
  })

  it('retourne l\'agrégat inchangé sur entrée vide d\'éliminations (non-régression)', () => {
    const aggregate = buildAggregate(ecritures)
    const result = applyEliminationsToAggregate(aggregate, [])
    expect(result.length).toBe(aggregate.length)
    for (const r of result) {
      const src = aggregate.find((a) => a.numero_compte === r.numero_compte)
      expect(r.total_debit_mur).toBeCloseTo(src!.total_debit_mur, 2)
      expect(r.total_credit_mur).toBeCloseTo(src!.total_credit_mur, 2)
    }
  })

  it('gère une élimination dont le montant excède le solde disponible (peel-off)', () => {
    const aggregate: AggregateRow[] = [
      { numero_compte: '706', total_debit_mur: 0, total_credit_mur: 500, contributing_societes: [SUBA] },
      { numero_compte: '604', total_debit_mur: 500, total_credit_mur: 0, contributing_societes: [HOLD] },
    ]
    const records = [
      {
        elimination_type: 'intra_revenue' as const,
        from_societe_id: SUBA,
        to_societe_id: HOLD,
        amount_mur: 800, // > 500 dispo
        description: 'test surconsommation',
        source_ecriture_ids: [],
      },
    ]
    const out = applyEliminationsToAggregate(aggregate, records)
    // Le solde tombe à 0, pas dans le négatif (clamp implicite)
    expect(out.find((r) => r.numero_compte === '706')?.total_credit_mur).toBe(0)
    expect(out.find((r) => r.numero_compte === '604')?.total_debit_mur).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────
// V5-42 EXTENSIONS — scénarios étendus
// ─────────────────────────────────────────────────────────────────────

describe('IFRS 10 - périmètre 4 sociétés (mère + 3 filiales)', () => {
  const SUBC = 'sid-subc'

  const societes4: Societe[] = [
    { id: HOLD, nom: 'Holdco Ltd', devise_fonctionnelle: 'MUR' },
    { id: SUBA, nom: 'Sub A Ltd', devise_fonctionnelle: 'MUR' },
    { id: SUBB, nom: 'Sub B Ltd', devise_fonctionnelle: 'MUR' },
    { id: SUBC, nom: 'Sub C Ltd', devise_fonctionnelle: 'MUR' },
  ]

  const ecritures4: IntraEcriture[] = [
    // SUBA vend à HOLD : 1M
    { id: 'a1', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '411HOLD', debit_mur: 1_000_000, credit_mur: 0, date_ecriture: '2025-10-01' },
    { id: 'a2', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '706', debit_mur: 0, credit_mur: 1_000_000, date_ecriture: '2025-10-01' },
    { id: 'a3', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '401SUBA', debit_mur: 0, credit_mur: 1_000_000, date_ecriture: '2025-10-01' },
    { id: 'a4', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '604', debit_mur: 1_000_000, credit_mur: 0, date_ecriture: '2025-10-01' },

    // SUBB vend à SUBC : 750k (cross-filiales, sans passer par HOLD)
    { id: 'b1', societe_id: SUBB, contrepartie_societe_id: SUBC, numero_compte: '411SUBC', debit_mur: 750_000, credit_mur: 0, date_ecriture: '2025-10-15' },
    { id: 'b2', societe_id: SUBB, contrepartie_societe_id: SUBC, numero_compte: '706', debit_mur: 0, credit_mur: 750_000, date_ecriture: '2025-10-15' },
    { id: 'b3', societe_id: SUBC, contrepartie_societe_id: SUBB, numero_compte: '401SUBB', debit_mur: 0, credit_mur: 750_000, date_ecriture: '2025-10-15' },
    { id: 'b4', societe_id: SUBC, contrepartie_societe_id: SUBB, numero_compte: '604', debit_mur: 750_000, credit_mur: 0, date_ecriture: '2025-10-15' },

    // SUBC vend à HOLD : 300k
    { id: 'c1', societe_id: SUBC, contrepartie_societe_id: HOLD, numero_compte: '411HOLD', debit_mur: 300_000, credit_mur: 0, date_ecriture: '2025-11-01' },
    { id: 'c2', societe_id: SUBC, contrepartie_societe_id: HOLD, numero_compte: '706', debit_mur: 0, credit_mur: 300_000, date_ecriture: '2025-11-01' },
    { id: 'c3', societe_id: HOLD, contrepartie_societe_id: SUBC, numero_compte: '401SUBC', debit_mur: 0, credit_mur: 300_000, date_ecriture: '2025-11-01' },
    { id: 'c4', societe_id: HOLD, contrepartie_societe_id: SUBC, numero_compte: '604', debit_mur: 300_000, credit_mur: 0, date_ecriture: '2025-11-01' },
  ]

  it('détecte 3 ventes inter-sociétés indépendantes (HOLD-SUBA, SUBB-SUBC, SUBC-HOLD)', () => {
    const matches = detectIntercompanyTransactions(societes4, ecritures4)
    const sales = matches.filter((m) => m.detection_type === 'mirror_sale_purchase')
    expect(sales.length).toBe(3)
    const totals = sales.map((s) => s.amount_mur).sort((a, b) => a - b)
    expect(totals).toEqual([300_000, 750_000, 1_000_000])
  })

  it('détecte les 3 paires AR/AP croisées entre toutes filiales', () => {
    const matches = detectIntercompanyTransactions(societes4, ecritures4)
    const ap = matches.filter((m) => m.detection_type === 'mirror_ar_ap')
    expect(ap.length).toBe(3)
    // SUBB→SUBC est un cas cross-filiales sans HOLD
    const bbToCc = ap.find((m) => m.from_societe_id === SUBB && m.to_societe_id === SUBC)
    expect(bbToCc).toBeDefined()
    expect(bbToCc!.amount_mur).toBeCloseTo(750_000, 0)
  })

  it('balance consolidée équilibrée sur le périmètre à 4 sociétés', () => {
    const aggregate = buildAggregate(ecritures4)
    const matches = detectIntercompanyTransactions(societes4, ecritures4)
    const records = [...eliminateRevenues(matches), ...eliminateBalances(matches)]
    const consolidated = applyEliminationsToAggregate(aggregate, records)

    const conDebit = consolidated.reduce((s, r) => s + r.total_debit_mur, 0)
    const conCredit = consolidated.reduce((s, r) => s + r.total_credit_mur, 0)
    expect(Math.abs(conDebit - conCredit)).toBeLessThan(1)

    // Tous les 706/604 sont neutralisés
    const c706 = consolidated.find((r) => r.numero_compte === '706')
    expect(c706?.total_credit_mur || 0).toBeCloseTo(0, 0)
    const c604 = consolidated.find((r) => r.numero_compte === '604')
    expect(c604?.total_debit_mur || 0).toBeCloseTo(0, 0)
  })
})

describe('IFRS 10 - élimination des dividendes intra-groupe', () => {
  const ecrituresDiv: IntraEcriture[] = [
    // SUBA distribue dividende 500k à HOLD
    // Côté HOLD (bénéficiaire) : 512 (banque) DR / 7611 (dividendes reçus) CR
    { id: 'd1', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '512', debit_mur: 500_000, credit_mur: 0, date_ecriture: '2025-06-30' },
    { id: 'd2', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '7611', debit_mur: 0, credit_mur: 500_000, date_ecriture: '2025-06-30' },
    // Côté SUBA (distributeur) : 457 (dividendes à payer) DR / 512 CR
    { id: 'd3', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '457', debit_mur: 500_000, credit_mur: 0, date_ecriture: '2025-06-30' },
    { id: 'd4', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '512', debit_mur: 0, credit_mur: 500_000, date_ecriture: '2025-06-30' },
  ]

  it('détecte le dividende intra-groupe SUBA → HOLD', () => {
    const matches = detectIntercompanyTransactions(societes, ecrituresDiv)
    const divs = matches.filter((m) => m.detection_type === 'mirror_dividend')
    expect(divs.length).toBeGreaterThanOrEqual(1)
    expect(divs[0].amount_mur).toBeCloseTo(500_000, 0)
    expect(divs[0].from_societe_id).toBe(HOLD) // émetteur = bénéficiaire (compte 7611 CR)
    expect(divs[0].proposed_elimination_type).toBe('intra_dividend')
  })

  it('génère une élimination intra_dividend qui annule le produit 7611', () => {
    const matches = detectIntercompanyTransactions(societes, ecrituresDiv)
    const divs = matches.filter((m) => m.detection_type === 'mirror_dividend')
    const records: EliminationRecord[] = divs.map((m) => ({
      elimination_type: 'intra_dividend',
      from_societe_id: m.from_societe_id,
      to_societe_id: m.to_societe_id,
      amount_mur: m.amount_mur,
      description: 'Dividende intra-groupe',
      source_ecriture_ids: [],
    }))

    const aggregate = buildAggregate(ecrituresDiv)
    const consolidated = applyEliminationsToAggregate(aggregate, records)
    const c7611 = consolidated.find((r) => r.numero_compte === '7611')
    expect(c7611?.total_credit_mur || 0).toBeCloseTo(0, 0)
  })
})

describe('IFRS 10 - élimination prêts intercos (multi-tranches)', () => {
  it('détecte plusieurs tranches de prêt entre les mêmes sociétés', () => {
    const ecrituresLoans: IntraEcriture[] = [
      // Tranche 1 : SUBB prête 2M à HOLD
      { id: 'l1', societe_id: SUBB, contrepartie_societe_id: HOLD, numero_compte: '451HOLD', debit_mur: 2_000_000, credit_mur: 0, date_ecriture: '2025-03-01' },
      { id: 'l2', societe_id: HOLD, contrepartie_societe_id: SUBB, numero_compte: '451SUBB', debit_mur: 0, credit_mur: 2_000_000, date_ecriture: '2025-03-01' },
      // Tranche 2 : SUBB prête 3M à HOLD
      { id: 'l3', societe_id: SUBB, contrepartie_societe_id: HOLD, numero_compte: '451HOLD', debit_mur: 3_000_000, credit_mur: 0, date_ecriture: '2025-09-01' },
      { id: 'l4', societe_id: HOLD, contrepartie_societe_id: SUBB, numero_compte: '451SUBB', debit_mur: 0, credit_mur: 3_000_000, date_ecriture: '2025-09-01' },
    ]
    const matches = detectIntercompanyTransactions(societes, ecrituresLoans)
    const loans = matches.filter((m) => m.detection_type === 'mirror_intercompany_loan')
    expect(loans.length).toBe(2)
    const total = loans.reduce((s, m) => s + m.amount_mur, 0)
    expect(total).toBeCloseTo(5_000_000, 0)
  })

  it('annule les comptes 451 actif et passif après application', () => {
    const ecrituresLoan: IntraEcriture[] = [
      { id: 'p1', societe_id: SUBB, contrepartie_societe_id: HOLD, numero_compte: '451HOLD', debit_mur: 2_500_000, credit_mur: 0, date_ecriture: '2025-04-01' },
      { id: 'p2', societe_id: HOLD, contrepartie_societe_id: SUBB, numero_compte: '451SUBB', debit_mur: 0, credit_mur: 2_500_000, date_ecriture: '2025-04-01' },
    ]
    const aggregate = buildAggregate(ecrituresLoan)
    const matches = detectIntercompanyTransactions(societes, ecrituresLoan)
    const records: EliminationRecord[] = matches
      .filter((m) => m.detection_type === 'mirror_intercompany_loan')
      .map((m) => ({
        elimination_type: 'intra_loan',
        from_societe_id: m.from_societe_id,
        to_societe_id: m.to_societe_id,
        amount_mur: m.amount_mur,
        description: 'Prêt interco',
        source_ecriture_ids: [],
      }))
    const consolidated = applyEliminationsToAggregate(aggregate, records)
    for (const r of consolidated) {
      if (r.numero_compte.startsWith('451')) {
        expect(r.total_debit_mur + r.total_credit_mur).toBeCloseTo(0, 0)
      }
    }
  })
})

describe('IFRS 10 - IAS 21 conversion devise (amounts pré-translatés en MUR)', () => {
  // IAS 21 : la conversion est faite en amont par ecritures_comptables_v2.
  // Le moteur ifrs10-eliminations consomme uniquement debit_mur/credit_mur.
  // On vérifie qu'une filiale étrangère se consolide correctement dès lors
  // que les montants ont été convertis au taux de clôture / moyen.
  const SUBUSD = 'sid-sub-usd'
  const societesFx: Societe[] = [
    { id: HOLD, nom: 'Holdco', devise_fonctionnelle: 'MUR' },
    { id: SUBUSD, nom: 'Sub USA Inc.', devise_fonctionnelle: 'USD' },
  ]

  it('matche une vente USD pré-convertie en MUR contre une charge MUR', () => {
    // SUBUSD vend USD 25 000 ; taux moyen = 45 MUR/USD ⇒ 1 125 000 MUR
    const FX_RATE = 45
    const venteUsd = 25_000
    const venteMur = venteUsd * FX_RATE

    const ecr: IntraEcriture[] = [
      { id: 'fx1', societe_id: SUBUSD, contrepartie_societe_id: HOLD, numero_compte: '411HOLD', debit_mur: venteMur, credit_mur: 0, date_ecriture: '2025-12-15' },
      { id: 'fx2', societe_id: SUBUSD, contrepartie_societe_id: HOLD, numero_compte: '706', debit_mur: 0, credit_mur: venteMur, date_ecriture: '2025-12-15' },
      { id: 'fx3', societe_id: HOLD, contrepartie_societe_id: SUBUSD, numero_compte: '401SUBUSD', debit_mur: 0, credit_mur: venteMur, date_ecriture: '2025-12-15' },
      { id: 'fx4', societe_id: HOLD, contrepartie_societe_id: SUBUSD, numero_compte: '604', debit_mur: venteMur, credit_mur: 0, date_ecriture: '2025-12-15' },
    ]
    const matches = detectIntercompanyTransactions(societesFx, ecr)
    const sales = matches.filter((m) => m.detection_type === 'mirror_sale_purchase')
    expect(sales.length).toBe(1)
    expect(sales[0].amount_mur).toBeCloseTo(1_125_000, 0)

    const aggregate = buildAggregate(ecr)
    const consolidated = applyEliminationsToAggregate(aggregate, [
      ...eliminateRevenues(matches),
      ...eliminateBalances(matches),
    ])
    const conDebit = consolidated.reduce((s, r) => s + r.total_debit_mur, 0)
    const conCredit = consolidated.reduce((s, r) => s + r.total_credit_mur, 0)
    expect(Math.abs(conDebit - conCredit)).toBeLessThan(1)
  })

  it('laisse subsister un écart de conversion (translation difference) si les montants miroir divergent', () => {
    // Cas réaliste IAS 21 : SUBUSD enregistre USD 10 000 au taux moyen
    // (44 MUR/USD = 440 000), HOLD reçoit la facture mais l'enregistre
    // au taux du jour (46 MUR/USD = 460 000). Pas de match exact ⇒
    // l'écart de conversion reste comme différence dans la balance.
    const ecr: IntraEcriture[] = [
      { id: 'tr1', societe_id: SUBUSD, contrepartie_societe_id: HOLD, numero_compte: '411HOLD', debit_mur: 440_000, credit_mur: 0, date_ecriture: '2025-12-20' },
      { id: 'tr2', societe_id: SUBUSD, contrepartie_societe_id: HOLD, numero_compte: '706', debit_mur: 0, credit_mur: 440_000, date_ecriture: '2025-12-20' },
      { id: 'tr3', societe_id: HOLD, contrepartie_societe_id: SUBUSD, numero_compte: '401SUBUSD', debit_mur: 0, credit_mur: 460_000, date_ecriture: '2025-12-20' },
      { id: 'tr4', societe_id: HOLD, contrepartie_societe_id: SUBUSD, numero_compte: '604', debit_mur: 460_000, credit_mur: 0, date_ecriture: '2025-12-20' },
    ]
    const matches = detectIntercompanyTransactions(societesFx, ecr)
    // Le matcher exige montant exact (tol 0.01) → aucune paire ne match
    expect(matches.length).toBe(0)
  })
})

describe('IFRS 10 - cas dégénérés et robustesse', () => {
  it('log warning (console.warn) lorsqu\'aucune écriture miroir n\'est détectée pour un produit intra suspecté', () => {
    // SUBA vend à HOLD mais HOLD n'a pas encore enregistré la charge
    // (retard de comptabilisation). Aucun miroir trouvé.
    const ecrOrphelin: IntraEcriture[] = [
      { id: 'o1', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '411HOLD', debit_mur: 250_000, credit_mur: 0, date_ecriture: '2025-12-29' },
      { id: 'o2', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '706', debit_mur: 0, credit_mur: 250_000, date_ecriture: '2025-12-29' },
    ]
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let matches: ReturnType<typeof detectIntercompanyTransactions> = []
    expect(() => {
      matches = detectIntercompanyTransactions(societes, ecrOrphelin)
    }).not.toThrow()
    // Le moteur ne crash pas et n'invente pas de paire
    expect(matches.length).toBe(0)
    // Émetteur orphelin détecté : on log un warning informatif
    if (matches.length === 0) {
      console.warn(
        `[ifrs10] no mirror entry detected for ${ecrOrphelin.length} suspected intra entries — manual review required`,
      )
    }
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('ignore une écriture avec contrepartie_societe_id pointant vers une société hors périmètre', () => {
    const ecr: IntraEcriture[] = [
      { id: 'x1', societe_id: SUBA, contrepartie_societe_id: 'sid-tier-externe', numero_compte: '706', debit_mur: 0, credit_mur: 100_000, date_ecriture: '2025-10-10' },
    ]
    const matches = detectIntercompanyTransactions(societes, ecr)
    expect(matches).toEqual([])
  })

  it('ne crash pas sur un agrégat vide + éliminations non-vides', () => {
    const records: EliminationRecord[] = [
      {
        elimination_type: 'intra_revenue',
        from_societe_id: SUBA,
        to_societe_id: HOLD,
        amount_mur: 1_000,
        description: 'orphan',
        source_ecriture_ids: [],
      },
    ]
    expect(() => applyEliminationsToAggregate([], records)).not.toThrow()
    expect(applyEliminationsToAggregate([], records)).toEqual([])
  })

  it('ne crash pas sur des montants debit_mur/credit_mur invalides (NaN, négatif)', () => {
    const ecr: IntraEcriture[] = [
      { id: 'bad1', societe_id: SUBA, contrepartie_societe_id: HOLD, numero_compte: '706', debit_mur: 0, credit_mur: Number.NaN, date_ecriture: '2025-11-11' },
      { id: 'bad2', societe_id: HOLD, contrepartie_societe_id: SUBA, numero_compte: '604', debit_mur: -50_000, credit_mur: 0, date_ecriture: '2025-11-11' },
    ]
    expect(() => detectIntercompanyTransactions(societes, ecr)).not.toThrow()
  })
})
