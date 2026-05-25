import { describe, it, expect } from 'vitest'
import { computeCitDeadline, computeCitDeadlineISO } from './mra-deadlines'

/**
 * Référence : ITA s.116(1) — la déclaration CIT doit être déposée
 * « not later than 6 months from the end of the month in which its
 * accounting period ends ».
 *
 * Donc : pour une clôture le jour J du mois M, la deadline est le
 * dernier jour du mois (M+6).
 */
describe('computeCitDeadline (ITA s.116)', () => {
  it('clôture 30 juin → 31 décembre même année (exercice juillet-juin classique Maurice)', () => {
    const out = computeCitDeadline('2025-06-30')
    expect(out.toISOString().slice(0, 10)).toBe('2025-12-31')
  })

  it('clôture 31 décembre → 30 juin année suivante (cas GBC / SaaS post-FA2018)', () => {
    const out = computeCitDeadline('2025-12-31')
    expect(out.toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  it('clôture 31 mars → 30 septembre même année (exercice avril-mars)', () => {
    const out = computeCitDeadline('2025-03-31')
    expect(out.toISOString().slice(0, 10)).toBe('2025-09-30')
  })

  it('accepte un objet Date en entrée', () => {
    const out = computeCitDeadline(new Date('2025-06-30T00:00:00Z'))
    expect(out.toISOString().slice(0, 10)).toBe('2025-12-31')
  })

  it('retourne toujours le DERNIER jour du mois +6, même si la clôture est en milieu de mois', () => {
    // Si la clôture (rare) tombe au 15 du mois, la fin du mois est le
    // 30/06, puis +6 mois = 31/12. ITA parle de "end of the month".
    const out = computeCitDeadline('2025-06-15')
    expect(out.toISOString().slice(0, 10)).toBe('2025-12-31')
  })

  it('lève une erreur si la date est invalide', () => {
    expect(() => computeCitDeadline('pas-une-date')).toThrow()
  })
})

describe('computeCitDeadlineISO (helper API)', () => {
  it('utilise societes.date_fin_exercice si fourni (cas GBC déc-déc)', () => {
    expect(computeCitDeadlineISO('2025-2026', '2025-12-31')).toBe('2026-06-30')
  })

  it('fallback 30 juin de endYear si date_fin_exercice est null', () => {
    expect(computeCitDeadlineISO('2024-2025', null)).toBe('2025-12-31')
  })

  it('fallback 30 juin de endYear si date_fin_exercice est undefined', () => {
    expect(computeCitDeadlineISO('2024-2025', undefined)).toBe('2025-12-31')
  })

  it('clôture mars-mars', () => {
    expect(computeCitDeadlineISO('2024-2025', '2025-03-31')).toBe('2025-09-30')
  })

  it('données corrompues : retombe sur l\'ancien comportement endYear-12-30 plutôt que crasher', () => {
    expect(computeCitDeadlineISO('2024-2025', 'date-pourrie')).toBe('2025-12-30')
  })
})
