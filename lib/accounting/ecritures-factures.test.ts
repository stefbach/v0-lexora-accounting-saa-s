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
    const res = await createEcrituresForFacture(supabase, makeFacture({ societe_id: '' as any }))
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

  // ── Sprint 10 — écart de change réalisé sur paiement (IAS 21 §28) ───────
  it('cree une ecriture de PERTE de change (666) si client paie moins en MUR que la facture', async () => {
    // Facture client EUR : montant_mur figé à 5600 (taux T0=46×120ttc)
    // Paiement : amount_mur=5400 (taux T1<T0). Écart = -200 (perte).
    const supabase = createMockSupabase({
      tables: {
        dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }],
        factures: [
          {
            id: 'fac-eur-1',
            montant_mur: 5600,
            montant_ttc: 120,
            taux_change: 46,
            devise: 'EUR',
          },
        ],
      },
    })

    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-05-10',
      amount_mur: 5400,
      type: 'client',
      tiers: 'EU Co',
      ref_folio: 'BANK-rfx-1',
      compte_banque: '512200',
      facture_id: 'fac-eur-1',
      devise_origine: 'EUR',
      montant_origine: 120,
      taux_change_applique: 45,
    })
    expect(res.ok).toBe(true)

    const rows = supabase._state.tables['ecritures_comptables_v2']
    const fxLines = rows.filter(r => r.ref_folio === 'BANK-rfx-1-FX')
    expect(fxLines.length).toBe(2)
    const compteFx = fxLines.find(r => ['666', '766'].includes(r.numero_compte))!
    expect(compteFx.numero_compte).toBe('666')
    expect(compteFx.debit_mur).toBeCloseTo(200, 2)
    expect(compteFx.credit_mur).toBe(0)

    // Côté tier 411 : sens dépend de l'implémentation actuelle. On vérifie
    // simplement qu'une ligne de régularisation au montant abs(écart) existe.
    const ligne411Fx = fxLines.find(r => r.numero_compte === '411')!
    const total411 = (ligne411Fx.debit_mur || 0) + (ligne411Fx.credit_mur || 0)
    expect(total411).toBeCloseTo(200, 2)
  })

  it('cree une ecriture de GAIN de change (766) si on paie un fournisseur EUR moins cher', async () => {
    const supabase = createMockSupabase({
      tables: {
        dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }],
        factures: [
          {
            id: 'fac-eur-2',
            montant_mur: 4600,
            montant_ttc: 100,
            taux_change: 46,
            devise: 'EUR',
          },
        ],
      },
    })
    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-05-12',
      amount_mur: 4500,
      type: 'supplier',
      tiers: 'EU Vendor',
      ref_folio: 'BANK-rfx-2',
      compte_banque: '512200',
      facture_id: 'fac-eur-2',
      devise_origine: 'EUR',
      montant_origine: 100,
      taux_change_applique: 45,
    })
    expect(res.ok).toBe(true)

    const rows = supabase._state.tables['ecritures_comptables_v2']
    const fxLines = rows.filter(r => r.ref_folio === 'BANK-rfx-2-FX')
    expect(fxLines.length).toBe(2)
    const compteFx = fxLines.find(r => ['666', '766'].includes(r.numero_compte))!
    expect(compteFx.numero_compte).toBe('766')
    expect(compteFx.credit_mur).toBeCloseTo(100, 2)
    expect(compteFx.debit_mur).toBe(0)
  })

  it('ne cree PAS d\'ecart de change si paiement en MUR natif', async () => {
    const supabase = makeClient()
    supabase._seed('factures', [
      { id: 'fac-mur-1', montant_mur: 1150, montant_ttc: 1150, devise: 'MUR' },
    ])
    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-04-20',
      amount_mur: 1100,
      type: 'client',
      tiers: 'Cli',
      ref_folio: 'BANK-mur-1',
      facture_id: 'fac-mur-1',
    })
    expect(res.ok).toBe(true)
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.ref_folio === 'BANK-mur-1-FX')).toBe(false)
  })

  it('ne cree PAS d\'ecart de change si l\'ecart est negligeable (< 0.02 MUR)', async () => {
    const supabase = createMockSupabase({
      tables: {
        dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }],
        factures: [
          {
            id: 'fac-eur-3',
            montant_mur: 4600.005,
            montant_ttc: 100,
            taux_change: 46,
            devise: 'EUR',
          },
        ],
      },
    })
    const res = await createEcrituresForPayment(supabase, {
      societe_id: 'soc-1',
      date_payment: '2026-05-12',
      amount_mur: 4600.01,
      type: 'supplier',
      tiers: 'EU',
      ref_folio: 'BANK-tiny-1',
      facture_id: 'fac-eur-3',
      devise_origine: 'EUR',
      montant_origine: 100,
      taux_change_applique: 46,
    })
    expect(res.ok).toBe(true)
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.ref_folio === 'BANK-tiny-1-FX')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Sprint 10 — Sous-comptes auxiliaires par tiers (mig 226)
// ─────────────────────────────────────────────────────────────────────────
describe('createEcrituresForFacture — sous-comptes auxiliaires par tiers', () => {
  it('utilise un sous-compte 411<HASH> quand la RPC retourne une chaine', async () => {
    const supabase = createMockSupabase({
      tables: { dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }] },
      rpcs: {
        get_or_create_compte_auxiliaire: ({ p_type_facture }) => {
          const prefix = p_type_facture === 'client' ? '411' : '401'
          return `${prefix}AB12CD`
        },
      },
    })
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({ tiers: 'ACME Ltd' }),
    )
    expect(res.ok).toBe(true)
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.numero_compte === '411')).toBe(false)
    expect(rows.some(r => r.numero_compte === '411AB12CD')).toBe(true)
    const aux = rows.find(r => r.numero_compte === '411AB12CD')!
    expect(aux.nom_compte).toMatch(/ACME Ltd/)
  })

  it('utilise un sous-compte 401<HASH> pour facture fournisseur', async () => {
    const supabase = createMockSupabase({
      tables: { dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }] },
      rpcs: { get_or_create_compte_auxiliaire: () => '401XY9876' },
    })
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({ id: 'ff-aux', type_facture: 'fournisseur', tiers: 'Vendor SA' }),
    )
    expect(res.ok).toBe(true)
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.numero_compte === '401XY9876')).toBe(true)
    expect(rows.some(r => r.numero_compte === '401')).toBe(false)
  })

  it('fallback sur compte global quand la RPC est absente (env legacy)', async () => {
    const supabase = createMockSupabase({
      tables: { dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }] },
    })
    const res = await createEcrituresForFacture(supabase, makeFacture({ tiers: 'X' }))
    expect(res.ok).toBe(true)
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.numero_compte === '411')).toBe(true)
  })

  it('fallback sur compte global quand le tiers est vide', async () => {
    const calls: any[] = []
    const supabase = createMockSupabase({
      tables: { dossiers: [{ id: 'doss-1', societe_id: 'soc-1' }] },
      rpcs: {
        get_or_create_compte_auxiliaire: (args) => {
          calls.push(args)
          return '411NEVERUSED'
        },
      },
    })
    await createEcrituresForFacture(supabase, makeFacture({ tiers: '' }))
    expect(calls.length).toBe(0)
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.numero_compte === '411')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Sprint 10 — TDS Maurice sur facture fournisseur (Section 111A)
// ─────────────────────────────────────────────────────────────────────────
describe('createEcrituresForFacture — TDS sur facture fournisseur', () => {
  it('cree une ligne 4471 et reduit le credit 401 du montant TDS', async () => {
    const supabase = makeClient()
    const res = await createEcrituresForFacture(
      supabase,
      makeFacture({
        id: 'fac-tds-1',
        type_facture: 'fournisseur',
        tiers: 'Consultant Co',
        montant_ht: 10000,
        montant_tva: 1500,
        montant_ttc: 11500,
        ...({
          tds_montant: 500,
          tds_categorie: 'services_professionnels',
          tds_taux_pct: 5,
        } as any),
      }),
    )
    expect(res.ok).toBe(true)
    const rows = supabase._state.tables['ecritures_comptables_v2']
    const comptes = rows.map(r => r.numero_compte).sort()
    expect(comptes).toContain('4471')
    expect(comptes).toContain('607')
    expect(comptes).toContain('4456')

    const ligne401 = rows.find(r => r.numero_compte === '401')!
    expect(ligne401.credit_mur).toBeCloseTo(11000, 2)

    const ligne4471 = rows.find(r => r.numero_compte === '4471')!
    expect(ligne4471.credit_mur).toBeCloseTo(500, 2)
    expect(ligne4471.debit_mur).toBe(0)

    const totals = rows.reduce(
      (a, r) => ({
        d: a.d + Number(r.debit_mur || 0),
        c: a.c + Number(r.credit_mur || 0),
      }),
      { d: 0, c: 0 },
    )
    expect(totals.d).toBeCloseTo(totals.c, 2)
    expect(totals.d).toBeCloseTo(11500, 2)
  })

  it('n\'ajoute PAS de ligne 4471 si tds_montant est 0 ou absent', async () => {
    const supabase = makeClient()
    await createEcrituresForFacture(
      supabase,
      makeFacture({ id: 'fac-no-tds', type_facture: 'fournisseur' }),
    )
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.numero_compte === '4471')).toBe(false)
  })

  it('ignore un tds_montant negligeable (< 0.01)', async () => {
    const supabase = makeClient()
    await createEcrituresForFacture(
      supabase,
      makeFacture({
        id: 'fac-tds-0',
        type_facture: 'fournisseur',
        ...({ tds_montant: 0.005 } as any),
      }),
    )
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.some(r => r.numero_compte === '4471')).toBe(false)
  })

  it('porte la categorie et le taux TDS dans la description de la ligne 4471', async () => {
    const supabase = makeClient()
    await createEcrituresForFacture(
      supabase,
      makeFacture({
        id: 'fac-tds-desc',
        type_facture: 'fournisseur',
        tiers: 'Architect Ltd',
        montant_ht: 5000,
        montant_tva: 0,
        montant_ttc: 5000,
        ...({
          tds_montant: 250,
          tds_categorie: 'services_professionnels',
          tds_taux_pct: 5,
        } as any),
      }),
    )
    const rows = supabase._state.tables['ecritures_comptables_v2']
    const tds = rows.find(r => r.numero_compte === '4471')!
    expect(String(tds.description)).toMatch(/services_professionnels/)
    expect(String(tds.description)).toMatch(/5/)
    expect(String(tds.libelle)).toMatch(/Architect Ltd/)
  })
})
