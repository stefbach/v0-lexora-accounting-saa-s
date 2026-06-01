import { describe, it, expect } from 'vitest'
import {
  isYM, round2, moisBornes, dateLimiteFromPeriode,
  tvaFacture, netteFactures, computeEcart,
  normalizeLigne, totalInclus,
} from './tva-regularisation'

describe('tva-regularisation — helpers période', () => {
  it('isYM valide le format YYYY-MM', () => {
    expect(isYM('2026-05')).toBe(true)
    expect(isYM('2026-5')).toBe(false)
    expect(isYM('2026/05')).toBe(false)
    expect(isYM(null)).toBe(false)
    expect(isYM(202605)).toBe(false)
  })

  it('round2 arrondit au centime', () => {
    expect(round2(2572.625)).toBe(2572.63)
    expect(round2(2572.624)).toBe(2572.62)
    expect(round2(NaN as unknown as number)).toBe(0)
  })

  it('moisBornes gère les mois à 28/30/31 jours', () => {
    expect(moisBornes('2026-02')).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(moisBornes('2026-04')).toEqual({ debut: '2026-04-01', fin: '2026-04-30' })
    expect(moisBornes('2026-12')).toEqual({ debut: '2026-12-01', fin: '2026-12-31' })
  })

  it('dateLimiteFromPeriode = 20 du mois suivant, avec passage d\'année', () => {
    expect(dateLimiteFromPeriode('2026-05')).toBe('2026-06-20')
    expect(dateLimiteFromPeriode('2026-12')).toBe('2027-01-20')
  })
})

describe('tva-regularisation — TVA factures', () => {
  it('client local taxable → collectée', () => {
    expect(tvaFacture({ type_facture: 'client', montant_tva: 2673, devise: 'MUR' }))
      .toEqual({ collectee: 2673, deductible: 0 })
  })

  it('client offshore ou devise étrangère → hors champ (0)', () => {
    expect(tvaFacture({ type_facture: 'client', montant_tva: 2673, devise: 'MUR', client_offshore: true }))
      .toEqual({ collectee: 0, deductible: 0 })
    expect(tvaFacture({ type_facture: 'client', montant_tva: 2673, devise: 'EUR' }))
      .toEqual({ collectee: 0, deductible: 0 })
  })

  it('fournisseur local → déductible', () => {
    expect(tvaFacture({ type_facture: 'fournisseur', montant_tva: 1012.5, devise: 'MUR' }))
      .toEqual({ collectee: 0, deductible: 1012.5 })
  })

  it('fournisseur étranger → 0 (reverse charge géré ailleurs)', () => {
    expect(tvaFacture({ type_facture: 'fournisseur', montant_tva: 1000, devise: 'USD' }))
      .toEqual({ collectee: 0, deductible: 0 })
  })

  it('netteFactures = collectée − déductible (cas Mediasys + fournisseurs)', () => {
    const factures = [
      { type_facture: 'client', montant_tva: 2673, devise: 'MUR' },        // mars
      { type_facture: 'client', montant_tva: 2673, devise: 'MUR' },        // avril
      { type_facture: 'fournisseur', montant_tva: 1760.87, devise: 'MUR' },
      { type_facture: 'fournisseur', montant_tva: 1012.5, devise: 'MUR' },
    ]
    expect(netteFactures(factures)).toBe(2572.63)
  })
})

describe('tva-regularisation — écart', () => {
  it('écart positif = à payer en plus', () => {
    expect(computeEcart(2673, 0)).toBe(2673)
  })
  it('écart négatif = crédit', () => {
    expect(computeEcart(0, 1760.87)).toBe(-1760.87)
  })
  it('écart nul si recalcul = déclaré', () => {
    expect(computeEcart(5000, 5000)).toBe(0)
  })
})

describe('tva-regularisation — normalisation des lignes', () => {
  it('rejette une ligne sans libellé', () => {
    expect(normalizeLigne({ libelle: '   ', montant: 100 })).toBeNull()
    expect(normalizeLigne({ montant: 100 })).toBeNull()
  })

  it('normalise une ligne auto valide', () => {
    const n = normalizeLigne({
      periode_origine: '2026-03', libelle: 'Régul mars', montant: 2673,
      sens: 'net', type: 'ecart_auto', statut: 'incluse',
    })
    expect(n).toEqual({
      periode_origine: '2026-03', libelle: 'Régul mars', montant: 2673,
      sens: 'net', type: 'ecart_auto', facture_id: null, motif: null, statut: 'incluse',
    })
  })

  it('défensif : valeurs invalides ramenées aux défauts', () => {
    const n = normalizeLigne({
      periode_origine: 'pas-une-date', libelle: 'x', montant: 'abc' as any,
      sens: 'farfelu', type: 'inconnu', statut: 'bizarre',
    })
    expect(n).toMatchObject({
      periode_origine: null, montant: 0, sens: 'net', type: 'manuel', statut: 'incluse',
    })
  })

  it('tronque libellé (300) et motif (500)', () => {
    const n = normalizeLigne({ libelle: 'a'.repeat(400), motif: 'b'.repeat(600), montant: 1 })
    expect(n!.libelle.length).toBe(300)
    expect(n!.motif!.length).toBe(500)
  })
})

describe('tva-regularisation — total inclus', () => {
  it('ne somme que les lignes incluses', () => {
    const lignes = [
      { montant: 2673, statut: 'incluse' },
      { montant: 2673, statut: 'incluse' },
      { montant: -1760.87, statut: 'incluse' },
      { montant: -1012.5, statut: 'incluse' },
      { montant: 9999, statut: 'ignoree' },
      { montant: 8888, statut: 'proposee' },
    ]
    expect(totalInclus(lignes)).toBe(2572.63)
  })

  it('total 0 si aucune ligne incluse', () => {
    expect(totalInclus([{ montant: 100, statut: 'ignoree' }])).toBe(0)
    expect(totalInclus([])).toBe(0)
  })
})
