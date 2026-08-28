import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  buildEcritureSoldeOuvertureBancaire,
  createEcritureSoldeOuvertureBancaire,
  refFolioAnBancaire,
  COMPTE_CONTREPARTIE_OUVERTURE,
  type SoldeOuvertureBancaireInput,
} from '@/lib/accounting/bank-opening-balance'

function makeInput(overrides: Partial<SoldeOuvertureBancaireInput> = {}): SoldeOuvertureBancaireInput {
  return {
    societe_id: 'soc-1',
    compte_bancaire_id: 'bank-1',
    compte_comptable: '512100',
    nom_banque: 'MCB Compte courant',
    solde_ouverture: 15000,
    date_ouverture: '2024-07-01',
    ...overrides,
  }
}

function sums(lignes: Array<{ debit_mur: number; credit_mur: number }>) {
  return {
    debit: lignes.reduce((s, l) => s + l.debit_mur, 0),
    credit: lignes.reduce((s, l) => s + l.credit_mur, 0),
  }
}

describe('buildEcritureSoldeOuvertureBancaire', () => {
  it('solde positif — D banque / C 1101, équilibré, journal AN', () => {
    const lignes = buildEcritureSoldeOuvertureBancaire(makeInput())
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({
      numero_compte: '512100',
      debit_mur: 15000,
      credit_mur: 0,
      journal: 'AN',
      ref_folio: 'ANBQ-bank-1',
      date_ecriture: '2024-07-01',
    })
    expect(lignes[1]).toMatchObject({
      numero_compte: COMPTE_CONTREPARTIE_OUVERTURE,
      debit_mur: 0,
      credit_mur: 15000,
    })
    expect(sums(lignes)).toEqual({ debit: 15000, credit: 15000 })
  })

  it('solde négatif (découvert) — D 1101 / C banque, valeur absolue', () => {
    const lignes = buildEcritureSoldeOuvertureBancaire(makeInput({ solde_ouverture: -3200.5 }))
    expect(lignes[0]).toMatchObject({ numero_compte: '512100', debit_mur: 0, credit_mur: 3200.5 })
    expect(lignes[1]).toMatchObject({ numero_compte: '1101', debit_mur: 3200.5, credit_mur: 0 })
    expect(sums(lignes)).toEqual({ debit: 3200.5, credit: 3200.5 })
  })

  it('solde nul — aucune écriture', () => {
    expect(buildEcritureSoldeOuvertureBancaire(makeInput({ solde_ouverture: 0 }))).toEqual([])
  })

  it('repli compte 512 si compte_comptable absent', () => {
    const lignes = buildEcritureSoldeOuvertureBancaire(makeInput({ compte_comptable: null }))
    expect(lignes[0].numero_compte).toBe('512')
  })

  it('refFolioAnBancaire', () => {
    expect(refFolioAnBancaire('abc')).toBe('ANBQ-abc')
  })
})

describe('createEcritureSoldeOuvertureBancaire', () => {
  it('insère l\'à-nouveau équilibré au 1er relevé', async () => {
    const supabase = createMockSupabase()
    supabase._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
    const res = await createEcritureSoldeOuvertureBancaire(supabase, makeInput())
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows).toHaveLength(2)
    expect(rows.every((r: any) => r.journal === 'AN')).toBe(true)
    expect(rows[0].dossier_id).toBe('doss-1')
    expect(sums(rows)).toEqual({ debit: 15000, credit: 15000 })
  })

  it('idempotent — pas de doublon si notre ref_folio existe déjà', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      { id: 'e-1', societe_id: 'soc-1', ref_folio: 'ANBQ-bank-1', journal: 'AN', numero_compte: '512100' },
    ])
    const res = await createEcritureSoldeOuvertureBancaire(supabase, makeInput())
    expect(res).toEqual({ ok: true, nb_entries: 0, skipped: 'exists' })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(1)
  })

  it('anti double-comptage — un à-nouveau onboarding touche déjà le compte banque', async () => {
    const supabase = createMockSupabase()
    // Solde d'ouverture déjà saisi via onboarding (journal AN, même compte, autre ref_folio)
    supabase._seed('ecritures_comptables_v2', [
      { id: 'e-onb', societe_id: 'soc-1', ref_folio: 'AN-ONBOARDING', journal: 'AN', numero_compte: '512100' },
    ])
    const res = await createEcritureSoldeOuvertureBancaire(supabase, makeInput())
    expect(res).toEqual({ ok: true, nb_entries: 0, skipped: 'onboarding' })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(1)
  })

  it('solde nul — skip zero', async () => {
    const supabase = createMockSupabase()
    const res = await createEcritureSoldeOuvertureBancaire(supabase, makeInput({ solde_ouverture: 0 }))
    expect(res).toEqual({ ok: true, nb_entries: 0, skipped: 'zero' })
  })
})
