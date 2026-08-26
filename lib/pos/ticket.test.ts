import { describe, it, expect } from 'vitest'
import { computeChange, buildTicketModel } from './ticket'

describe('computeChange', () => {
  it('rendu = reçu − dû, jamais négatif', () => {
    expect(computeChange(500, 430)).toBe(70)
    expect(computeChange(430, 430)).toBe(0)
    expect(computeChange(400, 430)).toBe(0) // sous-paiement → pas de rendu
  })
  it('arrondi 2 décimales', () => {
    expect(computeChange(100, 42.505)).toBe(57.5)
  })
})

describe('buildTicketModel', () => {
  const base = {
    societe: 'Ma Boutique',
    numero_ticket: 'TCK-20260826-0001',
    date: '2026-08-26',
    total_ht: 100,
    total_tva: 15,
    total_ttc: 115,
    lignes: [{ designation: 'Article', quantite: 1, prix_unitaire_ht: 100, taux_tva: 15, montant_ttc: 115 }],
  }

  it('libelle les moyens de paiement et calcule le rendu espèces', () => {
    const t = buildTicketModel({ ...base, paiements: [{ moyen: 'especes', montant: 115 }], recu_especes: 200 })
    expect(t.paiements[0].libelle).toBe('Espèces')
    expect(t.recu_especes).toBe(200)
    expect(t.rendu).toBe(85)
  })

  it('sans recu_especes : reçu = part espèces due, rendu 0', () => {
    const t = buildTicketModel({ ...base, paiements: [{ moyen: 'especes', montant: 115 }] })
    expect(t.recu_especes).toBe(115)
    expect(t.rendu).toBe(0)
  })

  it('paiement mixte carte + espèces : rendu calculé sur la part espèces', () => {
    const t = buildTicketModel({
      ...base,
      paiements: [{ moyen: 'carte', montant: 65 }, { moyen: 'especes', montant: 50 }],
      recu_especes: 100,
    })
    expect(t.total_ttc).toBe(115)
    expect(t.rendu).toBe(50) // 100 reçu − 50 dû en espèces
  })

  it('carte seule : pas de rendu', () => {
    const t = buildTicketModel({ ...base, paiements: [{ moyen: 'carte', montant: 115 }] })
    expect(t.rendu).toBe(0)
    expect(t.recu_especes).toBe(0)
  })
})
