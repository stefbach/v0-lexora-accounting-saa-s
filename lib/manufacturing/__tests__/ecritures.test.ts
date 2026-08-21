import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  buildEcrituresConsommationOF,
  buildEcrituresProductionOF,
  createEcrituresConsommationOF,
  createEcrituresProductionOF,
  nomCompteManufacturing,
  refFolioConsommationOF,
  refFolioProductionOF,
  type ConsommationPourEcritures,
} from '@/lib/manufacturing/ecritures'

const of = { id: 'of-1', societe_id: 'soc-1', dossier_id: null, numero_of: 'OF-2026-0001' }
const DATE = '2026-08-21'

function conso(over: Partial<ConsommationPourEcritures> = {}): ConsommationPourEcritures {
  return {
    compte_stock: '3100',
    designation: 'Bois',
    sku: 'BOIS-M2',
    valeur_theorique: 945,
    valeur_reelle: 945,
    ...over,
  }
}

function sums(lignes: Array<{ debit_mur: number; credit_mur: number }>) {
  return {
    debit: lignes.reduce((s, l) => s + l.debit_mur, 0),
    credit: lignes.reduce((s, l) => s + l.credit_mur, 0),
  }
}

describe('buildEcrituresConsommationOF', () => {
  it('sans écart — D 3300 / C 3100, équilibrée, ref_folio OF-<id>-CONSO', () => {
    const lignes = buildEcrituresConsommationOF(of, [conso()], DATE)
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({
      numero_compte: '3300',
      nom_compte: 'En-cours de production',
      debit_mur: 945,
      credit_mur: 0,
      journal: 'OD',
      ref_folio: 'OF-of-1-CONSO',
      date_ecriture: DATE,
      exercice: '2026',
    })
    expect(lignes[1]).toMatchObject({ numero_compte: '3100', credit_mur: 945, debit_mur: 0 })
    expect(sums(lignes)).toEqual({ debit: 945, credit: 945 })
  })

  it('surconsommation — l\'écart part au DÉBIT de 6586, pièce équilibrée', () => {
    // théorique 945, réel 967.50 → D 3300 945 / D 6586 22.50 / C 3100 967.50
    const lignes = buildEcrituresConsommationOF(of, [conso({ valeur_reelle: 967.5 })], DATE)
    expect(lignes).toHaveLength(3)
    const ecart = lignes.find((l) => l.numero_compte === '6586')!
    expect(ecart.debit_mur).toBe(22.5)
    expect(ecart.credit_mur).toBe(0)
    expect(lignes.find((l) => l.numero_compte === '3300')!.debit_mur).toBe(945)
    expect(lignes.find((l) => l.numero_compte === '3100')!.credit_mur).toBe(967.5)
    expect(sums(lignes)).toEqual({ debit: 967.5, credit: 967.5 })
  })

  it('sous-consommation — contre-passation au CRÉDIT de 6586', () => {
    // théorique 945, réel 900 → D 3300 945 / C 3100 900 / C 6586 45
    const lignes = buildEcrituresConsommationOF(of, [conso({ valeur_reelle: 900 })], DATE)
    const ecart = lignes.find((l) => l.numero_compte === '6586')!
    expect(ecart.credit_mur).toBe(45)
    expect(ecart.debit_mur).toBe(0)
    expect(sums(lignes)).toEqual({ debit: 945, credit: 945 })
  })

  it('groupe les crédits stock par compte (3100 marchandises + 3701 défaut)', () => {
    const lignes = buildEcrituresConsommationOF(
      of,
      [
        conso({ valeur_theorique: 500, valeur_reelle: 500 }),
        conso({ compte_stock: '3100', sku: 'COLLE', valeur_theorique: 100, valeur_reelle: 100 }),
        conso({ compte_stock: '3701', sku: 'VIS', valeur_theorique: 30, valeur_reelle: 30 }),
      ],
      DATE,
    )
    expect(lignes).toHaveLength(3) // 3300 + 3100 groupé + 3701
    expect(lignes.find((l) => l.numero_compte === '3300')!.debit_mur).toBe(630)
    expect(lignes.find((l) => l.numero_compte === '3100')!.credit_mur).toBe(600)
    expect(lignes.find((l) => l.numero_compte === '3701')!.credit_mur).toBe(30)
    expect(sums(lignes)).toEqual({ debit: 630, credit: 630 })
  })

  it('valeurs nulles — aucune écriture', () => {
    expect(
      buildEcrituresConsommationOF(of, [conso({ valeur_theorique: 0, valeur_reelle: 0 })], DATE),
    ).toEqual([])
  })
})

describe('buildEcrituresProductionOF', () => {
  const produitFini = { designation: 'Table', sku: 'TBL-01', compte_stock: '3500' }

  it('D 3500 / C 3300 au montant exact imputé à l\'en-cours (3300 soldé)', () => {
    const consoLignes = buildEcrituresConsommationOF(of, [conso()], DATE)
    const debit3300 = consoLignes.find((l) => l.numero_compte === '3300')!.debit_mur

    const prod = buildEcrituresProductionOF(of, produitFini, debit3300, 10, DATE)
    expect(prod).toHaveLength(2)
    expect(prod[0]).toMatchObject({
      numero_compte: '3500',
      nom_compte: 'Produits finis',
      debit_mur: 945,
      ref_folio: 'OF-of-1-PROD',
      journal: 'OD',
    })
    expect(prod[1]).toMatchObject({ numero_compte: '3300', credit_mur: 945 })
    // Solde 3300 de l'OF : débit CONSO − crédit PROD = 0
    expect(debit3300 - prod[1].credit_mur).toBe(0)
  })

  it('compte de stock du produit fini par défaut = 3500', () => {
    const prod = buildEcrituresProductionOF(of, { designation: 'T', sku: 'T', compte_stock: null }, 100, 1, DATE)
    expect(prod[0].numero_compte).toBe('3500')
  })

  it('montant nul — aucune écriture ; libellé porte produit et quantité', () => {
    expect(buildEcrituresProductionOF(of, produitFini, 0, 5, DATE)).toEqual([])
    const prod = buildEcrituresProductionOF(of, produitFini, 100, 5, DATE)
    expect(prod[0].libelle).toContain('TBL-01')
    expect(prod[0].libelle).toContain('OF-2026-0001')
    expect(prod[0].libelle).toContain('5')
  })
})

describe('createEcrituresConsommationOF / createEcrituresProductionOF', () => {
  it('insère la pièce avec dossier_id résolu', async () => {
    const supabase = createMockSupabase()
    supabase._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
    const res = await createEcrituresConsommationOF(supabase, of, [conso()], DATE)
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows).toHaveLength(2)
    expect(rows[0].dossier_id).toBe('doss-1')
    expect(rows[0].ref_folio).toBe('OF-of-1-CONSO')
    expect(sums(rows)).toEqual({ debit: 945, credit: 945 })
  })

  it('idempotent par ref_folio — pas de doublon', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      { id: 'e-1', societe_id: 'soc-1', ref_folio: 'OF-of-1-CONSO' },
    ])
    const res = await createEcrituresConsommationOF(supabase, of, [conso()], DATE)
    expect(res).toEqual({ ok: true, nb_entries: 0 })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(1)
  })

  it('production — insertion et idempotence distincte de la consommation', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      { id: 'e-1', societe_id: 'soc-1', ref_folio: 'OF-of-1-CONSO' },
    ])
    const res = await createEcrituresProductionOF(
      supabase, of, { designation: 'Table', sku: 'TBL-01', compte_stock: '3500' }, 945, 10, DATE,
    )
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows.filter((r: any) => r.ref_folio === 'OF-of-1-PROD')).toHaveLength(2)
  })

  it('propage l\'erreur d\'insertion', async () => {
    const supabase = createMockSupabase({
      errorOn: ({ table, kind }) =>
        table === 'ecritures_comptables_v2' && kind === 'insert' ? { message: 'boom' } : null,
    })
    const res = await createEcrituresProductionOF(
      supabase, of, { designation: 'T', sku: 'T' }, 100, 1, DATE,
    )
    expect(res).toEqual({ ok: false, nb_entries: 0, error: 'boom' })
  })
})

describe('helpers', () => {
  it('refFolio / noms de comptes', () => {
    expect(refFolioConsommationOF('x')).toBe('OF-x-CONSO')
    expect(refFolioProductionOF('x')).toBe('OF-x-PROD')
    expect(nomCompteManufacturing('3300')).toBe('En-cours de production')
    expect(nomCompteManufacturing('7131')).toBe('Production stockée')
    expect(nomCompteManufacturing('3701')).toBe('Stock de marchandises') // délègue au socle
    expect(nomCompteManufacturing('9999')).toBe('Compte 9999')
  })
})
