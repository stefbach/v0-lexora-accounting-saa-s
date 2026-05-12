import { describe, it, expect } from 'vitest'
import { validateCataloguePayload } from './validate'

describe('validateCataloguePayload', () => {
  it('refuse une description vide', () => {
    const r = validateCataloguePayload({ description: '   ', prix_unitaire: 100 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/description/)
  })

  it('refuse une description trop longue', () => {
    const r = validateCataloguePayload({ description: 'a'.repeat(501), prix_unitaire: 0 })
    expect(r.ok).toBe(false)
  })

  it('refuse un prix négatif', () => {
    const r = validateCataloguePayload({ description: 'test', prix_unitaire: -1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/prix_unitaire/)
  })

  it('refuse une devise non supportée', () => {
    const r = validateCataloguePayload({ description: 'x', prix_unitaire: 1, devise: 'XYZ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/devise/)
  })

  it('accepte une charge utile minimale et applique les défauts', () => {
    const r = validateCataloguePayload({ description: '  Prestation  ', prix_unitaire: 1000 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.description).toBe('Prestation')
      expect(r.data.devise).toBe('MUR')
      expect(r.data.tva_applicable).toBe(true)
      expect(r.data.unite).toBe('Forfait')
      expect(r.data.actif).toBe(true)
      expect(r.data.categorie).toBeNull()
    }
  })

  it('normalise la devise en majuscules', () => {
    const r = validateCataloguePayload({ description: 'x', prix_unitaire: 1, devise: 'eur' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.devise).toBe('EUR')
  })

  it('respecte tva_applicable=false', () => {
    const r = validateCataloguePayload({
      description: 'Offshore service',
      prix_unitaire: 100,
      tva_applicable: false,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.tva_applicable).toBe(false)
  })

  it('tronque catégorie et unite', () => {
    const r = validateCataloguePayload({
      description: 'x',
      prix_unitaire: 1,
      categorie: 'a'.repeat(200),
      unite: 'b'.repeat(80),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.categorie!.length).toBe(100)
      expect(r.data.unite!.length).toBe(50)
    }
  })

  it('respecte actif=false explicite', () => {
    const r = validateCataloguePayload({ description: 'x', prix_unitaire: 0, actif: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.actif).toBe(false)
  })

  it('accepte prix_unitaire = 0', () => {
    const r = validateCataloguePayload({ description: 'Gratuit', prix_unitaire: 0 })
    expect(r.ok).toBe(true)
  })
})
