import { describe, it, expect } from 'vitest'
import {
  calculerLigne,
  calculerTotaux,
  resteAPayer,
  validateVentePayload,
  type LignePanier,
} from '@/lib/pos/panier'

const ligne = (over: Partial<LignePanier> = {}): LignePanier => ({
  produit_id: 'prod-1',
  quantite: 3,
  prix_unitaire_ht: 100,
  remise_pct: 10,
  taux_tva: 15,
  ...over,
})

describe('calculerLigne', () => {
  it('HT = qté × prix × (1 − remise), TVA 15%, arrondis au centime', () => {
    expect(calculerLigne(ligne())).toEqual({
      montant_ht: 270,
      montant_tva: 40.5,
      montant_ttc: 310.5,
    })
  })

  it('arrondi half-up de la TVA (8.9955 → 9.00)', () => {
    expect(calculerLigne(ligne({ quantite: 3, prix_unitaire_ht: 19.99, remise_pct: 0 }))).toEqual({
      montant_ht: 59.97,
      montant_tva: 9,
      montant_ttc: 68.97,
    })
  })

  it('pas de dérive flottante (0.1 + 0.2 style)', () => {
    const m = calculerLigne(ligne({ quantite: 0.3, prix_unitaire_ht: 1, remise_pct: 0, taux_tva: 0 }))
    expect(m).toEqual({ montant_ht: 0.3, montant_tva: 0, montant_ttc: 0.3 })
  })

  it('remise 100% ⇒ tout à zéro', () => {
    expect(calculerLigne(ligne({ remise_pct: 100 }))).toEqual({
      montant_ht: 0,
      montant_tva: 0,
      montant_ttc: 0,
    })
  })
})

describe('calculerTotaux', () => {
  it('somme les montants de ligne déjà arrondis', () => {
    const totaux = calculerTotaux([
      ligne(),
      ligne({ quantite: 1, prix_unitaire_ht: 19.99, remise_pct: 0 }),
    ])
    // ligne 1 : 270 / 40.5 ; ligne 2 : 19.99 / 3.00 (2.9985 → 3.00)
    expect(totaux).toEqual({ total_ht: 289.99, total_tva: 43.5, total_ttc: 333.49 })
  })

  it('panier vide ⇒ zéros', () => {
    expect(calculerTotaux([])).toEqual({ total_ht: 0, total_tva: 0, total_ttc: 0 })
  })
})

describe('validateVentePayload', () => {
  const bodyOk = () => ({
    session_id: 'ses-1',
    lignes: [{ produit_id: 'prod-1', quantite: 2, prix_unitaire_ht: 50, remise_pct: 0, taux_tva: 15 }],
    paiements: [{ moyen_paiement: 'especes', montant: 115 }],
  })

  it('payload valide — totaux recalculés et paiement équilibré', () => {
    const res = validateVentePayload(bodyOk())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.totaux).toEqual({ total_ht: 100, total_tva: 15, total_ttc: 115 })
    expect(res.data.paiements[0]).toEqual({ moyen_paiement: 'especes', montant: 115, reference: null })
  })

  it('paiement fractionné en plusieurs moyens accepté', () => {
    const res = validateVentePayload({
      ...bodyOk(),
      paiements: [
        { moyen_paiement: 'especes', montant: 15 },
        { moyen_paiement: 'carte', montant: 100, reference: '****1234' },
      ],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.paiements).toHaveLength(2)
    expect(res.data.paiements[1].reference).toBe('****1234')
  })

  it('refuse Σ paiements ≠ TTC', () => {
    const res = validateVentePayload({ ...bodyOk(), paiements: [{ moyen_paiement: 'carte', montant: 100 }] })
    expect(res).toMatchObject({ ok: false })
    if (res.ok) return
    expect(res.error).toContain('PAIEMENT_DESEQUILIBRE')
  })

  it.each([
    [{}, 'session_id requis'],
    [{ session_id: 'ses-1', lignes: [], paiements: [] }, 'ligne de vente'],
    [
      { session_id: 'ses-1', lignes: [{ produit_id: '', quantite: 1, prix_unitaire_ht: 1, taux_tva: 0 }], paiements: [] },
      'produit_id',
    ],
    [
      { session_id: 'ses-1', lignes: [{ produit_id: 'p', quantite: 0, prix_unitaire_ht: 1, taux_tva: 0 }], paiements: [] },
      'quantite',
    ],
    [
      { session_id: 'ses-1', lignes: [{ produit_id: 'p', quantite: 1, prix_unitaire_ht: -2, taux_tva: 0 }], paiements: [] },
      'prix_unitaire_ht',
    ],
    [
      { session_id: 'ses-1', lignes: [{ produit_id: 'p', quantite: 1, prix_unitaire_ht: 1, remise_pct: 120, taux_tva: 0 }], paiements: [] },
      'remise_pct',
    ],
    [
      { session_id: 'ses-1', lignes: [{ produit_id: 'p', quantite: 1, prix_unitaire_ht: 1, taux_tva: -1 }], paiements: [] },
      'taux_tva',
    ],
  ])('rejette payload invalide %#', (body, fragment) => {
    const res = validateVentePayload(body)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain(fragment)
  })

  it('rejette un moyen de paiement inconnu et un montant nul', () => {
    const cheque = validateVentePayload({ ...bodyOk(), paiements: [{ moyen_paiement: 'cheque', montant: 115 }] })
    expect(cheque.ok).toBe(false)
    if (!cheque.ok) expect(cheque.error).toContain('moyen_paiement')

    const zero = validateVentePayload({ ...bodyOk(), paiements: [{ moyen_paiement: 'especes', montant: 0 }] })
    expect(zero.ok).toBe(false)
    if (!zero.ok) expect(zero.error).toContain('montant positif')
  })

  it('body non-objet refusé', () => {
    expect(validateVentePayload(null).ok).toBe(false)
    expect(validateVentePayload('x').ok).toBe(false)
  })
})

describe('resteAPayer', () => {
  it('déduit les paiements saisis, plancher à zéro', () => {
    expect(resteAPayer(310.5, [{ montant: 110.5 }])).toBe(200)
    expect(resteAPayer(310.5, [{ montant: 110.5 }, { montant: 200 }])).toBe(0)
    expect(resteAPayer(100, [{ montant: 150 }])).toBe(0)
    expect(resteAPayer(100, [])).toBe(100)
  })
})
