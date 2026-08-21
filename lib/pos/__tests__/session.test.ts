import { describe, it, expect } from 'vitest'
import {
  buildRecapSession,
  calculerFermeture,
  validateOuverturePayload,
} from '@/lib/pos/session'

describe('validateOuverturePayload', () => {
  it('fond par défaut 0, dépôt et notes optionnels', () => {
    const res = validateOuverturePayload({})
    expect(res).toEqual({ ok: true, data: { depot_id: null, fond_ouverture: 0, notes: null } })
  })

  it('normalise fond (arrondi centime) et champs texte', () => {
    const res = validateOuverturePayload({ fond_ouverture: '1500.005', depot_id: ' dep-1 ', notes: ' RAS ' })
    expect(res).toEqual({
      ok: true,
      data: { depot_id: 'dep-1', fond_ouverture: 1500.01, notes: 'RAS' },
    })
  })

  it('refuse un fond négatif ou non numérique', () => {
    expect(validateOuverturePayload({ fond_ouverture: -10 }).ok).toBe(false)
    expect(validateOuverturePayload({ fond_ouverture: 'abc' }).ok).toBe(false)
    expect(validateOuverturePayload(null).ok).toBe(false)
  })
})

describe('calculerFermeture', () => {
  it('théorique = ouverture + espèces ; écart = compté − théorique', () => {
    expect(calculerFermeture(1000, 2534.5, 3530)).toEqual({
      fond_fermeture_theorique: 3534.5,
      ecart_caisse: -4.5,
    })
  })

  it('écart nul et surplus, sans dérive flottante', () => {
    expect(calculerFermeture(100.1, 0.2, 100.3)).toEqual({
      fond_fermeture_theorique: 100.3,
      ecart_caisse: 0,
    })
    expect(calculerFermeture(0, 99.99, 100)).toEqual({
      fond_fermeture_theorique: 99.99,
      ecart_caisse: 0.01,
    })
  })
})

describe('buildRecapSession', () => {
  it('agrège les tickets validés et ventile par moyen', () => {
    const recap = buildRecapSession(
      [
        { statut: 'validee', montant_ht: 100, montant_tva: 15, montant_ttc: 115 },
        { statut: 'validee', montant_ht: 200.5, montant_tva: 30.08, montant_ttc: 230.58 },
        { statut: 'annulee', montant_ht: 50, montant_tva: 7.5, montant_ttc: 57.5 },
      ],
      [
        { moyen_paiement: 'especes', montant: 115 },
        { moyen_paiement: 'carte', montant: 100 },
        { moyen_paiement: 'especes', montant: 130.58 },
      ],
    )
    expect(recap).toEqual({
      nb_tickets: 2,
      total_ht: 300.5,
      total_tva: 45.08,
      total_ttc: 345.58,
      par_moyen: { especes: 245.58, carte: 100 },
    })
  })

  it('session sans vente ⇒ récap vide', () => {
    expect(buildRecapSession([], [])).toEqual({
      nb_tickets: 0,
      total_ht: 0,
      total_tva: 0,
      total_ttc: 0,
      par_moyen: {},
    })
  })
})
