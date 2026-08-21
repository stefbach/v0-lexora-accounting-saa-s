import { describe, it, expect } from 'vitest'
import {
  cumpApresEntree,
  valeurMouvement,
  valeurStock,
  rejouerMouvements,
} from '@/lib/inventaire/valorisation'

describe('cumpApresEntree', () => {
  it('stock vide — le CUMP repart du coût d\'entrée', () => {
    expect(cumpApresEntree(0, 0, 10, 25.5)).toBe(25.5)
  })

  it('stock négatif ou nul — repart du coût d\'entrée arrondi à 4 décimales', () => {
    expect(cumpApresEntree(-2, 100, 5, 12.34567)).toBe(12.3457)
  })

  it('moyenne pondérée classique', () => {
    // 10 @ 100 + 10 @ 200 → 150
    expect(cumpApresEntree(10, 100, 10, 200)).toBe(150)
  })

  it('pondération asymétrique avec arrondi 4 décimales', () => {
    // (3×10 + 1×20) / 4 = 12.5
    expect(cumpApresEntree(3, 10, 1, 20)).toBe(12.5)
    // (7×9.99 + 3×10.01)/10 = 9.996
    expect(cumpApresEntree(7, 9.99, 3, 10.01)).toBe(9.996)
  })

  it('précision décimale — pas de dérive float (0.1/0.2)', () => {
    // (1×0.1 + 2×0.2)/3 = 0.5/3 = 0.166666… → 0.1667
    expect(cumpApresEntree(1, 0.1, 2, 0.2)).toBe(0.1667)
  })

  it('quantité d\'entrée non positive — refusée', () => {
    expect(() => cumpApresEntree(10, 100, 0, 50)).toThrow(/QUANTITE_INVALIDE/)
    expect(() => cumpApresEntree(10, 100, -1, 50)).toThrow(/QUANTITE_INVALIDE/)
  })
})

describe('valeurMouvement / valeurStock', () => {
  it('arrondit au centime (half away from zero)', () => {
    expect(valeurMouvement(3, 33.335)).toBe(100.01)
    expect(valeurMouvement(0.5, 10.01)).toBe(5.01)
    expect(valeurStock(7, 9.996)).toBe(69.97)
  })

  it('quantités fractionnaires ×3 décimales', () => {
    expect(valeurMouvement(1.253, 100)).toBe(125.3)
  })
})

describe('rejouerMouvements', () => {
  it('journal vide — état zéro', () => {
    expect(rejouerMouvements([])).toEqual({ quantite: 0, cump: 0, valeur: 0 })
  })

  it('reconstruit quantité, CUMP et valeur après entrées/sorties', () => {
    const etat = rejouerMouvements([
      { type_mouvement: 'entree_achat', quantite: 10, cout_unitaire: 100 },
      { type_mouvement: 'entree_achat', quantite: 10, cout_unitaire: 200 },
      { type_mouvement: 'sortie_vente', quantite: 5 },
    ])
    expect(etat.quantite).toBe(15)
    expect(etat.cump).toBe(150)
    expect(etat.valeur).toBe(2250)
  })

  it('la sortie ne modifie pas le CUMP', () => {
    const etat = rejouerMouvements([
      { type_mouvement: 'entree_achat', quantite: 4, cout_unitaire: 25 },
      { type_mouvement: 'perte_casse', quantite: 3 },
    ])
    expect(etat).toEqual({ quantite: 1, cump: 25, valeur: 25 })
  })

  it('ajustement + sans coût fourni — valorisé au CUMP courant', () => {
    const etat = rejouerMouvements([
      { type_mouvement: 'entree_achat', quantite: 2, cout_unitaire: 50 },
      { type_mouvement: 'ajustement_inventaire_plus', quantite: 2 },
    ])
    expect(etat.cump).toBe(50)
    expect(etat.quantite).toBe(4)
  })

  it('stock insuffisant — levé comme dans la RPC', () => {
    expect(() =>
      rejouerMouvements([
        { type_mouvement: 'entree_achat', quantite: 1, cout_unitaire: 10 },
        { type_mouvement: 'sortie_vente', quantite: 2 },
      ]),
    ).toThrow(/STOCK_INSUFFISANT/)
  })

  it('quantité invalide ou type inconnu — levés', () => {
    expect(() =>
      rejouerMouvements([{ type_mouvement: 'entree_achat', quantite: 0, cout_unitaire: 10 }]),
    ).toThrow(/QUANTITE_INVALIDE/)
    expect(() =>
      rejouerMouvements([{ type_mouvement: 'teleportation' as never, quantite: 1 }]),
    ).toThrow(/TYPE_MOUVEMENT_INVALIDE/)
  })
})
