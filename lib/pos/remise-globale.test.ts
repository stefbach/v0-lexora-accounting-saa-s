import { describe, it, expect } from 'vitest'
import { tauxRemiseGlobale, appliquerRemiseGlobale, montantRemiseGlobale } from './remise-globale'
import { calculerTotaux, type LignePanier } from './panier'

const L = (over: Partial<LignePanier> = {}): LignePanier => ({
  produit_id: 'p', quantite: 1, prix_unitaire_ht: 100, remise_pct: 0, taux_tva: 15, ...over,
})

describe('tauxRemiseGlobale', () => {
  it('convertit un % direct en fraction', () => {
    expect(tauxRemiseGlobale([L()], { type: 'pct', valeur: 10 })).toBeCloseTo(0.1, 6)
  })
  it('convertit un montant en fraction du TTC avant', () => {
    // 1 ligne : HT 100, TVA 15, TTC 115. Remise 11.5 → 10 %.
    expect(tauxRemiseGlobale([L()], { type: 'montant', valeur: 11.5 })).toBeCloseTo(0.1, 6)
  })
  it('borne et ignore les valeurs nulles/négatives', () => {
    expect(tauxRemiseGlobale([L()], null)).toBe(0)
    expect(tauxRemiseGlobale([L()], { type: 'pct', valeur: 0 })).toBe(0)
    expect(tauxRemiseGlobale([L()], { type: 'pct', valeur: 150 })).toBe(1)
  })
})

describe('appliquerRemiseGlobale', () => {
  it('réduit le TTC du bon montant (remise %)', () => {
    const lignes = [L({ quantite: 2 }), L({ prix_unitaire_ht: 50 })]
    const avant = calculerTotaux(lignes).total_ttc // (200+15%) + (50+15%) = 230 + 57.5 = 287.5
    const nettes = appliquerRemiseGlobale(lignes, { type: 'pct', valeur: 10 })
    const apres = calculerTotaux(nettes).total_ttc
    expect(avant).toBe(287.5)
    expect(apres).toBeCloseTo(258.75, 2) // 287.5 × 0.9
  })
  it('se combine avec une remise de ligne existante', () => {
    // remise ligne 20 % + globale 10 % ⇒ effectif 1-(0.8×0.9)=0.28 ⇒ 28 %
    const nettes = appliquerRemiseGlobale([L({ remise_pct: 20 })], { type: 'pct', valeur: 10 })
    expect(nettes[0].remise_pct).toBeCloseTo(28, 4)
  })
  it('renvoie les lignes inchangées sans remise', () => {
    const lignes = [L()]
    expect(appliquerRemiseGlobale(lignes, null)).toBe(lignes)
  })
})

describe('montantRemiseGlobale', () => {
  it('égale la baisse de TTC', () => {
    const lignes = [L({ quantite: 2 }), L({ prix_unitaire_ht: 50 })] // TTC 287.5
    expect(montantRemiseGlobale(lignes, { type: 'pct', valeur: 10 })).toBeCloseTo(28.75, 2)
    expect(montantRemiseGlobale(lignes, { type: 'montant', valeur: 50 })).toBeCloseTo(50, 2)
  })
})
