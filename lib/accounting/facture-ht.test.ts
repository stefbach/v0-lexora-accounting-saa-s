import { describe, it, expect } from 'vitest'
import { computeFactureHt } from './facture-ht'

describe('computeFactureHt', () => {
  it('facture hors taxe (TVA 0) → montant plein, aucune déduction', () => {
    // Cas réel : SKYCALL EUR, export zero-rated (HT == TTC légitimement)
    expect(computeFactureHt({ montant_ht: 14109.69, montant_ttc: 14109.69, montant_tva: 0 })).toBeCloseTo(14109.69, 2)
  })

  it('facture standard 15% → HT = TTC − TVA', () => {
    expect(computeFactureHt({ montant_ht: 17820, montant_ttc: 20493, montant_tva: 2673 })).toBeCloseTo(17820, 2)
  })

  it('cas legacy : TTC saisi dans le champ HT mais TVA renseignée → corrigé à TTC − TVA', () => {
    expect(computeFactureHt({ montant_ht: 20493, montant_ttc: 20493, montant_tva: 2673 })).toBeCloseTo(17820, 2)
  })

  it('régression : hors taxe avec montant_tva=0 → jamais divisé par (1 + taux)', () => {
    // Le bug corrigé divisait ce montant par 1,15 dès qu'un taux_tva par défaut
    // (15) traînait sur une facture pourtant hors taxe.
    expect(computeFactureHt({ montant_ht: 100000, montant_ttc: 100000, montant_tva: 0 })).toBe(100000)
  })

  it('TTC absent/invalide → fallback sur montant_ht', () => {
    expect(computeFactureHt({ montant_ht: 5000, montant_ttc: 0, montant_tva: 0 })).toBe(5000)
  })

  it('valeurs string (colonnes numeric Supabase) supportées', () => {
    expect(computeFactureHt({ montant_ht: '17820', montant_ttc: '20493', montant_tva: '2673' })).toBeCloseTo(17820, 2)
  })

  it('champs nuls/absents → 0', () => {
    expect(computeFactureHt({})).toBe(0)
    expect(computeFactureHt({ montant_ht: null, montant_ttc: null, montant_tva: null })).toBe(0)
  })

  it('résultat jamais négatif', () => {
    expect(computeFactureHt({ montant_ht: -10, montant_ttc: 0, montant_tva: 0 })).toBe(0)
  })
})
