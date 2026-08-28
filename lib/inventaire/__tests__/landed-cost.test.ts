import { describe, it, expect } from 'vitest'
import { repartirLandedCost, type LigneImport, type ChargeAnnexe } from '@/lib/inventaire/landed-cost'

const lignes: LigneImport[] = [
  { produit_id: 'A', quantite: 10, prix_unitaire_fob: 100 }, // FOB 1000
  { produit_id: 'B', quantite: 5, prix_unitaire_fob: 200 },  // FOB 1000
  { produit_id: 'C', quantite: 20, prix_unitaire_fob: 50 },  // FOB 1000
]
const charges: ChargeAnnexe[] = [
  { libelle: 'Fret maritime', montant: 600 },
  { libelle: 'Douane', montant: 300 },
] // total 900

describe('repartirLandedCost — par valeur', () => {
  it('répartit les charges au prorata de la valeur FOB (égales ici → 300 chacune)', () => {
    const r = repartirLandedCost(lignes, charges, 'valeur')
    expect(r.total_fob).toBe(3000)
    expect(r.total_charges).toBe(900)
    expect(r.total_landed).toBe(3900)
    expect(r.lignes.map(l => l.charges_reparties)).toEqual([300, 300, 300])
    // coût unitaire landed = (FOB + charges) / qté
    expect(r.lignes[0].cout_unitaire_landed).toBe(130) // 1300/10
    expect(r.lignes[1].cout_unitaire_landed).toBe(260) // 1300/5
    expect(r.lignes[2].cout_unitaire_landed).toBe(65)  // 1300/20
  })

  it('la somme des quote-parts = total charges (aucun centime perdu)', () => {
    const r = repartirLandedCost(
      [
        { produit_id: 'A', quantite: 3, prix_unitaire_fob: 33.33 },
        { produit_id: 'B', quantite: 3, prix_unitaire_fob: 33.33 },
        { produit_id: 'C', quantite: 3, prix_unitaire_fob: 33.34 },
      ],
      [{ libelle: 'Fret', montant: 100 }],
      'valeur',
    )
    const somme = r.lignes.reduce((s, l) => s + l.charges_reparties, 0)
    expect(Math.round(somme * 100) / 100).toBe(100)
  })
})

describe('repartirLandedCost — par quantité', () => {
  it('répartit au prorata des quantités (10/5/20 sur 35)', () => {
    const r = repartirLandedCost(lignes, charges, 'quantite')
    // 900 * 10/35 = 257.14 ; 900 * 5/35 = 128.57 ; 900 * 20/35 = 514.29 → réconcilié à 900
    const somme = r.lignes.reduce((s, l) => s + l.charges_reparties, 0)
    expect(Math.round(somme * 100) / 100).toBe(900)
    expect(r.lignes[2].charges_reparties).toBeGreaterThan(r.lignes[0].charges_reparties)
  })
})

describe('repartirLandedCost — cas limites', () => {
  it('aucune charge → coût landed = FOB', () => {
    const r = repartirLandedCost(lignes, [], 'valeur')
    expect(r.total_charges).toBe(0)
    expect(r.lignes[0].cout_unitaire_landed).toBe(100)
  })

  it('lève si une quantité ≤ 0', () => {
    expect(() => repartirLandedCost([{ produit_id: 'X', quantite: 0, prix_unitaire_fob: 10 }], charges)).toThrow()
  })

  it('poids nul (tout FOB à 0) → répartition égale', () => {
    const r = repartirLandedCost(
      [
        { produit_id: 'A', quantite: 1, prix_unitaire_fob: 0 },
        { produit_id: 'B', quantite: 1, prix_unitaire_fob: 0 },
      ],
      [{ libelle: 'Douane', montant: 50 }],
      'valeur',
    )
    const somme = r.lignes.reduce((s, l) => s + l.charges_reparties, 0)
    expect(Math.round(somme * 100) / 100).toBe(50)
  })

  it('liste vide → résultat vide', () => {
    const r = repartirLandedCost([], charges)
    expect(r.lignes).toEqual([])
    expect(r.total_landed).toBe(0)
  })
})
