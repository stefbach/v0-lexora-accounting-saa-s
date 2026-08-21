import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  buildEcrituresConsommationJob,
  buildEcrituresReclassementJob,
  createEcrituresForConsommationJob,
  createEcrituresForReclassementJob,
  refFolioConsommationJob,
  refFolioReclassementJob,
  type ConsommationJobPourEcritures,
  type ReclassementJobPourEcritures,
} from '@/lib/jobcosting/ecritures'

function sums(lignes: Array<{ debit_mur: number; credit_mur: number }>) {
  return {
    debit: lignes.reduce((s, l) => s + l.debit_mur, 0),
    credit: lignes.reduce((s, l) => s + l.credit_mur, 0),
  }
}

function makeConso(o: Partial<ConsommationJobPourEcritures> = {}): ConsommationJobPourEcritures {
  return {
    mouvement_id: 'mvt-1',
    societe_id: 'soc-1',
    job_id: 'job-1',
    valeur_mouvement: 850.5,
    date_mouvement: '2026-08-15',
    quantite: 5,
    designation: 'Câble 3G',
    sku: 'CAB-3G',
    ...o,
  }
}

describe('buildEcrituresConsommationJob', () => {
  it('D 6037 / C 3701, équilibrée, taggée job_id, ref STK-<id>', () => {
    const lignes = buildEcrituresConsommationJob(makeConso())
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({
      numero_compte: '6037',
      debit_mur: 850.5,
      credit_mur: 0,
      job_id: 'job-1',
      journal: 'OD',
      ref_folio: 'STK-mvt-1',
    })
    expect(lignes[1]).toMatchObject({ numero_compte: '3701', credit_mur: 850.5 })
    expect(sums(lignes)).toEqual({ debit: 850.5, credit: 850.5 })
  })

  it('respecte les comptes stock personnalisés du produit', () => {
    const lignes = buildEcrituresConsommationJob(
      makeConso({ compte_stock: '3100', compte_variation_stock: '6031' }),
    )
    expect(lignes[0].numero_compte).toBe('6031')
    expect(lignes[1].numero_compte).toBe('3100')
  })

  it('valeur nulle → aucune écriture', () => {
    expect(buildEcrituresConsommationJob(makeConso({ valeur_mouvement: 0 }))).toEqual([])
  })

  it('libellé porte produit, SKU et quantité', () => {
    const l = buildEcrituresConsommationJob(makeConso())[0]
    expect(l.libelle).toContain('Câble 3G')
    expect(l.libelle).toContain('CAB-3G')
    expect(l.libelle).toContain('5')
  })
})

describe('buildEcrituresReclassementJob', () => {
  it('D 6422 / C 6411, équilibrée, taggée job_id, ref JOBMO-<id>', () => {
    const lignes = buildEcrituresReclassementJob({
      job_id: 'job-1',
      societe_id: 'soc-1',
      code: 'JOB-014',
      montant: 12000,
      date_ecriture: '2026-08-31',
    })
    expect(lignes[0]).toMatchObject({ numero_compte: '6422', debit_mur: 12000, job_id: 'job-1' })
    expect(lignes[1]).toMatchObject({ numero_compte: '6411', credit_mur: 12000 })
    expect(lignes[0].ref_folio).toBe('JOBMO-job-1')
    expect(sums(lignes)).toEqual({ debit: 12000, credit: 12000 })
  })

  it('compte d\'origine personnalisable', () => {
    const lignes = buildEcrituresReclassementJob({
      job_id: 'j',
      societe_id: 's',
      code: 'C',
      montant: 100,
      date_ecriture: '2026-01-01',
      compte_origine: '6414',
    })
    expect(lignes[1].numero_compte).toBe('6414')
  })

  it('montant nul → aucune écriture', () => {
    const r: ReclassementJobPourEcritures = {
      job_id: 'j',
      societe_id: 's',
      code: 'C',
      montant: 0,
      date_ecriture: '2026-01-01',
    }
    expect(buildEcrituresReclassementJob(r)).toEqual([])
  })
})

describe('refFolio helpers', () => {
  it('préfixent correctement', () => {
    expect(refFolioConsommationJob('m1')).toBe('STK-m1')
    expect(refFolioReclassementJob('j1')).toBe('JOBMO-j1')
  })
})

describe('createEcrituresForConsommationJob', () => {
  it('insère la pièce équilibrée avec dossier_id résolu', async () => {
    const supabase = createMockSupabase()
    supabase._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
    const res = await createEcrituresForConsommationJob(supabase, makeConso())
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows).toHaveLength(2)
    expect(rows[0].dossier_id).toBe('doss-1')
    expect(rows[0].job_id).toBe('job-1')
    expect(sums(rows)).toEqual({ debit: 850.5, credit: 850.5 })
  })

  it('idempotent — pas de doublon si ref_folio déjà présent', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [{ id: 'e', societe_id: 'soc-1', ref_folio: 'STK-mvt-1' }])
    const res = await createEcrituresForConsommationJob(supabase, makeConso())
    expect(res).toEqual({ ok: true, nb_entries: 0 })
  })

  it('propage une erreur d\'insertion', async () => {
    const supabase = createMockSupabase({
      errorOn: ({ table, kind }) =>
        table === 'ecritures_comptables_v2' && kind === 'insert' ? { message: 'boom' } : null,
    })
    const res = await createEcrituresForConsommationJob(supabase, makeConso())
    expect(res.ok).toBe(false)
    expect(res.error).toBe('boom')
  })
})

describe('createEcrituresForReclassementJob', () => {
  it('insère le reclassement (dossier_id null accepté)', async () => {
    const supabase = createMockSupabase()
    const res = await createEcrituresForReclassementJob(supabase, {
      job_id: 'job-1',
      societe_id: 'soc-1',
      code: 'JOB-014',
      montant: 5000,
      date_ecriture: '2026-08-31',
    })
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(sums(rows)).toEqual({ debit: 5000, credit: 5000 })
  })

  it('montant nul → aucune insertion', async () => {
    const supabase = createMockSupabase()
    const res = await createEcrituresForReclassementJob(supabase, {
      job_id: 'j',
      societe_id: 's',
      code: 'C',
      montant: 0,
      date_ecriture: '2026-01-01',
    })
    expect(res).toEqual({ ok: true, nb_entries: 0 })
  })
})
