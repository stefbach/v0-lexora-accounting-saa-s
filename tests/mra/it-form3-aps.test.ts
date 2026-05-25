/**
 * IT Form 3 — APS eligibility tests (ITA s.111A).
 *
 * Vérifie que le critère APS s'évalue bien sur l'année N-1 et que
 * l'exemption « première année d'activité » (ITA s.111A(2)) court-
 * circuite l'éligibilité, quels que soient les autres paramètres.
 *
 * Run : npx vitest run tests/mra/it-form3-aps.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  isApsApplicable,
  APS_THRESHOLD_REVENUS,
  APS_THRESHOLD_IMPOT,
} from '@/app/api/mra/it-form3/route'

describe('IT Form 3 — isApsApplicable (ITA s.111A)', () => {
  it('APS applicable : revenus N-1 > 6 000 000 MUR', () => {
    // Cas 1 — revenus N-1 dépassent le seuil de 6M : APS exigé.
    const result = isApsApplicable({
      priorYearTotalRevenus: 6_500_000,
      priorYearImpotCalcule: 0,
      firstYear: false,
    })
    expect(result).toBe(true)
  })

  it('APS non applicable : revenus N-1 < 6 000 000 MUR et impôt < 50k', () => {
    // Cas 2 — sous le seuil de revenus ET sous le seuil d'impôt : pas d'APS.
    const result = isApsApplicable({
      priorYearTotalRevenus: 4_000_000,
      priorYearImpotCalcule: 30_000,
      firstYear: false,
    })
    expect(result).toBe(false)
  })

  it('APS non applicable : firstYear court-circuite tout (exemption ITA s.111A(2))', () => {
    // Cas 3 — même avec des revenus N-1 énormes, la première année d'activité
    // est exemptée par s.111A(2). Le booléen firstYear gagne toujours.
    const result = isApsApplicable({
      priorYearTotalRevenus: 50_000_000,
      priorYearImpotCalcule: 1_000_000,
      firstYear: true,
    })
    expect(result).toBe(false)
  })

  it('expose les seuils légaux comme constantes', () => {
    expect(APS_THRESHOLD_REVENUS).toBe(6_000_000)
    expect(APS_THRESHOLD_IMPOT).toBe(50_000)
  })

  it('valeurs null/undefined traitées comme 0 (sociétés sans historique N-1)', () => {
    expect(
      isApsApplicable({
        priorYearTotalRevenus: null,
        priorYearImpotCalcule: undefined,
        firstYear: false,
      }),
    ).toBe(false)
  })
})
