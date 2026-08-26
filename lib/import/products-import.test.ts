import { describe, it, expect } from 'vitest'
import {
  normalizeHeader,
  autoMapHeaders,
  parseLooseNumber,
  coerceProductRow,
  buildTemplateAoA,
  PRODUCT_IMPORT_FIELDS,
} from './products-import'

describe('normalizeHeader', () => {
  it('minuscule, sans accents ni séparateurs', () => {
    expect(normalizeHeader('Désignation')).toBe('designation')
    expect(normalizeHeader('Prix vente HT')).toBe('prixventeht')
    expect(normalizeHeader('Code-barres')).toBe('codebarres')
    expect(normalizeHeader('  Catégorie  ')).toBe('categorie')
  })
})

describe('autoMapHeaders', () => {
  it('mappe les en-têtes FR usuels vers les colonnes canoniques', () => {
    const map = autoMapHeaders(['Référence', 'Désignation', 'Prix', 'TVA', 'Stock', 'Catégorie'])
    expect(map).toEqual(['sku', 'designation', 'prix_vente_ht', 'taux_tva', 'stock_initial', 'categorie'])
  })
  it('mappe des alias EN', () => {
    const map = autoMapHeaders(['sku', 'name', 'price', 'qty', 'barcode'])
    expect(map).toEqual(['sku', 'designation', 'prix_vente_ht', 'stock_initial', 'code_barre'])
  })
  it('colonne inconnue → null, pas de double-affectation', () => {
    const map = autoMapHeaders(['sku', 'sku', 'colonne_bidon'])
    expect(map[0]).toBe('sku')
    expect(map[1]).toBeNull() // sku déjà pris
    expect(map[2]).toBeNull()
  })
})

describe('parseLooseNumber', () => {
  it('gère la décimale virgule et les séparateurs de milliers', () => {
    expect(parseLooseNumber('1 234,56')).toBe(1234.56)
    expect(parseLooseNumber('1,234.56')).toBe(1234.56)
    expect(parseLooseNumber('2.500,00')).toBe(2500)
    expect(parseLooseNumber('350')).toBe(350)
    expect(parseLooseNumber('15%')).toBe(15)
    expect(parseLooseNumber('Rs 1 800')).toBe(1800)
  })
  it('virgule = décimale si ≤2 chiffres après, sinon milliers', () => {
    expect(parseLooseNumber('1,5')).toBe(1.5)
    expect(parseLooseNumber('1,50')).toBe(1.5)
    expect(parseLooseNumber('1,500')).toBe(1500)
  })
  it('vide / non numérique → null', () => {
    expect(parseLooseNumber('')).toBeNull()
    expect(parseLooseNumber(null)).toBeNull()
    expect(parseLooseNumber('abc')).toBeNull()
    expect(parseLooseNumber('-')).toBeNull()
  })
  it('nombre natif conservé', () => {
    expect(parseLooseNumber(42.5)).toBe(42.5)
  })
})

describe('coerceProductRow', () => {
  const headers = ['Référence', 'Désignation', 'Prix', 'Stock', 'Coût']
  const mapping = autoMapHeaders(headers) // sku, designation, prix_vente_ht, stock_initial, cout_unitaire_initial

  it('extrait payload + stock initial + coût, en parsant les nombres', () => {
    const { payload, stock_initial, cout_unitaire_initial } = coerceProductRow(
      { 'Référence': 'sku-9', 'Désignation': 'Article', 'Prix': '1 200,50', 'Stock': '10', 'Coût': '800' },
      headers,
      mapping,
    )
    expect(payload).toMatchObject({ sku: 'sku-9', designation: 'Article', prix_vente_ht: 1200.5 })
    expect(payload.stock_initial).toBeUndefined() // pas dans le payload produit
    expect(stock_initial).toBe(10)
    expect(cout_unitaire_initial).toBe(800)
  })

  it('cellules vides ignorées ; stock initial par défaut 0', () => {
    const { payload, stock_initial, cout_unitaire_initial } = coerceProductRow(
      { 'Référence': 'sku-10', 'Désignation': 'X', 'Prix': '', 'Stock': '', 'Coût': '' },
      headers,
      mapping,
    )
    expect(payload).toEqual({ sku: 'sku-10', designation: 'X' })
    expect(stock_initial).toBe(0)
    expect(cout_unitaire_initial).toBeNull()
  })
})

describe('buildTemplateAoA', () => {
  it('en-tête = tous les libellés, + 2 lignes exemple alignées', () => {
    const aoa = buildTemplateAoA()
    expect(aoa[0]).toEqual(PRODUCT_IMPORT_FIELDS.map((f) => f.label))
    expect(aoa[1].length).toBe(PRODUCT_IMPORT_FIELDS.length)
    expect(aoa[2].length).toBe(PRODUCT_IMPORT_FIELDS.length)
  })
})
