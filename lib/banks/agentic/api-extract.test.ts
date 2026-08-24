import { describe, it, expect } from 'vitest'
import {
  moneyToString,
  findAccountsInJson,
  findTransactionsInJson,
  findStatementsInJson,
  findArrangementIds,
  arrangementsFromCaptured,
  extractFromCaptured,
  isBankApiUrl,
} from './api-extract'
import { findAccountBalance } from './accounts-parse'
import { parseTransactions } from './transactions-parse'

// Payload réaliste Backbase « product summary » (comptes) — enveloppé.
const BACKBASE_ACCOUNTS = {
  _embedded: {
    products: [
      { id: 'a1', BBAN: '000447954555', currency: 'MUR', displayName: 'Current Account', bookedBalance: '14564.21', availableBalance: '14564.18' },
      { id: 'a2', BBAN: '000447954563', currency: 'GBP', bookedBalance: '-26.72', availableBalance: '-26.72' },
      { id: 'a3', BBAN: '000447954587', currency: 'EUR', bookedBalance: '8926.87', availableBalance: '8526.87' },
    ],
  },
}

// Variante où le montant est un objet { amount, currencyCode } (Backbase courant).
const NESTED_MONEY_ACCOUNTS = {
  accounts: [
    {
      accountNumber: '000447954571',
      availableBalance: { amount: '-35.84', currencyCode: 'USD' },
      bookedBalance: { amount: '-35.84', currencyCode: 'USD' },
    },
  ],
}

describe('moneyToString', () => {
  it('nombre, chaîne, objet {amount}', () => {
    expect(moneyToString(14564.21)).toBe('14564.21')
    expect(moneyToString('14,564.21')).toBe('14,564.21')
    expect(moneyToString({ amount: '800.00', currencyCode: 'MUR' })).toBe('800.00')
    expect(moneyToString(null)).toBeUndefined()
    expect(moneyToString('MUR')).toBeUndefined()
  })
})

describe('findAccountsInJson — Backbase', () => {
  it('extrait les comptes malgré l’enveloppe _embedded', () => {
    const accts = findAccountsInJson(BACKBASE_ACCOUNTS)
    expect(accts).toHaveLength(3)
    const mur = accts.find((a) => a.number === '000447954555')!
    expect(mur.currency).toBe('MUR')
    expect(mur.available).toBe('14564.18')
    expect(mur.ledger).toBe('14564.21')
  })

  it('bout en bout : findAccountBalance lit le solde ciblé (ledger prioritaire)', () => {
    const b = findAccountBalance(findAccountsInJson(BACKBASE_ACCOUNTS), '000447954555')
    expect(b).not.toBeNull()
    expect(b!.balance).toBe(14564.21)
    expect(b!.currency).toBe('MUR')
  })

  it('gère les montants imbriqués {amount, currencyCode}', () => {
    const accts = findAccountsInJson(NESTED_MONEY_ACCOUNTS)
    expect(accts).toHaveLength(1)
    expect(accts[0].number).toBe('000447954571')
    expect(accts[0].currency).toBe('USD')
    expect(accts[0].available).toBe('-35.84')
  })

  it('ignore les objets sans numéro de compte', () => {
    expect(findAccountsInJson({ foo: 'bar', total: 1234.56 })).toEqual([])
  })
})

// Payload réaliste Backbase « transaction manager ».
const BACKBASE_TX = {
  _embedded: {
    transactions: [
      { id: 't1', bookingDate: '2026-08-20', valueDate: '2026-08-20', reference: 'FT262327YRQX', description: 'E-Commerce Transaction Fee|MASTERCARD 1010035200', transactionAmount: { amount: '-4.72', currencyCode: 'MUR' }, runningBalance: '14564.21' },
      { id: 't2', bookingDate: '2026-08-17', valueDate: '2026-08-17', reference: 'FT26229L0Z0S', description: 'Bulk Payment|HONORAIRES MEDECINS Juil 2026', transactionAmount: { amount: '-58072.00', currencyCode: 'MUR' }, runningBalance: '21791.93' },
    ],
  },
}

describe('findTransactionsInJson — Backbase', () => {
  it('extrait les transactions et se branche sur parseTransactions', () => {
    const raws = findTransactionsInJson(BACKBASE_TX)
    expect(raws).toHaveLength(2)
    const txs = parseTransactions(raws)
    expect(txs[0]).toMatchObject({ date: '2026-08-20', amount: -4.72, balance_after: 14564.21, reference: 'FT262327YRQX' })
    expect(txs[1]).toMatchObject({ date: '2026-08-17', amount: -58072, balance_after: 21791.93 })
    expect(txs[1].description).toBe('Bulk Payment|HONORAIRES MEDECINS Juil 2026')
  })

  it('prend le plus grand tableau de transactions (ignore le bruit)', () => {
    const payload = { meta: [{ x: 1 }], data: BACKBASE_TX._embedded }
    expect(findTransactionsInJson(payload)).toHaveLength(2)
  })

  it('objet sans date ou sans montant → ignoré', () => {
    expect(findTransactionsInJson({ items: [{ description: 'x' }, { amount: '5.00' }] })).toEqual([])
  })

  it('applique le sens débit/crédit (montant positif + creditDebitIndicator)', () => {
    // Cas réel MCB : montant POSITIF + indicateur séparé. Le débit doit devenir négatif.
    const payload = {
      _embedded: {
        transactions: [
          { bookingDate: '2026-08-17', reference: 'FT26229L0Z0S', description: 'Bulk Payment', transactionAmount: { amount: '58072.00', currencyCode: 'MUR' }, creditDebitIndicator: 'DBIT', runningBalance: '21791.93' },
          { bookingDate: '2026-08-20', reference: 'FT26232SQBXT', description: 'Merchant Settlement', transactionAmount: { amount: '800.00', currencyCode: 'MUR' }, creditDebitIndicator: 'CRDT', runningBalance: '14568.93' },
        ],
      },
    }
    const txs = parseTransactions(findTransactionsInJson(payload))
    expect(txs[0]).toMatchObject({ amount: -58072, reference: 'FT26229L0Z0S' }) // débit → négatif
    expect(txs[1]).toMatchObject({ amount: 800, reference: 'FT26232SQBXT' })    // crédit → positif
  })

  it('détecte l’indicateur par valeur si la clé est atypique', () => {
    const payload = { data: [{ date: '2026-08-17', amount: '100.00', sens: 'DEBIT' }] }
    expect(parseTransactions(findTransactionsInJson(payload))[0].amount).toBe(-100)
  })

  it('un montant déjà signé n’est pas re-signé', () => {
    const payload = { data: [{ date: '2026-08-17', amount: '-42.00', creditDebitIndicator: 'DBIT' }] }
    expect(parseTransactions(findTransactionsInJson(payload))[0].amount).toBe(-42)
  })
})

describe('findStatementsInJson', () => {
  it('extrait les relevés + lien de téléchargement', () => {
    const payload = {
      _embedded: {
        documents: [
          { statementDate: '2026-07-31', type: 'Current account statement', name: 'Current Account statement', downloadUrl: 'https://ibpro.mcb.mu/api/doc/123.pdf' },
          { statementDate: '2026-06-30', type: 'Current account statement', name: 'Current Account statement', downloadUrl: 'https://ibpro.mcb.mu/api/doc/124.pdf' },
        ],
      },
    }
    const st = findStatementsInJson(payload)
    expect(st).toHaveLength(2)
    expect(st[0].dateGenerated).toBe('2026-07-31')
    expect(st[0].downloadHref).toBe('https://ibpro.mcb.mu/api/doc/123.pdf')
  })
})

describe('findArrangementIds — productsummary Backbase', () => {
  const PRODUCT_SUMMARY = {
    _embedded: {
      arrangements: [
        { id: 'b37e8d68-168b-4194-a1f9-74c8556f7436', BBAN: '000447954555', currency: 'MUR', bookedBalance: '14564.21' },
        { id: 'c48f9e79-279c-4285-b2a0-85d9667a8547', BBAN: '000447954587', currency: 'EUR', bookedBalance: '8926.87' },
      ],
    },
  }
  it('associe chaque numéro de compte à son arrangementId (UUID)', () => {
    const arr = findArrangementIds(PRODUCT_SUMMARY)
    expect(arr).toHaveLength(2)
    expect(arr.find((a) => a.number === '000447954555')!.id).toBe('b37e8d68-168b-4194-a1f9-74c8556f7436')
  })
  it('ignore un objet sans id d’arrangement', () => {
    expect(findArrangementIds({ BBAN: '000447954555' })).toEqual([])
  })
  it('ignore un id trop court non-UUID', () => {
    expect(findArrangementIds({ accountNumber: '000447954555', id: 'x1' })).toEqual([])
  })
  it('arrangementsFromCaptured dédoublonne par numéro', () => {
    const arr = arrangementsFromCaptured([
      { url: 'u1', status: 200, json: PRODUCT_SUMMARY },
      { url: 'u2', status: 200, json: PRODUCT_SUMMARY },
    ])
    expect(arr).toHaveLength(2)
  })
})

describe('isBankApiUrl', () => {
  it('reconnaît les URLs d’API pertinentes', () => {
    expect(isBankApiUrl('https://ibpro.mcb.mu/api/arrangement-manager/product-summary')).toBe(true)
    expect(isBankApiUrl('https://ibpro.mcb.mu/api/transaction-manager/transactions')).toBe(true)
    expect(isBankApiUrl('https://ibpro.mcb.mu/assets/logo.svg')).toBe(false)
  })
})

describe('extractFromCaptured — agrégation multi-réponses', () => {
  it('retient le meilleur résultat par type', () => {
    const res = extractFromCaptured([
      { url: 'https://ibpro.mcb.mu/api/arrangement-manager/products', status: 200, json: BACKBASE_ACCOUNTS },
      { url: 'https://ibpro.mcb.mu/api/transaction-manager/transactions', status: 200, json: BACKBASE_TX },
      { url: 'https://ibpro.mcb.mu/api/noise', status: 200, json: { nothing: true } },
    ])
    expect(res.accounts).toHaveLength(3)
    expect(res.transactions).toHaveLength(2)
  })
})
