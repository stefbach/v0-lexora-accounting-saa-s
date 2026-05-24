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

import { describe, it, expect } from 'vitest'
import {
  detectIntercompanyTransactions,
  eliminateBalances,
  eliminateRevenues,
  eliminateUnrealizedProfits,
  applyEliminationsToAggregate,
  type AggregateRow,
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
