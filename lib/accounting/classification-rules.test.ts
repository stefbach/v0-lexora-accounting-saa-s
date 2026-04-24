import { describe, it, expect } from 'vitest'
import {
  bucketizeTransactions,
  accountClass,
  isLettrableAccount,
  classifyTransaction,
  type TransactionLike,
} from '@/lib/accounting/classification-rules'

function tx(overrides: Partial<TransactionLike & { id?: string }> = {}): TransactionLike & { id?: string } {
  return {
    id: 'tx-1',
    libelle: '',
    tiers_detecte: null,
    tiers: null,
    debit: 0,
    credit: 0,
    date: '2026-04-15',
    devise: 'MUR',
    ...overrides,
  }
}

describe('accountClass', () => {
  it('retourne "lettrable" pour les comptes 401/411/421/...', () => {
    expect(accountClass('401')).toBe('lettrable')
    expect(accountClass('411')).toBe('lettrable')
    expect(accountClass('4111')).toBe('lettrable')
    expect(accountClass('421')).toBe('lettrable')
    expect(accountClass('455')).toBe('lettrable')
    expect(accountClass('580')).toBe('lettrable')
  })

  it('retourne "skip" pour les prefixes 627/444/422', () => {
    expect(accountClass('627')).toBe('skip')
    expect(accountClass('6271')).toBe('skip')
    expect(accountClass('444')).toBe('skip')
    expect(accountClass('422')).toBe('skip')
  })

  it('retourne "charge" pour 6xxx hors 627/422', () => {
    expect(accountClass('607')).toBe('charge')
    expect(accountClass('615')).toBe('charge')
    expect(accountClass('626')).toBe('charge')
  })

  it('retourne "produit" pour 7xxx', () => {
    expect(accountClass('706')).toBe('produit')
    expect(accountClass('775')).toBe('produit')
  })

  it('retourne "autre" pour un compte vide, null ou hors classes connues', () => {
    expect(accountClass(null)).toBe('autre')
    expect(accountClass(undefined)).toBe('autre')
    expect(accountClass('')).toBe('autre')
    expect(accountClass('101')).toBe('autre') // capital — non géré ici
  })

  it('isLettrableAccount est coherent avec accountClass', () => {
    expect(isLettrableAccount('411')).toBe(true)
    expect(isLettrableAccount('627')).toBe(false)
    expect(isLettrableAccount('606')).toBe(false)
  })
})

describe('classifyTransaction — detection directe', () => {
  it('classe une tx MRA en paiement_mra', () => {
    const c = classifyTransaction(tx({
      libelle: 'MRA VAT payment April',
      tiers_detecte: 'Mauritius Revenue Authority',
      debit: 25000,
    }))
    expect(c.category).toBe('paiement_mra')
    expect(c.compte_default).toBe('444')
    expect(c.skip_lettrage).toBe(true)
  })

  it('classe frais bancaires uniquement si tiers bancaire + libelle de frais', () => {
    const c = classifyTransaction(tx({
      libelle: 'Monthly service fee',
      tiers_detecte: 'MCB',
      debit: 500,
    }))
    expect(c.category).toBe('frais_bancaires')
    expect(c.compte_default).toBe('627')
    expect(c.skip_lettrage).toBe(true)
  })

  it('laisse en "inconnu" un libelle "fee" sans tiers bancaire', () => {
    const c = classifyTransaction(tx({
      libelle: 'Monthly service fee',
      tiers_detecte: 'Some Client Ltd',
      debit: 500,
    }))
    expect(c.category).toBe('inconnu')
  })

  it('classe une tx "Bulk Payment Payroll" en salaire_bulk', () => {
    const c = classifyTransaction(tx({
      libelle: 'Bulk Payment Payroll March',
      debit: 120000,
    }))
    expect(c.category).toBe('salaire_bulk')
    expect(c.compte_default).toBe('421')
  })

  it('classe une tx "IB Own Account Transfer" en transfert_interne', () => {
    const c = classifyTransaction(tx({
      libelle: 'IB Own Account Transfer',
      debit: 50000,
    }))
    expect(c.category).toBe('transfert_interne')
    expect(c.compte_default).toBe('580')
  })
})

describe('bucketizeTransactions', () => {
  it('bucketise correctement un melange de categories', () => {
    const transactions = [
      tx({ id: '1', libelle: 'MRA VAT payment', tiers_detecte: 'Mauritius Revenue', debit: 25000 }),
      tx({ id: '2', libelle: 'Service fee', tiers_detecte: 'MCB', debit: 200 }),
      tx({ id: '3', libelle: 'Bulk Payment Payroll', debit: 150000 }),
      tx({ id: '4', libelle: 'IB Own Account Transfer', debit: 10000 }),
      tx({ id: '5', libelle: 'Payment from CustoCo inv 123', credit: 5000 }),
    ]

    const buckets = bucketizeTransactions(transactions)
    expect(buckets.mra.count).toBe(1)
    expect(buckets.mra.total).toBe(25000)
    expect(buckets.frais.count).toBe(1)
    expect(buckets.salaires.count).toBe(1)
    expect(buckets.internes.count).toBe(1)
    expect(buckets.inconnus.count).toBe(1)
  })

  it('ignore les transactions a montant 0', () => {
    const buckets = bucketizeTransactions([
      tx({ id: '1', libelle: 'MRA', tiers_detecte: 'MRA', debit: 0, credit: 0 }),
    ])
    expect(buckets.mra.count).toBe(0)
    expect(buckets.inconnus.count).toBe(0)
  })

  it('classe une note de frais (petrol) en notes_frais', () => {
    const buckets = bucketizeTransactions([
      tx({ id: '1', libelle: 'Petrol reimbursement for John', debit: 2500 }),
    ])
    expect(buckets.notes_frais.count).toBe(1)
  })

  it('classe "remboursement CC associe" en remboursements personnels', () => {
    const buckets = bucketizeTransactions([
      tx({ id: '1', libelle: 'Remboursement CC associe', debit: 50000 }),
    ])
    expect(buckets.remboursements.count).toBe(1)
  })

  it("aggrege les totaux par bucket", () => {
    const buckets = bucketizeTransactions([
      tx({ id: 'a', libelle: 'MRA', tiers_detecte: 'Mauritius Revenue', debit: 1000 }),
      tx({ id: 'b', libelle: 'MRA', tiers_detecte: 'Mauritius Revenue', debit: 2000 }),
      tx({ id: 'c', libelle: 'MRA', tiers_detecte: 'Mauritius Revenue', debit: 500 }),
    ])
    expect(buckets.mra.count).toBe(3)
    expect(buckets.mra.total).toBe(3500)
  })
})
