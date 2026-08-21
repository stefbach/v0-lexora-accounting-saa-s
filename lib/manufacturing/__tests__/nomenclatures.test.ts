import { describe, it, expect } from 'vitest'
import {
  coutMatieresEstime,
  validateNomenclaturePayload,
} from '@/lib/manufacturing/nomenclatures'

const payloadValide = {
  produit_fini_id: 'pf-1',
  libelle: 'Table en bois',
  quantite_produite: 1,
  lignes: [
    { produit_composant_id: 'c-bois', quantite: 2, taux_perte_pct: 5, unite: 'm2' },
    { produit_composant_id: 'c-vis', quantite: 12, taux_perte_pct: 0 },
  ],
}

describe('validateNomenclaturePayload', () => {
  it('accepte un payload complet et normalise les valeurs', () => {
    const res = validateNomenclaturePayload(payloadValide)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.produit_fini_id).toBe('pf-1')
    expect(res.data.version).toBe('1')
    expect(res.data.quantite_produite).toBe(1)
    expect(res.data.lignes).toEqual([
      { produit_composant_id: 'c-bois', quantite: 2, taux_perte_pct: 5, unite: 'm2' },
      { produit_composant_id: 'c-vis', quantite: 12, taux_perte_pct: 0, unite: null },
    ])
  })

  it('quantite_produite par défaut = 1, arrondi 3 décimales des quantités', () => {
    const res = validateNomenclaturePayload({
      produit_fini_id: 'pf-1',
      lignes: [{ produit_composant_id: 'c-1', quantite: 1.23456 }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.quantite_produite).toBe(1)
    expect(res.data.lignes[0].quantite).toBe(1.235)
  })

  it('refuse le cycle direct (composant = produit fini)', () => {
    const res = validateNomenclaturePayload({
      produit_fini_id: 'pf-1',
      lignes: [{ produit_composant_id: 'pf-1', quantite: 1 }],
    })
    expect(res).toEqual({ ok: false, error: expect.stringContaining('BOM_CYCLE') })
  })

  it('refuse un composant en double', () => {
    const res = validateNomenclaturePayload({
      produit_fini_id: 'pf-1',
      lignes: [
        { produit_composant_id: 'c-1', quantite: 1 },
        { produit_composant_id: 'c-1', quantite: 2 },
      ],
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('double')
  })

  it.each([
    [null, 'Body JSON requis'],
    [{}, 'produit_fini_id requis'],
    [{ produit_fini_id: 'pf-1', lignes: [] }, 'Au moins un composant est requis'],
    [{ produit_fini_id: 'pf-1', quantite_produite: 0, lignes: [{ produit_composant_id: 'c', quantite: 1 }] }, 'quantite_produite'],
    [{ produit_fini_id: 'pf-1', lignes: [{ produit_composant_id: 'c', quantite: 0 }] }, 'quantite'],
    [{ produit_fini_id: 'pf-1', lignes: [{ produit_composant_id: 'c', quantite: 1, taux_perte_pct: 100 }] }, 'taux_perte_pct'],
    [{ produit_fini_id: 'pf-1', lignes: [{ produit_composant_id: 'c', quantite: 1, taux_perte_pct: -1 }] }, 'taux_perte_pct'],
    [{ produit_fini_id: 'pf-1', lignes: [{ quantite: 1 }] }, 'produit_composant_id'],
  ])('rejette payload invalide %#', (body, fragment) => {
    const res = validateNomenclaturePayload(body)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain(fragment)
  })
})

describe('coutMatieresEstime', () => {
  it('somme quantité × (1 + perte) × CUMP, par unité produite', () => {
    // 2 m² bois à 450 MUR avec 5% de perte + 12 vis à 2.5 MUR
    // = 2 × 1.05 × 450 + 12 × 2.5 = 945 + 30 = 975
    const cout = coutMatieresEstime(
      payloadValide.lignes.map((l) => ({ ...l, taux_perte_pct: l.taux_perte_pct ?? 0 })),
      { 'c-bois': 450, 'c-vis': 2.5 },
      1,
    )
    expect(cout).toBe(975)
  })

  it('divise par la quantité produite du lot (BOM pour N unités)', () => {
    // BOM pour 10 unités : 25 kg à 100 MUR → 2500 / 10 = 250 par unité
    const cout = coutMatieresEstime(
      [{ produit_composant_id: 'c-1', quantite: 25, taux_perte_pct: 0 }],
      { 'c-1': 100 },
      10,
    )
    expect(cout).toBe(250)
  })

  it('composant sans CUMP connu → 0, arrondi 4 décimales', () => {
    const cout = coutMatieresEstime(
      [
        { produit_composant_id: 'inconnu', quantite: 3, taux_perte_pct: 0 },
        { produit_composant_id: 'c-1', quantite: 1, taux_perte_pct: 0 },
      ],
      { 'c-1': 0.33333 },
      3,
    )
    expect(cout).toBe(0.1111)
  })

  it('lot non positif → erreur', () => {
    expect(() => coutMatieresEstime([], {}, 0)).toThrow('QUANTITE_INVALIDE')
  })
})
