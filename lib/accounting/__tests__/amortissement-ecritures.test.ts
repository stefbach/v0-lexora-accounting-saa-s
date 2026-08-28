import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  buildEcrituresDotation,
  createEcritureDotation,
  comptesAmortissement,
  refFolioAmortissement,
  type DotationInput,
} from '@/lib/accounting/amortissement-ecritures'

function makeInput(overrides: Partial<DotationInput> = {}): DotationInput {
  return {
    immobilisation_id: 'immo-1',
    societe_id: 'soc-1',
    designation: 'Ordinateur portable',
    categorie: 'materiel_informatique',
    exercice: '2024-2025',
    date_ecriture: '2025-06-30',
    dotation: 12500,
    ...overrides,
  }
}

function sums(l: Array<{ debit_mur: number; credit_mur: number }>) {
  return { debit: l.reduce((s, x) => s + x.debit_mur, 0), credit: l.reduce((s, x) => s + x.credit_mur, 0) }
}

describe('comptesAmortissement', () => {
  it('corporelles → 6811 ; incorporelles (logiciel) → 6812', () => {
    expect(comptesAmortissement('materiel_informatique').dotation).toBe('6811')
    expect(comptesAmortissement('logiciel').dotation).toBe('6812')
    expect(comptesAmortissement('mobilier').cumul).toBe('2815')
    expect(comptesAmortissement('vehicule').cumul).toBe('2818')
    expect(comptesAmortissement(undefined).dotation).toBe('6811') // fallback
  })
})

describe('buildEcrituresDotation', () => {
  it('D 6811 / C 2818, équilibrée, journal OD, ref AMORT-<id>-<exercice>', () => {
    const l = buildEcrituresDotation(makeInput())
    expect(l).toHaveLength(2)
    expect(l[0]).toMatchObject({ numero_compte: '6811', debit_mur: 12500, credit_mur: 0, journal: 'OD' })
    expect(l[1]).toMatchObject({ numero_compte: '2818', debit_mur: 0, credit_mur: 12500 })
    expect(l[0].ref_folio).toBe('AMORT-immo-1-2024-2025')
    expect(l[0].date_ecriture).toBe('2025-06-30')
    expect(l[0].exercice).toBe('2024')
    expect(sums(l)).toEqual({ debit: 12500, credit: 12500 })
  })

  it('la contrepartie est bien une classe 2 (contra-actif), jamais une charge', () => {
    const l = buildEcrituresDotation(makeInput({ categorie: 'mobilier' }))
    expect(l[1].numero_compte.startsWith('2')).toBe(true)
    expect(l[1].numero_compte).toBe('2815')
  })

  it('dotation nulle ou négative — aucune écriture', () => {
    expect(buildEcrituresDotation(makeInput({ dotation: 0 }))).toEqual([])
    expect(buildEcrituresDotation(makeInput({ dotation: -5 }))).toEqual([])
  })

  it('refFolioAmortissement', () => {
    expect(refFolioAmortissement('x', '2025-2026')).toBe('AMORT-x-2025-2026')
  })
})

describe('createEcritureDotation', () => {
  it('insère la dotation équilibrée avec dossier_id résolu', async () => {
    const supabase = createMockSupabase()
    supabase._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
    const res = await createEcritureDotation(supabase, makeInput())
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows).toHaveLength(2)
    expect(rows[0].dossier_id).toBe('doss-1')
    expect(sums(rows)).toEqual({ debit: 12500, credit: 12500 })
  })

  it('idempotent — pas de doublon pour le même immo+exercice', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      { id: 'e1', societe_id: 'soc-1', ref_folio: 'AMORT-immo-1-2024-2025' },
    ])
    const res = await createEcritureDotation(supabase, makeInput())
    expect(res).toEqual({ ok: true, nb_entries: 0, skipped: 'exists' })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(1)
  })

  it('dotation nulle — skip zero', async () => {
    const supabase = createMockSupabase()
    const res = await createEcritureDotation(supabase, makeInput({ dotation: 0 }))
    expect(res).toEqual({ ok: true, nb_entries: 0, skipped: 'zero' })
  })
})
