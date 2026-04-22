import { describe, it, expect } from 'vitest'
import {
  analyzeAllTransactions,
  findBestMatch,
  tiersScore,
  normalize,
  toMUR,
  type MatchingFacture,
  type MatchingTransaction,
} from '@/lib/accounting/matching-engine'

function fac(overrides: Partial<MatchingFacture> = {}): MatchingFacture {
  return {
    id: 'f-1',
    numero_facture: 'INV-001',
    tiers: 'ACME Ltd',
    montant_ttc: 1000,
    montant_mur: 1000,
    devise: 'MUR',
    date_facture: '2026-04-01',
    date_echeance: '2026-04-30',
    conditions_paiement: 30,
    type_facture: 'client',
    statut: 'en_attente',
    ...overrides,
  }
}

function tx(overrides: Partial<MatchingTransaction> = {}): MatchingTransaction {
  return {
    releve_id: 'r-1',
    transaction_idx: 0,
    date: '2026-04-15',
    libelle: '',
    tiers_detecte: null,
    debit: 0,
    credit: 0,
    devise: 'MUR',
    ...overrides,
  }
}

describe('helpers — normalize / tiersScore / toMUR', () => {
  it('normalize supprime accents et suffixes "Ltd"', () => {
    expect(normalize('Société ACME Ltd.')).toBe('societe acme')
  })

  it('tiersScore retourne 1 pour noms identiques apres normalisation', () => {
    expect(tiersScore('ACME Ltd', 'acme ltd')).toBe(1)
  })

  it('tiersScore retourne 0 pour chaines vides', () => {
    expect(tiersScore('', 'ACME')).toBe(0)
  })

  it('toMUR convertit avec fallback FX pour USD', () => {
    expect(toMUR(100, 'USD')).toBeCloseTo(4480, 0)
    expect(toMUR(100, 'MUR')).toBe(100)
    expect(toMUR(100, null)).toBe(100)
  })
})

describe('analyzeAllTransactions', () => {
  it('matche une facture par reference exacte (strategy exact_reference)', () => {
    const transactions = [
      tx({ libelle: 'Paiement INV-001 ACME', credit: 1000, tiers_detecte: 'ACME' }),
    ]
    const factures = [fac()]
    const matches = analyzeAllTransactions(transactions, factures)
    expect(matches).toHaveLength(1)
    expect(matches[0].strategy).toBe('exact_reference')
    expect(matches[0].facture_ids).toEqual(['f-1'])
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('matche par montant + tiers quand la reference est absente', () => {
    const transactions = [
      tx({ libelle: 'Virement ACME Ltd', credit: 1000, tiers_detecte: 'ACME Ltd' }),
    ]
    const factures = [fac({ numero_facture: null })]
    const matches = analyzeAllTransactions(transactions, factures)
    expect(matches).toHaveLength(1)
    expect(['exact_amount', 'close_amount']).toContain(matches[0].strategy)
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('matche un grouped_sum : 2 factures ACME dont le total correspond au paiement', () => {
    const transactions = [
      tx({
        libelle: 'Bulk payment ACME',
        credit: 1500,
        tiers_detecte: 'ACME Ltd',
      }),
    ]
    const factures = [
      fac({ id: 'f-a', numero_facture: 'INV-A', montant_ttc: 500, montant_mur: 500 }),
      fac({ id: 'f-b', numero_facture: 'INV-B', montant_ttc: 1000, montant_mur: 1000 }),
    ]
    const matches = analyzeAllTransactions(transactions, factures)
    expect(matches).toHaveLength(1)
    expect(matches[0].strategy).toBe('grouped_sum')
    expect(matches[0].facture_ids.sort()).toEqual(['f-a', 'f-b'])
  })

  it('laisse en "orphan" (aucun match) une transaction sans facture correspondante', () => {
    const transactions = [
      tx({ libelle: 'Random libelle', credit: 9999, tiers_detecte: 'Unknown Corp' }),
    ]
    const factures = [fac({ tiers: 'ACME Ltd', montant_ttc: 1000, montant_mur: 1000 })]
    const matches = analyzeAllTransactions(transactions, factures)
    expect(matches).toHaveLength(0)
  })

  it('ne matche pas une transaction sortante avec une facture CLIENT (mauvaise direction et tiers different)', () => {
    const transactions = [
      // debit > 0 → sortie → devrait matcher fournisseur uniquement
      // On utilise un tiers totalement different pour eviter un faux positif "refund".
      tx({ libelle: 'Supplier payment XYZ', debit: 1000, tiers_detecte: 'XYZ Corp' }),
    ]
    const factures = [fac({ type_facture: 'client', tiers: 'ACME Ltd' })]
    const matches = analyzeAllTransactions(transactions, factures)
    expect(matches).toHaveLength(0)
  })

  it('n\'utilise pas 2x la meme facture (usedFactureIds)', () => {
    const transactions = [
      tx({ libelle: 'Payment INV-001 ACME', credit: 1000, tiers_detecte: 'ACME', transaction_idx: 0 }),
      tx({ libelle: 'Payment INV-001 ACME', credit: 1000, tiers_detecte: 'ACME', transaction_idx: 1 }),
    ]
    const factures = [fac()]
    const matches = analyzeAllTransactions(transactions, factures)
    expect(matches).toHaveLength(1)
    expect(matches[0].facture_ids).toEqual(['f-1'])
  })

  it('findBestMatch retourne null si aucune strategie ne depasse le seuil', () => {
    const m = findBestMatch(
      tx({ libelle: 'Xyz', credit: 17.5, tiers_detecte: 'Zzzz' }),
      [fac({ tiers: 'ACME', montant_ttc: 9000, montant_mur: 9000 })],
    )
    expect(m).toBeNull()
  })

  it('gere le matching cross-devise via toMUR + montant_mur', () => {
    const transactions = [
      tx({
        libelle: 'USD transfer ACME',
        credit: 100, // USD
        tiers_detecte: 'ACME Ltd',
        devise: 'USD',
      }),
    ]
    const factures = [
      fac({
        devise: 'USD',
        montant_ttc: 100,
        montant_mur: 4480, // converti à 44.80
      }),
    ]
    const matches = analyzeAllTransactions(transactions, factures)
    expect(matches).toHaveLength(1)
    expect(matches[0].facture_ids).toEqual(['f-1'])
  })
})
