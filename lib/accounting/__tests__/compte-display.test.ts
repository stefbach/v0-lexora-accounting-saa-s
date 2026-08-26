import { describe, it, expect } from 'vitest'
import { afficherCompte, posteIfrsLabel, ordrePosteIfrs, grouperParPosteIfrs } from '../compte-display'

describe('afficherCompte', () => {
  it('libellé seul par défaut (schéma neutre)', () => {
    expect(afficherCompte({ compte: '601', libelle: 'Achats de marchandises' })).toBe('Achats de marchandises')
  })
  it('repli sur le code si libellé absent', () => {
    expect(afficherCompte({ compte: '601', libelle: null })).toBe('601')
    expect(afficherCompte({ compte: '601', libelle: '  ' })).toBe('601')
  })
  it('modes code et code_libelle', () => {
    expect(afficherCompte({ compte: '601', libelle: 'Achats' }, 'code')).toBe('601')
    expect(afficherCompte({ compte: '601', libelle: 'Achats' }, 'code_libelle')).toBe('601 — Achats')
  })
})

describe('poste IFRS', () => {
  it('mappe les catégories connues', () => {
    expect(posteIfrsLabel('actif_courant')).toBe('Actifs courants')
    expect(posteIfrsLabel('charges')).toBe('Charges')
    expect(ordrePosteIfrs('actif_non_courant')).toBe(1)
    expect(ordrePosteIfrs('charges')).toBe(7)
  })
  it('catégorie inconnue → Autres, ordre 99', () => {
    expect(posteIfrsLabel(null)).toBe('Autres')
    expect(ordrePosteIfrs('xyz')).toBe(99)
  })
})

describe('grouperParPosteIfrs', () => {
  it('groupe et trie par ordre de présentation IFRS', () => {
    const g = grouperParPosteIfrs([
      { compte: '601', libelle: 'Achats', categorie_ifrs: 'charges' },
      { compte: '512', libelle: 'Banque', categorie_ifrs: 'actif_courant' },
      { compte: '701', libelle: 'Ventes', categorie_ifrs: 'produits' },
      { compte: '607', libelle: 'Services', categorie_ifrs: 'charges' },
    ])
    expect(g.map((x) => x.poste)).toEqual(['Actifs courants', 'Produits', 'Charges'])
    expect(g.find((x) => x.poste === 'Charges')!.comptes).toHaveLength(2)
  })
})
