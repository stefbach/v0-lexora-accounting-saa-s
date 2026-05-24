import { describe, it, expect } from 'vitest'
import {
  CSR_EXEMPT_REGIMES,
  computeCSR,
  isCsrExempt,
} from './mra-csr'

describe('mra-csr — isCsrExempt', () => {
  it('reconnaît les régimes exonérés (insensible à la casse)', () => {
    for (const r of CSR_EXEMPT_REGIMES) {
      expect(isCsrExempt(r)).toBe(true)
      expect(isCsrExempt(r.toUpperCase())).toBe(true)
    }
  })

  it('refuse les régimes non exonérés', () => {
    expect(isCsrExempt('domestic')).toBe(false)
    expect(isCsrExempt('holding')).toBe(false)
    expect(isCsrExempt('branch_foreign_pe')).toBe(false)
    expect(isCsrExempt('unknown_regime')).toBe(false)
  })

  it('tolère null / undefined / chaîne vide', () => {
    expect(isCsrExempt(null)).toBe(false)
    expect(isCsrExempt(undefined)).toBe(false)
    expect(isCsrExempt('')).toBe(false)
    expect(isCsrExempt('   ')).toBe(false)
  })
})

describe('mra-csr — computeCSR (résident standard)', () => {
  it('PME mauricienne classique : 2 % du chargeable income', () => {
    // ITA s.50L : pas de seuil. CSR s'applique dès le 1er roupie.
    expect(computeCSR(500_000, 'domestic')).toBe(10_000)
    expect(computeCSR(1_000_000, 'domestic')).toBe(20_000)
    expect(computeCSR(15_000_000, 'domestic')).toBe(300_000)
  })

  it('chargeable income < 10M : CSR dû quand même (régression Pb 2.b W2-D)', () => {
    // Régression historique : la formule legacy ne facturait CSR qu'au-
    // dessus de 10M. Vérifie qu'on facture bien sous le seuil.
    expect(computeCSR(2_000_000, 'domestic')).toBe(40_000)
    expect(computeCSR(50_000, 'domestic')).toBe(1_000)
  })

  it('holding consolidante : 2 %', () => {
    expect(computeCSR(8_500_000, 'holding')).toBeCloseTo(170_000)
  })

  it('succursale étrangère : 2 % (résidente fiscale)', () => {
    expect(computeCSR(3_200_000, 'branch_foreign_pe')).toBeCloseTo(64_000)
  })

  it('chargeable income à 0 ou négatif : CSR = 0', () => {
    expect(computeCSR(0, 'domestic')).toBe(0)
    expect(computeCSR(-100_000, 'domestic')).toBe(0)
  })

  it('valeurs non finies : CSR = 0 (défense en profondeur)', () => {
    expect(computeCSR(Number.NaN, 'domestic')).toBe(0)
    expect(computeCSR(Number.POSITIVE_INFINITY, 'domestic')).toBe(0)
  })
})

describe('mra-csr — computeCSR (régimes exonérés)', () => {
  it('GBC1 : exonéré (Income Tax Regulations)', () => {
    expect(computeCSR(50_000_000, 'gbc1')).toBe(0)
  })

  it('Authorised Company : exonéré (non résidente fiscale)', () => {
    expect(computeCSR(10_000_000, 'authorised_company')).toBe(0)
  })

  it('Freeport : exonéré', () => {
    expect(computeCSR(7_500_000, 'freeport')).toBe(0)
  })

  it('société exonérée d\'IS : exonéré', () => {
    expect(computeCSR(4_200_000, 'societe_exoneree_is')).toBe(0)
  })

  it('production audiovisuelle : exonéré', () => {
    expect(computeCSR(1_800_000, 'film_production')).toBe(0)
  })
})

describe('mra-csr — computeCSR (overrideExempt)', () => {
  it('overrideExempt = true force l\'exonération même pour domestic', () => {
    expect(computeCSR(5_000_000, 'domestic', true)).toBe(0)
  })

  it('overrideExempt = false : comportement standard', () => {
    expect(computeCSR(5_000_000, 'domestic', false)).toBe(100_000)
  })

  it('overrideExempt n\'inverse pas une exonération déjà acquise', () => {
    expect(computeCSR(5_000_000, 'gbc1', false)).toBe(0)
  })
})
