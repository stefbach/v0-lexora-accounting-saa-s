import { describe, it, expect } from 'vitest'
import { buildGrille } from './grille'

describe('buildGrille', () => {
  it('croise comptes × sections (direct + ventilé) avec part non affectée', () => {
    const g = buildGrille(
      [
        // 6411 salaires : 100000, dont 60000 direct sur section A
        { numero_compte: '6411', nom_compte: 'Salaires', debit_mur: 100000, credit_mur: 0, section_analytique_id: 'A' },
        // 606 : 40000 non tagué (ventilé plus bas)
        { numero_compte: '606', nom_compte: 'Fournitures', debit_mur: 40000, credit_mur: 0, section_analytique_id: null },
        // 706 produit : 200000 direct sur A
        { numero_compte: '706', nom_compte: 'Ventes', debit_mur: 0, credit_mur: 200000, section_analytique_id: 'A' },
      ],
      [
        { numero_compte: '606', nom_compte: 'Fournitures', section_analytique_id: 'A', montant: 25000 },
        { numero_compte: '606', nom_compte: 'Fournitures', section_analytique_id: 'B', montant: 10000 },
      ],
    )

    const c6411 = g.comptes.find((c) => c.numero_compte === '6411')!
    expect(c6411.nature).toBe('charge')
    expect(c6411.total).toBe(100000)
    expect(c6411.parSection['A']).toBe(100000)
    expect(c6411.non_affecte).toBe(0)

    const c606 = g.comptes.find((c) => c.numero_compte === '606')!
    expect(c606.total).toBe(40000)
    expect(c606.parSection['A']).toBe(25000)
    expect(c606.parSection['B']).toBe(10000)
    expect(c606.non_affecte).toBe(5000) // 40000 − 35000 ventilé

    const c706 = g.comptes.find((c) => c.numero_compte === '706')!
    expect(c706.nature).toBe('produit')
    expect(c706.parSection['A']).toBe(200000)

    // Totaux section A : charges 100000+25000, produits 200000, marge 75000
    expect(g.totauxSection['A'].charges).toBe(125000)
    expect(g.totauxSection['A'].produits).toBe(200000)
    expect(g.totauxSection['A'].marge).toBe(75000)
    // Section B : charges 10000 seulement
    expect(g.totauxSection['B'].charges).toBe(10000)
    expect(g.totauxSection['B'].marge).toBe(-10000)

    expect(g.total.charges).toBe(140000)
    expect(g.total.produits).toBe(200000)
    expect(g.total.charges_non_affectees).toBe(5000)
  })

  it('ignore les comptes hors classe 6/7', () => {
    const g = buildGrille(
      [{ numero_compte: '512', nom_compte: 'Banque', debit_mur: 9000, credit_mur: 0, section_analytique_id: 'A' }],
      [],
    )
    expect(g.comptes).toHaveLength(0)
  })

  it('trie les comptes par numéro', () => {
    const g = buildGrille(
      [
        { numero_compte: '706', nom_compte: 'V', debit_mur: 0, credit_mur: 10, section_analytique_id: null },
        { numero_compte: '601', nom_compte: 'A', debit_mur: 5, credit_mur: 0, section_analytique_id: null },
      ],
      [],
    )
    expect(g.comptes.map((c) => c.numero_compte)).toEqual(['601', '706'])
  })
})
