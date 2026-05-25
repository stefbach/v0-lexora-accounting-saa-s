import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  createEcrituresForFacture,
  createEcrituresForPayment,
  type FactureForEcritures,
} from '@/lib/accounting/ecritures-factures'

/**
 * Helpers — une facture minimale MUR valide, surchargeable par test.
 */
function makeFacture(overrides: Partial<FactureForEcritures> = {}): FactureForEcritures {
  return {
    id: 'fac-1',
    societe_id: 'soc-1',
    numero_facture: 'F-2026-001',
    tiers: 'ACME Ltd',
    date_facture: '2026-04-15',
    montant_ht: 1000,
    montant_tva: 150,
    montant_ttc: 1150,
    type_facture: 'client',
    ...overrides,
  }
}

function makeClient(opts: { withDossier?: boolean } = { withDossier: true }) {
  const mock = createMockSupabase()
  if (opts.withDossier) {
    mock._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
  }
  return mock
}

function sumDebitCredit(rows: any[]): { debit: number; credit: number } {
  return rows.reduce(
    (acc, r) => ({
      debit: acc.debit + (Number(r.debit_mur) || 0),
      credit: acc.credit + (Number(r.credit_mur) || 0),
    }),
    { debit: 0, credit: 0 },
  )
}

describe('createEcrituresForFacture', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('refuse une facture sans societe_id', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(supabase, makeFacture({ societe_id: '' as unknown as string }))
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/societe_id/i)
  })

  it('refuse une facture sans date_facture', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(supabase, makeFacture({ date_facture: '' }))
    expect(res.ok).toBe(false)
  })

  it('cree 3 ecritures equilibrees pour une facture CLIENT MUR standard', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(supabase, makeFacture())
    expect(res.ok).toBe(true)
    expect(res.nb_entries).toBe(3)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    expect(inserted).toHaveLength(3)

    const comptes = inserted.map(r => r.numero_compte).sort()
    expect(comptes).toEqual(['411', '4457', '706'])

    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)
    expect(debit).toBeCloseTo(1150, 2)

    const journal = new Set(inserted.map(r => r.journal))
    expect(journal).toEqual(new Set(['VTE']))
  })

  it('cree 3 ecritures equilibrees pour une facture FOURNISSEUR MUR standard', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({ id: 'fac-f1', type_facture: 'fournisseur' }),
    )
    expect(res.ok).toBe(true)
    expect(res.nb_entries).toBe(3)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    const comptes = inserted.map(r => r.numero_compte).sort()
    expect(comptes).toEqual(['401', '4456', '607'])

    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)

    const journal = new Set(inserted.map(r => r.journal))
    expect(journal).toEqual(new Set(['ACH']))
  })

  it('convertit une facture USD avec taux_change en MUR (fallback ttc*taux)', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({
        devise: 'USD',
        taux_change: 45,
        montant_ht: 100,
        montant_tva: 15,
        montant_ttc: 115,
        montant_mur: undefined,
      }),
    )
    expect(res.ok).toBe(true)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)

    const ligne411 = inserted.find(r => r.numero_compte === '411')!
    expect(ligne411.debit_mur).toBeCloseTo(115 * 45, 2)
  })

  it('utilise montant_mur pre-calcule quand fourni (facture EUR)', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({
        devise: 'EUR',
        taux_change: 46,
        montant_ht: 100,
        montant_tva: 20,
        montant_ttc: 120,
        montant_mur: 5600, // valeur pré-calculée, doit PRIMER sur taux_change
      }),
    )
    expect(res.ok).toBe(true)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    const ligne411 = inserted.find(r => r.numero_compte === '411')!
    expect(ligne411.debit_mur).toBeCloseTo(5600, 2)

    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)
    expect(debit).toBeCloseTo(5600, 2)
  })

  it('omet la ligne TVA quand TVA = 0 (facture HT pur)', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({ montant_ht: 1000, montant_tva: 0, montant_ttc: 1000 }),
    )
    expect(res.ok).toBe(true)
    expect(res.nb_entries).toBe(2)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    const comptes = inserted.map(r => r.numero_compte).sort()
    expect(comptes).toEqual(['411', '706'])
  })

  it('omet la ligne HT (706) quand HT = 0 et ttc = tva', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({ montant_ht: 0, montant_tva: 150, montant_ttc: 150 }),
    )
    expect(res.ok).toBe(true)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    const comptes = inserted.map(r => r.numero_compte).sort()
    // Pas de 706 car htMur = 0
    expect(comptes).not.toContain('706')
    expect(comptes).toContain('411')

    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)
  })

  it('est idempotent sur une facture deja lettree : 2e appel = nb_entries=0', async () => {
    const supabase = makeClient()
    const res1 = await createEcrituresForFacture(supabase, makeFacture())
    expect(res1.ok).toBe(true)
    expect(res1.nb_entries).toBe(3)

    // On simule un lettrage posterieur (par ex. par rapprochement bancaire).
    // Le code protege explicitement les ecritures lettrees contre la suppression,
    // donc le 2e appel doit detecter l'existant via byRef et renvoyer nb_entries=0.
    for (const row of supabase._state.tables['ecritures_comptables_v2']) {
      row.lettre = 'A'
    }

    const res2 = await createEcrituresForFacture(supabase, makeFacture())
    expect(res2.ok).toBe(true)
    expect(res2.nb_entries).toBe(0)
  })

  it('log un warning pour une devise etrangere sans taux_change ni montant_mur', async () => {
    const supabase = makeClient()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({ devise: 'USD', taux_change: undefined, montant_mur: undefined }),
    )
    expect(res.ok).toBe(true)
    expect(warn).toHaveBeenCalled()
    const msg = warn.mock.calls.map(c => c.join(' ')).join(' ')
    expect(msg).toMatch(/USD/)
  })

  it("propage l'erreur Supabase en cas d'echec d'insert", async () => {
    const supabase = createMockSupabase({
      tables: { dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }] },
      errorOn: ({ table, kind }) =>
        table === 'ecritures_comptables_v2' && kind === 'insert'
          ? { message: 'permission denied' }
          : null,
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createEcrituresForFacture(supabase, makeFacture())
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/permission/i)
    err.mockRestore()
  })

  it('pose ref_folio=FAC-<id> et facture_id sur toutes les ecritures', async () => {
    const supabase = makeClient()
    await createEcrituresForFacture(supabase, makeFacture())
    const inserted = supabase._state.tables['ecritures_comptables_v2']
    for (const row of inserted) {
      expect(row.ref_folio).toBe('FAC-fac-1')
      expect(row.facture_id).toBe('fac-1')
    }
  })

  it("deduit l'exercice de l'annee de date_facture", async () => {
    const supabase = makeClient()
    await createEcrituresForFacture(supabase, makeFacture({ date_facture: '2025-11-30' }))
    const inserted = supabase._state.tables['ecritures_comptables_v2']
    expect(inserted.every(r => r.exercice === '2025')).toBe(true)
  })

  it('fonctionne meme sans dossier (dossier_id = null)', async () => {
    const supabase = makeClient({ withDossier: false })
    const res = await createEcrituresForFacture(supabase, makeFacture())
    expect(res.ok).toBe(true)
    const inserted = supabase._state.tables['ecritures_comptables_v2']
    expect(inserted.every(r => r.dossier_id === null)).toBe(true)
  })

  it("preserve l'equilibre debit=credit meme avec montant_mur qui ne se divise pas exactement", async () => {
    const supabase = makeClient()
    // On simule des arrondis tordus — 1/3 × 3 ≠ 1 en float.
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({
        montant_ht: 100,
        montant_tva: 33.33,
        montant_ttc: 133.33,
        devise: 'USD',
        taux_change: 44.87,
        montant_mur: 5982.42, // forcé
      }),
    )
    expect(res.ok).toBe(true)
    const inserted = supabase._state.tables['ecritures_comptables_v2']
    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)
  })

  it("pose le bon journal VTE pour client et ACH pour fournisseur", async () => {
    const a = makeClient()
    await createEcrituresForFacture(a, makeFacture({ id: 'fc', type_facture: 'client' }))
    expect(a._state.tables['ecritures_comptables_v2'].every(r => r.journal === 'VTE')).toBe(true)

    const b = makeClient()
    await createEcrituresForFacture(b, makeFacture({ id: 'ff', type_facture: 'fournisseur' }))
    expect(b._state.tables['ecritures_comptables_v2'].every(r => r.journal === 'ACH')).toBe(true)
  })
})

describe('createEcrituresForPayment', () => {
  it('cree 2 ecritures BNQ equilibrees pour un paiement fournisseur', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-04-20',
      amount_mur: 1150,
      type: 'supplier',
      tiers: 'ACME Ltd',
      ref_folio: 'BANK-r1-0',
      compte_banque: '512100',
      facture_id: 'fac-1',
    })
    expect(res.ok).toBe(true)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    expect(inserted).toHaveLength(2)

    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)
    expect(debit).toBeCloseTo(1150, 2)

    const comptes = inserted.map(r => r.numero_compte).sort()
    expect(comptes).toEqual(['401', '512100'])

    // Le 401 est débité, la banque est créditée
    const l401 = inserted.find(r => r.numero_compte === '401')!
    const lBanque = inserted.find(r => r.numero_compte === '512100')!
    expect(l401.debit_mur).toBe(1150)
    expect(l401.credit_mur).toBe(0)
    expect(lBanque.credit_mur).toBe(1150)
    expect(lBanque.debit_mur).toBe(0)
  })

  it('cree 2 ecritures BNQ equilibrees pour un paiement client', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-04-20',
      amount_mur: 2300,
      type: 'client',
      tiers: 'CustoCo',
      ref_folio: 'BANK-r2-0',
      compte_banque: '512200',
    })
    expect(res.ok).toBe(true)

    const inserted = supabase._state.tables['ecritures_comptables_v2']
    const l411 = inserted.find(r => r.numero_compte === '411')!
    const lBanque = inserted.find(r => r.numero_compte === '512200')!
    expect(l411.credit_mur).toBe(2300)
    expect(lBanque.debit_mur).toBe(2300)

    const { debit, credit } = sumDebitCredit(inserted)
    expect(debit).toBeCloseTo(credit, 2)
  })

  it('utilise le compte banque par defaut "512" quand non fourni', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-04-20',
      amount_mur: 100,
      type: 'supplier',
      tiers: 'X',
      ref_folio: 'BANK-r3-0',
    })
    expect(res.ok).toBe(true)
    const inserted = supabase._state.tables['ecritures_comptables_v2']
    expect(inserted.some(r => r.numero_compte === '512')).toBe(true)
  })

  it('pose la lettre quand lettre_code est fourni', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-04-20',
      amount_mur: 1150,
      type: 'supplier',
      tiers: 'ACME Ltd',
      ref_folio: 'BANK-r4-0',
      compte_banque: '512100',
      facture_id: 'fac-1',
      lettre_code: 'A',
    })
    expect(res.ok).toBe(true)
    const inserted = supabase._state.tables['ecritures_comptables_v2']
    expect(inserted.every(r => r.lettre === 'A')).toBe(true)
    expect(inserted.every(r => r.date_lettrage === '2026-04-20')).toBe(true)
  })

  it('supprime les ecritures existantes portant le meme ref_folio avant insert', async () => {
    const supabase = makeClient()
    supabase._seed('ecritures_comptables_v2', [
      { id: 'old-1', societe_id: 'soc-1', ref_folio: 'BANK-r5-0', numero_compte: '401' },
    ])
    await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-04-20',
      amount_mur: 500,
      type: 'supplier',
      tiers: 'Y',
      ref_folio: 'BANK-r5-0',
    })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    // old-1 a été supprimée par le delete initial
    expect(rows.find(r => r.id === 'old-1')).toBeUndefined()
    expect(rows).toHaveLength(2)
  })
})
