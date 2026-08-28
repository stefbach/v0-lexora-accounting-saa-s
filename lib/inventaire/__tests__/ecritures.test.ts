import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  buildEcrituresMouvementStock,
  buildEcritureStockInitial,
  contrepartieMouvement,
  createEcrituresForMouvementStock,
  createEcritureStockInitial,
  refFolioMouvement,
  nomCompteStock,
  COMPTE_CONTREPARTIE_OUVERTURE,
  type MouvementPourEcritures,
} from '@/lib/inventaire/ecritures'
import type { TypeMouvement } from '@/lib/inventaire/types'

const produit = { designation: 'Ciment 25kg', sku: 'CIM-25' }

function makeMouvement(overrides: Partial<MouvementPourEcritures> = {}): MouvementPourEcritures {
  return {
    id: 'mvt-1',
    societe_id: 'soc-1',
    dossier_id: null,
    type_mouvement: 'entree_achat',
    valeur_mouvement: 1000,
    date_mouvement: '2026-08-15',
    quantite: 10,
    ...overrides,
  }
}

function sums(lignes: Array<{ debit_mur: number; credit_mur: number }>) {
  return {
    debit: lignes.reduce((s, l) => s + l.debit_mur, 0),
    credit: lignes.reduce((s, l) => s + l.credit_mur, 0),
  }
}

describe('contrepartieMouvement', () => {
  const comptes = { stock: '3701', variation: '6037' }
  const attendu: Array<[TypeMouvement, string | null, string | null]> = [
    ['entree_achat', '3701', '6037'],
    ['retour_client', '3701', '6037'],
    ['sortie_vente', '6037', '3701'],
    ['retour_fournisseur', '6037', '3701'],
    ['ajustement_inventaire_plus', '3701', '6588'],
    ['ajustement_inventaire_moins', '6588', '3701'],
    ['perte_casse', '6586', '3701'],
    ['transfert_sortie', null, null],
    ['transfert_entree', null, null],
  ]
  it.each(attendu)('%s → D %s / C %s', (type, debit, credit) => {
    const c = contrepartieMouvement(type, comptes)
    if (debit === null) {
      expect(c).toBeNull()
    } else {
      expect(c).toEqual({ debit, credit })
    }
  })
})

describe('buildEcrituresMouvementStock', () => {
  it('entrée d\'achat — D 3701 / C 6037, équilibrée, ref_folio STK-<id>', () => {
    const lignes = buildEcrituresMouvementStock(makeMouvement(), produit)
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({
      numero_compte: '3701',
      nom_compte: 'Stock de marchandises',
      debit_mur: 1000,
      credit_mur: 0,
      journal: 'OD',
      ref_folio: 'STK-mvt-1',
      exercice: '2026',
      date_ecriture: '2026-08-15',
    })
    expect(lignes[1]).toMatchObject({
      numero_compte: '6037',
      nom_compte: 'Variation des stocks de marchandises',
      debit_mur: 0,
      credit_mur: 1000,
    })
    expect(sums(lignes)).toEqual({ debit: 1000, credit: 1000 })
  })

  it('sortie vente (COGS au CUMP) — D 6037 / C 3701', () => {
    const lignes = buildEcrituresMouvementStock(
      makeMouvement({ type_mouvement: 'sortie_vente', valeur_mouvement: 450.55 }),
      produit,
    )
    expect(lignes[0]).toMatchObject({ numero_compte: '6037', debit_mur: 450.55 })
    expect(lignes[1]).toMatchObject({ numero_compte: '3701', credit_mur: 450.55 })
    expect(sums(lignes)).toEqual({ debit: 450.55, credit: 450.55 })
  })

  it('perte/casse — D 6586 / C 3701 ; écart inventaire — 6588', () => {
    const casse = buildEcrituresMouvementStock(makeMouvement({ type_mouvement: 'perte_casse' }), produit)
    expect(casse[0].numero_compte).toBe('6586')
    expect(casse[0].nom_compte).toBe('Pertes sur stocks')

    const ecartMoins = buildEcrituresMouvementStock(
      makeMouvement({ type_mouvement: 'ajustement_inventaire_moins' }),
      produit,
    )
    expect(ecartMoins[0].numero_compte).toBe('6588')
    expect(ecartMoins[1].numero_compte).toBe('3701')

    const ecartPlus = buildEcrituresMouvementStock(
      makeMouvement({ type_mouvement: 'ajustement_inventaire_plus' }),
      produit,
    )
    expect(ecartPlus[0].numero_compte).toBe('3701')
    expect(ecartPlus[1].numero_compte).toBe('6588')
  })

  it('respecte les comptes personnalisés du produit', () => {
    const lignes = buildEcrituresMouvementStock(makeMouvement(), {
      ...produit,
      compte_stock: '3702',
      compte_variation_stock: '6038',
    })
    expect(lignes[0].numero_compte).toBe('3702')
    expect(lignes[0].nom_compte).toBe('Compte 3702')
    expect(lignes[1].numero_compte).toBe('6038')
  })

  it('transfert ou valeur nulle — aucune écriture', () => {
    expect(buildEcrituresMouvementStock(makeMouvement({ type_mouvement: 'transfert_sortie' }), produit)).toEqual([])
    expect(buildEcrituresMouvementStock(makeMouvement({ valeur_mouvement: 0 }), produit)).toEqual([])
  })

  it('libellé porte produit, SKU et quantité', () => {
    const lignes = buildEcrituresMouvementStock(makeMouvement(), produit)
    expect(lignes[0].libelle).toContain('Ciment 25kg')
    expect(lignes[0].libelle).toContain('CIM-25')
    expect(lignes[0].libelle).toContain('10')
  })
})

describe('buildEcritureStockInitial (à-nouveau — anti profit fictif)', () => {
  it('impute D stock / C 1101 (report à nouveau), journal AN — jamais un compte de charge 6xxx', () => {
    const lignes = buildEcritureStockInitial(makeMouvement(), produit)
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({
      numero_compte: '3701',
      debit_mur: 1000,
      credit_mur: 0,
      journal: 'AN',
      ref_folio: 'STK-mvt-1',
    })
    expect(lignes[1]).toMatchObject({
      numero_compte: COMPTE_CONTREPARTIE_OUVERTURE,
      debit_mur: 0,
      credit_mur: 1000,
      journal: 'AN',
    })
    // La contrepartie ne doit JAMAIS être une charge (classe 6) : c'est ce qui
    // créait un résultat fictif égal à la valeur du stock.
    expect(lignes[1].numero_compte.startsWith('6')).toBe(false)
    expect(sums(lignes)).toEqual({ debit: 1000, credit: 1000 })
  })

  it('date l\'écriture à la date d\'ouverture d\'exercice fournie (pas la date d\'import)', () => {
    const lignes = buildEcritureStockInitial(
      makeMouvement({ date_mouvement: '2026-08-27' }),
      produit,
      { dateOuverture: '2024-07-01' },
    )
    expect(lignes[0].date_ecriture).toBe('2024-07-01')
    expect(lignes[0].exercice).toBe('2024')
    expect(lignes[1].date_ecriture).toBe('2024-07-01')
  })

  it('respecte le compte de stock personnalisé et une contrepartie custom', () => {
    const lignes = buildEcritureStockInitial(
      makeMouvement(),
      { ...produit, compte_stock: '3702' },
      { compteContrepartie: '110' },
    )
    expect(lignes[0].numero_compte).toBe('3702')
    expect(lignes[1].numero_compte).toBe('110')
  })

  it('valeur nulle — aucune écriture', () => {
    expect(buildEcritureStockInitial(makeMouvement({ valeur_mouvement: 0 }), produit)).toEqual([])
  })
})

describe('createEcritureStockInitial', () => {
  it('insère l\'à-nouveau équilibré (journal AN) avec dossier_id résolu', async () => {
    const supabase = createMockSupabase()
    supabase._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
    const res = await createEcritureStockInitial(supabase, makeMouvement(), produit, {
      dateOuverture: '2024-07-01',
    })
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows).toHaveLength(2)
    expect(rows.every((r: any) => r.journal === 'AN')).toBe(true)
    expect(rows.find((r: any) => r.numero_compte === COMPTE_CONTREPARTIE_OUVERTURE)).toBeTruthy()
    expect(rows.every((r: any) => r.date_ecriture === '2024-07-01')).toBe(true)
    expect(sums(rows)).toEqual({ debit: 1000, credit: 1000 })
  })

  it('idempotent — pas de doublon si le ref_folio existe déjà', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      { id: 'e-1', societe_id: 'soc-1', ref_folio: 'STK-mvt-1' },
    ])
    const res = await createEcritureStockInitial(supabase, makeMouvement(), produit)
    expect(res).toEqual({ ok: true, nb_entries: 0 })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(1)
  })
})

describe('createEcrituresForMouvementStock', () => {
  it('insère la pièce équilibrée avec dossier_id résolu', async () => {
    const supabase = createMockSupabase()
    supabase._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
    const res = await createEcrituresForMouvementStock(supabase, makeMouvement(), produit)
    expect(res).toEqual({ ok: true, nb_entries: 2 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows).toHaveLength(2)
    expect(rows[0].dossier_id).toBe('doss-1')
    expect(rows[0].ref_folio).toBe('STK-mvt-1')
    expect(sums(rows)).toEqual({ debit: 1000, credit: 1000 })
  })

  it('idempotent — pas de doublon si le ref_folio existe déjà', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [
      { id: 'e-1', societe_id: 'soc-1', ref_folio: 'STK-mvt-1' },
    ])
    const res = await createEcrituresForMouvementStock(supabase, makeMouvement(), produit)
    expect(res).toEqual({ ok: true, nb_entries: 0 })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(1)
  })

  it('transfert — ok sans écriture', async () => {
    const supabase = createMockSupabase()
    const res = await createEcrituresForMouvementStock(
      supabase,
      makeMouvement({ type_mouvement: 'transfert_entree' }),
      produit,
    )
    expect(res).toEqual({ ok: true, nb_entries: 0 })
  })

  it('propage l\'erreur d\'insertion', async () => {
    const supabase = createMockSupabase({
      errorOn: ({ table, kind }) =>
        table === 'ecritures_comptables_v2' && kind === 'insert' ? { message: 'boom' } : null,
    })
    const res = await createEcrituresForMouvementStock(supabase, makeMouvement(), produit)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('boom')
  })
})

describe('helpers', () => {
  it('refFolioMouvement / nomCompteStock', () => {
    expect(refFolioMouvement('abc')).toBe('STK-abc')
    expect(nomCompteStock('6588')).toBe("Écarts d'inventaire")
    expect(nomCompteStock('9999')).toBe('Compte 9999')
  })
})
