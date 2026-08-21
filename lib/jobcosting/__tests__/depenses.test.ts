import { describe, it, expect } from 'vitest'
import {
  validateDepensePayload,
  validateConsommationStockPayload,
} from '@/lib/jobcosting/depenses'

describe('validateDepensePayload', () => {
  it('accepte une dépense valide et normalise', () => {
    const r = validateDepensePayload({
      type_depense: 'sous_traitance',
      montant_ht: 1500.5,
      marge_refacturation_pct: 10,
      devise: 'mur',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.type_depense).toBe('sous_traitance')
      expect(r.data.montant_ht).toBe(1500.5)
      expect(r.data.marge_refacturation_pct).toBe(10)
      expect(r.data.devise).toBe('MUR')
      expect(r.data.facturable).toBe(true)
    }
  })

  it('type inconnu → autre', () => {
    const r = validateDepensePayload({ type_depense: 'xxx', montant_ht: 10 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.type_depense).toBe('autre')
  })

  it('montant invalide ou négatif → erreur', () => {
    expect(validateDepensePayload({ montant_ht: -5 }).ok).toBe(false)
    expect(validateDepensePayload({ montant_ht: 'abc' }).ok).toBe(false)
  })

  it('marge hors bornes → erreur', () => {
    expect(validateDepensePayload({ montant_ht: 10, marge_refacturation_pct: -1 }).ok).toBe(false)
    expect(validateDepensePayload({ montant_ht: 10, marge_refacturation_pct: 1001 }).ok).toBe(false)
  })

  it('liens fournisseur/note de frais et facturable=false', () => {
    const r = validateDepensePayload({
      montant_ht: 200,
      facture_fournisseur_id: 'fac-1',
      note_frais_id: 'nf-1',
      facturable: false,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.facture_fournisseur_id).toBe('fac-1')
      expect(r.data.note_frais_id).toBe('nf-1')
      expect(r.data.facturable).toBe(false)
    }
  })
})

describe('validateConsommationStockPayload', () => {
  it('accepte une consommation valide', () => {
    const r = validateConsommationStockPayload({
      produit_id: 'prod-1',
      quantite: 3.5,
      depot_id: 'dep-1',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.produit_id).toBe('prod-1')
      expect(r.data.quantite).toBe(3.5)
      expect(r.data.depot_id).toBe('dep-1')
      expect(r.data.facturable).toBe(true)
    }
  })

  it('produit_id requis', () => {
    expect(validateConsommationStockPayload({ quantite: 1 }).ok).toBe(false)
  })

  it('quantité strictement positive', () => {
    expect(validateConsommationStockPayload({ produit_id: 'p', quantite: 0 }).ok).toBe(false)
    expect(validateConsommationStockPayload({ produit_id: 'p', quantite: -2 }).ok).toBe(false)
  })

  it('depot_id absent → null (dépôt résolu côté API)', () => {
    const r = validateConsommationStockPayload({ produit_id: 'p', quantite: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.depot_id).toBeNull()
  })

  it('marge invalide → erreur', () => {
    expect(
      validateConsommationStockPayload({ produit_id: 'p', quantite: 1, marge_refacturation_pct: 2000 }).ok,
    ).toBe(false)
  })
})
