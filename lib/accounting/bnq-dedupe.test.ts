import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import { safeInsertBnq, type EcritureCandidate } from '@/lib/accounting/bnq-dedupe'

function makeCandidate(overrides: Partial<EcritureCandidate> = {}): EcritureCandidate {
  return {
    societe_id: 'soc-1',
    dossier_id: 'doss-1',
    date_ecriture: '2026-04-15',
    journal: 'BNQ',
    numero_compte: '401',
    nom_compte: 'Fournisseurs',
    libelle: 'Paiement fournisseur ACME',
    debit_mur: 1000,
    credit_mur: 0,
    exercice: '2026',
    ...overrides,
  }
}

describe('safeInsertBnq', () => {
  it('insere normalement quand aucun doublon en DB', async () => {
    const supabase = createMockSupabase()
    const res = await safeInsertBnq(supabase, [makeCandidate()])
    expect(res.error).toBeNull()
    expect(res.skipped).toBe(0)
    expect(res.data).toHaveLength(1)
    expect(supabase._state.inserts).toHaveLength(1)
  })

  it('skippe une entree BNQ deja presente en DB (match cle complete)', async () => {
    const supabase = createMockSupabase()
    // Pré-peupler l'état DB avec un doublon parfait
    supabase._seed('ecritures_comptables_v2', [
      {
        id: 'existing-1',
        societe_id: 'soc-1',
        dossier_id: 'doss-1',
        journal: 'BNQ',
        numero_compte: '401',
        libelle: 'Paiement fournisseur ACME',
        debit_mur: 1000,
        credit_mur: 0,
        date_ecriture: '2026-04-15',
      },
    ])
    const res = await safeInsertBnq(supabase, [makeCandidate()])
    expect(res.skipped).toBe(1)
    expect(res.skipReasons[0]).toContain('déjà présent')
    // Aucun insert declenche
    expect(supabase._state.inserts).toHaveLength(0)
    // data est un array vide car toInsert etait vide
    expect(res.data).toEqual([])
  })

  it('skippe plusieurs doublons mais insere les nouvelles', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      {
        id: 'existing-1',
        societe_id: 'soc-1',
        dossier_id: 'doss-1',
        journal: 'BNQ',
        numero_compte: '401',
        libelle: 'Dup A',
        debit_mur: 100,
        credit_mur: 0,
        date_ecriture: '2026-04-15',
      },
      {
        id: 'existing-2',
        societe_id: 'soc-1',
        dossier_id: 'doss-1',
        journal: 'BNQ',
        numero_compte: '401',
        libelle: 'Dup B',
        debit_mur: 200,
        credit_mur: 0,
        date_ecriture: '2026-04-15',
      },
    ])
    const res = await safeInsertBnq(supabase, [
      makeCandidate({ libelle: 'Dup A', debit_mur: 100 }),
      makeCandidate({ libelle: 'Dup B', debit_mur: 200 }),
      makeCandidate({ libelle: 'New C', debit_mur: 300 }),
    ])
    expect(res.skipped).toBe(2)
    expect(res.skipReasons).toHaveLength(2)
    // Une seule nouvelle inseree
    expect(supabase._state.inserts).toHaveLength(1)
    expect(supabase._state.inserts[0].rows).toHaveLength(1)
    expect(supabase._state.inserts[0].rows[0].libelle).toBe('New C')
  })

  it('n\'applique PAS la dedup aux ecritures non-BNQ', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      {
        id: 'old-ach',
        societe_id: 'soc-1',
        dossier_id: 'doss-1',
        journal: 'ACH',
        numero_compte: '607',
        libelle: 'Achat',
        debit_mur: 1000,
        credit_mur: 0,
        date_ecriture: '2026-04-15',
      },
    ])
    const res = await safeInsertBnq(supabase, [
      makeCandidate({
        journal: 'ACH',
        numero_compte: '607',
        libelle: 'Achat',
        debit_mur: 1000,
      }),
    ])
    expect(res.skipped).toBe(0)
    expect(supabase._state.inserts).toHaveLength(1)
  })

  it('skippe par facture_id + compte + montant (regle anti-doublon renforcee)', async () => {
    const supabase = createMockSupabase()
    // Même facture_id mais libellé différent — la dédup facture_id doit capturer.
    supabase._seed('ecritures_comptables_v2', [
      {
        id: 'existing-fac',
        societe_id: 'soc-1',
        dossier_id: 'doss-1',
        journal: 'BNQ',
        facture_id: 'fac-42',
        numero_compte: '401',
        libelle: 'Paiement X — ACME',
        debit_mur: 1500,
        credit_mur: 0,
        date_ecriture: '2026-04-10',
      },
    ])
    const res = await safeInsertBnq(supabase, [
      makeCandidate({
        facture_id: 'fac-42',
        libelle: 'Règlement ACME — X', // libellé différent, mais même facture_id/cpte/direction
        debit_mur: 1500,
        credit_mur: 0,
        date_ecriture: '2026-04-12',
      }),
    ])
    expect(res.skipped).toBe(1)
    expect(res.skipReasons[0]).toContain('facture_id=fac-42')
  })

  it('skipDedup=true : insere meme une 2e BNQ sur la meme facture (paiement partiel)', async () => {
    const supabase = createMockSupabase()
    // Un 1er versement partiel existe déjà sur fac-99 (même compte/direction).
    supabase._seed('ecritures_comptables_v2', [
      {
        id: 'partiel-1',
        societe_id: 'soc-1',
        dossier_id: 'doss-1',
        journal: 'BNQ',
        facture_id: 'fac-99',
        numero_compte: '411',
        libelle: 'Règlement partiel FT-1',
        debit_mur: 0,
        credit_mur: 500,
        date_ecriture: '2026-04-10',
      },
    ])
    // Sans skipDedup, la règle facture_id écraserait ce 2e versement de même
    // montant. Avec skipDedup, on l'insère (idempotence gérée par ref_folio).
    const res = await safeInsertBnq(
      supabase,
      [
        makeCandidate({
          facture_id: 'fac-99',
          numero_compte: '411',
          libelle: 'Règlement partiel FT-1 (2)',
          debit_mur: 0,
          credit_mur: 500,
          date_ecriture: '2026-04-20',
        }),
      ],
      'ecritures_comptables_v2',
      { skipDedup: true },
    )
    expect(res.skipped).toBe(0)
    expect(supabase._state.inserts).toHaveLength(1)
    expect(supabase._state.inserts[0].rows).toHaveLength(1)
  })
})
