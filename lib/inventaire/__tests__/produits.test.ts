import { describe, it, expect } from 'vitest'
import { validateProduitPayload } from '@/lib/inventaire/produits'

const base = { sku: 'sku-001', designation: 'Ciment 25kg' }

describe('validateProduitPayload', () => {
  it('refuse un body non-objet', () => {
    expect(validateProduitPayload(null)).toEqual({ ok: false, error: 'Body JSON requis' })
    expect(validateProduitPayload('x')).toMatchObject({ ok: false })
  })

  it('exige sku et designation', () => {
    expect(validateProduitPayload({ designation: 'X' })).toMatchObject({ ok: false, error: 'sku requis' })
    expect(validateProduitPayload({ sku: 'A' })).toMatchObject({ ok: false, error: 'designation requise' })
  })

  it('normalise le SKU en majuscules et applique les défauts', () => {
    const res = validateProduitPayload(base)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.sku).toBe('SKU-001')
    expect(res.data.taux_tva).toBe(15)
    expect(res.data.unite_mesure).toBe('unite')
    expect(res.data.gere_en_stock).toBe(true)
    expect(res.data.actif).toBe(true)
    expect(res.data.compte_stock).toBe('3701')
    expect(res.data.compte_achat).toBe('601')
    expect(res.data.compte_vente).toBe('701')
    expect(res.data.compte_variation_stock).toBe('6037')
    expect(res.data.stock_mini).toBe(0)
    expect(res.data.seuil_alerte).toBeNull()
  })

  it('rejette les montants et taux invalides', () => {
    expect(validateProduitPayload({ ...base, prix_vente_ht: -1 })).toMatchObject({ ok: false, error: 'prix_vente_ht invalide' })
    expect(validateProduitPayload({ ...base, taux_tva: 101 })).toMatchObject({ ok: false, error: expect.stringContaining('taux_tva') })
    expect(validateProduitPayload({ ...base, taux_tva: 'abc' })).toMatchObject({ ok: false })
    expect(validateProduitPayload({ ...base, stock_mini: -2 })).toMatchObject({ ok: false, error: 'stock_mini invalide' })
    expect(validateProduitPayload({ ...base, stock_maxi: 0 })).toMatchObject({ ok: false, error: 'stock_maxi invalide' })
    expect(validateProduitPayload({ ...base, seuil_alerte: -1 })).toMatchObject({ ok: false, error: 'seuil_alerte invalide' })
  })

  it('rejette un compte comptable non numérique', () => {
    expect(validateProduitPayload({ ...base, compte_stock: 'ABC' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('compte_stock'),
    })
  })

  it('accepte des seuils et comptes personnalisés', () => {
    const res = validateProduitPayload({
      ...base,
      prix_vente_ht: '150.50',
      taux_tva: 0,
      seuil_alerte: '10',
      stock_maxi: 500,
      compte_stock: '3702',
      gere_en_stock: false,
      actif: false,
      categorie: '  Matériaux  ',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.prix_vente_ht).toBe(150.5)
    expect(res.data.taux_tva).toBe(0)
    expect(res.data.seuil_alerte).toBe(10)
    expect(res.data.stock_maxi).toBe(500)
    expect(res.data.compte_stock).toBe('3702')
    expect(res.data.gere_en_stock).toBe(false)
    expect(res.data.actif).toBe(false)
    expect(res.data.categorie).toBe('Matériaux')
  })
})
