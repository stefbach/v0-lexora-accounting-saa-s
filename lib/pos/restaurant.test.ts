import { describe, it, expect } from 'vitest'
import { validateTablePayload, validateAdditionLignePayload, additionTotaux, additionLignesToVente } from './restaurant'

describe('validateTablePayload', () => {
  it('valide une table', () => {
    const r = validateTablePayload({ code: 'T1', nom: 'Terrasse 1', capacite: 4 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toMatchObject({ code: 'T1', capacite: 4 })
  })
  it('code requis, capacité > 0', () => {
    expect(validateTablePayload({ nom: 'x' }).ok).toBe(false)
    expect(validateTablePayload({ code: 'T1', capacite: -2 }).ok).toBe(false)
  })
})

describe('validateAdditionLignePayload', () => {
  it('utilise prix/tva par défaut du produit si absents', () => {
    const r = validateAdditionLignePayload({ produit_id: 'p1', quantite: 2 }, 250, 15)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toMatchObject({ prix_unitaire_ht: 250, taux_tva: 15, quantite: 2 })
  })
  it('refuse quantité ≤ 0 et remise hors bornes', () => {
    expect(validateAdditionLignePayload({ produit_id: 'p1', quantite: 0 }).ok).toBe(false)
    expect(validateAdditionLignePayload({ produit_id: 'p1', quantite: 1, remise_pct: 120 }).ok).toBe(false)
  })
})

describe('additionTotaux', () => {
  it('calcule HT/TVA/TTC comme le panier', () => {
    const t = additionTotaux([
      { quantite: 2, prix_unitaire_ht: 100, remise_pct: 0, taux_tva: 15 },
      { quantite: 1, prix_unitaire_ht: 50, remise_pct: 0, taux_tva: 15 },
    ])
    expect(t.total_ht).toBe(250)
    expect(t.total_tva).toBe(37.5)
    expect(t.total_ttc).toBe(287.5)
  })
})

describe('additionLignesToVente', () => {
  it('mappe vers le format p_lignes de la RPC', () => {
    const v = additionLignesToVente([{ produit_id: 'p1', quantite: 3, prix_unitaire_ht: 80, remise_pct: 10, taux_tva: 15 }])
    expect(v[0]).toEqual({ produit_id: 'p1', quantite: 3, prix_unitaire_ht: 80, remise_pct: 10, taux_tva: 15 })
  })
})
