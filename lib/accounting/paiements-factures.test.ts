import { describe, it, expect, vi } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import { enregistrerPaiement, annulerPaiement } from './paiements-factures'

// On stub createEcrituresForPayment pour ne pas re-tester la couche écriture
// (couverte par ecritures-factures.test.ts). On vérifie seulement qu'elle est
// appelée avec les bons arguments et que la ligne paiement est créée.
vi.mock('./ecritures-factures', () => ({
  createEcrituresForPayment: vi.fn(async () => ({
    ok: true,
    bnq_ids: ['bnq-1', 'bnq-2'],
  })),
}))

const FACTURE_BASE = {
  id: 'fac-1',
  societe_id: 'soc-1',
  numero_facture: 'F-001',
  tiers: 'ACME',
  type_facture: 'client' as const,
  devise: 'MUR',
  taux_change: 1,
  montant_ttc: 1000,
  montant_mur: 1000,
  solde_non_paye: 1000,
  statut: 'en_attente',
}

describe('enregistrerPaiement', () => {
  it('refuse un montant invalide', async () => {
    const supabase = createMockSupabase({ tables: { factures: [FACTURE_BASE] } })
    const res = await enregistrerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], {
      facture_id: 'fac-1',
      montant: 0,
      date_paiement: '2026-05-10',
      mode_paiement: 'virement',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Montant invalide/)
  })

  it("refuse si la facture est annulée", async () => {
    const supabase = createMockSupabase({
      tables: { factures: [{ ...FACTURE_BASE, statut: 'annule' }] },
    })
    const res = await enregistrerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], {
      facture_id: 'fac-1',
      montant: 500,
      date_paiement: '2026-05-10',
      mode_paiement: 'virement',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/annul/i)
  })

  it("refuse un paiement qui dépasse le solde dû", async () => {
    const supabase = createMockSupabase({
      tables: {
        factures: [{ ...FACTURE_BASE, solde_non_paye: 200 }],
      },
    })
    const res = await enregistrerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], {
      facture_id: 'fac-1',
      montant: 500,
      date_paiement: '2026-05-10',
      mode_paiement: 'virement',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/dépasse le solde/)
  })

  it('insère un paiement et appelle createEcrituresForPayment', async () => {
    const supabase = createMockSupabase({
      tables: { factures: [FACTURE_BASE] },
    })
    const res = await enregistrerPaiement(
      supabase as unknown as Parameters<typeof enregistrerPaiement>[0],
      {
        facture_id: 'fac-1',
        montant: 500,
        date_paiement: '2026-05-10',
        mode_paiement: 'virement',
        reference: 'VIR-123',
      },
      'user-1',
    )
    expect(res.ok).toBe(true)
    expect(res.paiement_id).toBeTruthy()
    expect(res.ecriture_id).toBe('bnq-1')

    const inserts = supabase._state.inserts.filter((i) => i.table === 'factures_paiements')
    expect(inserts).toHaveLength(1)
    const row = inserts[0].rows[0]
    expect(row.montant).toBe(500)
    expect(row.montant_mur).toBe(500)
    expect(row.source).toBe('manuel')
    expect(row.created_by).toBe('user-1')
    expect(row.reference).toBe('VIR-123')
  })

  it("convertit le montant en MUR avec le taux de change de la facture", async () => {
    const supabase = createMockSupabase({
      tables: {
        factures: [{
          ...FACTURE_BASE,
          devise: 'EUR',
          taux_change: 50,
          montant_ttc: 100,
          montant_mur: 5000,
          solde_non_paye: 5000,
        }],
      },
    })
    const res = await enregistrerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], {
      facture_id: 'fac-1',
      montant: 60,
      date_paiement: '2026-05-10',
      mode_paiement: 'virement',
    })
    expect(res.ok).toBe(true)
    const row = supabase._state.inserts.find((i) => i.table === 'factures_paiements')!.rows[0]
    expect(row.montant).toBe(60)
    expect(row.montant_mur).toBe(3000) // 60 EUR × 50
    expect(row.devise).toBe('EUR')
  })

  it("source='rapprochement' ne crée pas d'écriture", async () => {
    const { createEcrituresForPayment } = await import('./ecritures-factures')
    const supabase = createMockSupabase({
      tables: { factures: [FACTURE_BASE] },
    })
    vi.mocked(createEcrituresForPayment).mockClear()
    const res = await enregistrerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], {
      facture_id: 'fac-1',
      montant: 500,
      date_paiement: '2026-05-10',
      mode_paiement: 'virement',
      source: 'rapprochement',
      rapproche_releve_id: 'rel-1',
    })
    expect(res.ok).toBe(true)
    expect(createEcrituresForPayment).not.toHaveBeenCalled()
  })
})

describe('annulerPaiement', () => {
  it('refuse si paiement_id manquant', async () => {
    const supabase = createMockSupabase()
    const res = await annulerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], '')
    expect(res.ok).toBe(false)
  })

  it('supprime le paiement et les écritures BNQ associées (paiement manuel)', async () => {
    const supabase = createMockSupabase({
      tables: {
        factures_paiements: [
          { id: 'pay-1', facture_id: 'fac-1', societe_id: 'soc-1', source: 'manuel' },
        ],
      },
    })
    const res = await annulerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], 'pay-1')
    expect(res.ok).toBe(true)

    const ecrDel = supabase._state.deletes.filter((d) => d.table === 'ecritures_comptables_v2')
    expect(ecrDel).toHaveLength(1)
    const refFolioFilter = ecrDel[0].filters.find((f) => f.op === 'eq' && f.col === 'ref_folio')
    expect(refFolioFilter && (refFolioFilter as { val?: unknown }).val).toBe('PAY-pay-1')

    const paiementDel = supabase._state.deletes.filter((d) => d.table === 'factures_paiements')
    expect(paiementDel).toHaveLength(1)
  })

  it("ne supprime pas les écritures pour un paiement issu d'un rapprochement", async () => {
    const supabase = createMockSupabase({
      tables: {
        factures_paiements: [
          { id: 'pay-2', facture_id: 'fac-1', societe_id: 'soc-1', source: 'rapprochement' },
        ],
      },
    })
    const res = await annulerPaiement(supabase as unknown as Parameters<typeof enregistrerPaiement>[0], 'pay-2')
    expect(res.ok).toBe(true)
    const ecrDel = supabase._state.deletes.filter((d) => d.table === 'ecritures_comptables_v2')
    expect(ecrDel).toHaveLength(0)
  })
})
