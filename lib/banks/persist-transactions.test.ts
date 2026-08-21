import { describe, it, expect, vi } from 'vitest'
import {
  scrapedDedupeKey,
  existingRowKey,
  selectNewTransactions,
  toBankTransactionRow,
  upsertScrapedTransactions,
} from './persist-transactions'
import type { ScrapedTransaction } from './scraper'

const TX = (over: Partial<ScrapedTransaction>): ScrapedTransaction => ({
  date: '2026-08-20',
  description: 'Frais',
  amount: -4.72,
  currency: 'MUR',
  ...over,
})

describe('scrapedDedupeKey', () => {
  it('privilégie la référence', () => {
    expect(scrapedDedupeKey(TX({ reference: 'FT262327YRQX' }))).toBe('ref:FT262327YRQX')
  })
  it('repli date+montant+libellé sans référence', () => {
    expect(scrapedDedupeKey(TX({ description: 'ATM Cash Withdrawal|MCB' }))).toBe(
      'dmd:2026-08-20|-4.72|atm cash withdrawal|mcb',
    )
  })
})

describe('existingRowKey — cohérence avec les lignes en base', () => {
  it('reconstitue la même clé qu’un mouvement scrapé (référence)', () => {
    const scrapedKey = scrapedDedupeKey(TX({ reference: 'FT26229L0Z0S', amount: -58072 }))
    const dbKey = existingRowKey({
      reference: 'FT26229L0Z0S',
      date_transaction: '2026-08-17',
      debit: 58072,
      credit: 0,
      libelle_banque: 'Bulk Payment|HONORAIRES MEDECINS Juil 2026',
    })
    expect(dbKey).toBe(scrapedKey)
  })
  it('crédit : signe positif reconstitué', () => {
    const dbKey = existingRowKey({
      reference: null,
      date_transaction: '2026-08-20',
      debit: 0,
      credit: 800,
      libelle_banque: 'Merchant Settlement',
    })
    expect(dbKey).toBe(scrapedDedupeKey(TX({ amount: 800, description: 'Merchant Settlement' })))
  })
  it('gère debit/credit en texte (NUMERIC → string)', () => {
    const dbKey = existingRowKey({
      reference: null,
      date_transaction: '2026-08-20',
      debit: '4.72',
      credit: '0',
      libelle_banque: 'Frais',
    })
    expect(dbKey).toBe('dmd:2026-08-20|-4.72|frais')
  })
})

describe('selectNewTransactions', () => {
  it('filtre les mouvements déjà en base', () => {
    const scraped = [
      TX({ reference: 'FT1', amount: -10 }),
      TX({ reference: 'FT2', amount: -20 }),
      TX({ reference: 'FT3', amount: -30 }),
    ]
    const existing = new Set(['ref:FT1', 'ref:FT3'])
    const fresh = selectNewTransactions(scraped, existing)
    expect(fresh.map((t) => t.reference)).toEqual(['FT2'])
  })
  it('dédoublonne aussi à l’intérieur du lot scrapé', () => {
    const scraped = [TX({ reference: 'FT1' }), TX({ reference: 'FT1' })]
    expect(selectNewTransactions(scraped, new Set())).toHaveLength(1)
  })
  it('rien de nouveau → [] (run quotidien idempotent)', () => {
    const scraped = [TX({ reference: 'FT1' }), TX({ reference: 'FT2' })]
    expect(selectNewTransactions(scraped, new Set(['ref:FT1', 'ref:FT2']))).toEqual([])
  })
})

describe('toBankTransactionRow', () => {
  const ctx = { compte_bancaire_id: 'cb-1', societe_id: 'soc-1' }
  it('débit : montant négatif → colonne debit', () => {
    const row = toBankTransactionRow(TX({ reference: 'FT1', amount: -58072, balance_after: 21791.93, value_date: '2026-08-17' }), ctx)
    expect(row.debit).toBe(58072)
    expect(row.credit).toBe(0)
    expect(row.solde_apres).toBe(21791.93)
    expect(row.date_valeur).toBe('2026-08-17')
    expect(row.statut_lettrage).toBe('a_lettrer')
    expect(row.type_transaction).toBe('scrape_auto')
  })
  it('crédit : montant positif → colonne credit', () => {
    const row = toBankTransactionRow(TX({ amount: 800 }), ctx)
    expect(row.debit).toBe(0)
    expect(row.credit).toBe(800)
  })
  it('libellé vide → placeholder, value_date par défaut = date', () => {
    const row = toBankTransactionRow(TX({ description: '', value_date: undefined }), ctx)
    expect(row.libelle_banque).toBe('(sans libellé)')
    expect(row.date_valeur).toBe('2026-08-20')
  })
})

describe('upsertScrapedTransactions — I/O dédoublonnée', () => {
  function makeAdmin(existing: any[]) {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const admin = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: existing }),
            }),
          }),
        }),
        insert,
      })),
    }
    return { admin: admin as any, insert }
  }

  const ctx = { compte_bancaire_id: 'cb-1', societe_id: 'soc-1' }

  it('n’insère que les nouveaux mouvements', async () => {
    const { admin, insert } = makeAdmin([
      { reference: 'FT1', date_transaction: '2026-08-20', debit: 10, credit: 0, libelle_banque: 'A' },
    ])
    const res = await upsertScrapedTransactions(admin, ctx, [
      TX({ reference: 'FT1', amount: -10 }),
      TX({ reference: 'FT2', amount: -20 }),
    ])
    expect(res.inserted).toBe(1)
    expect(res.duplicates).toBe(1)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toHaveLength(1)
    expect(insert.mock.calls[0][0][0].reference).toBe('FT2')
  })

  it('run idempotent : tout existe déjà → aucune insertion', async () => {
    const { admin, insert } = makeAdmin([
      { reference: 'FT1', date_transaction: '2026-08-20', debit: 10, credit: 0, libelle_banque: 'A' },
      { reference: 'FT2', date_transaction: '2026-08-20', debit: 20, credit: 0, libelle_banque: 'B' },
    ])
    const res = await upsertScrapedTransactions(admin, ctx, [
      TX({ reference: 'FT1', amount: -10 }),
      TX({ reference: 'FT2', amount: -20 }),
    ])
    expect(res.inserted).toBe(0)
    expect(res.duplicates).toBe(2)
    expect(insert).not.toHaveBeenCalled()
  })

  it('lot vide → no-op', async () => {
    const { admin, insert } = makeAdmin([])
    const res = await upsertScrapedTransactions(admin, ctx, [])
    expect(res).toEqual({ inserted: 0, duplicates: 0, window: null })
    expect(admin.from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('calcule la fenêtre de dates (min..max)', async () => {
    const { admin } = makeAdmin([])
    const res = await upsertScrapedTransactions(admin, ctx, [
      TX({ reference: 'FT1', date: '2026-08-20' }),
      TX({ reference: 'FT2', date: '2026-08-17' }),
    ])
    expect(res.window).toEqual({ from: '2026-08-17', to: '2026-08-20' })
  })
})
