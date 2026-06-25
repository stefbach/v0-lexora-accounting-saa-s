import { describe, it, expect } from 'vitest'
import {
  getCurrentExercice,
  getCurrentFiscalStartYear,
  getAvailableExercices,
  getAvailableExercicesFY,
  getAvailableYears,
  parseExerciceDates,
  getPreviousExercice,
} from './fiscal-years'

// Année fiscale mauricienne : juillet → juin.
const jul2025 = new Date(2025, 6, 15) // 15 juil. 2025 → exercice 2025-2026
const mar2026 = new Date(2026, 2, 15) // 15 mars 2026 → exercice 2025-2026
const jun2025 = new Date(2025, 5, 30) // 30 juin 2025 → exercice 2024-2025

describe('getCurrentExercice', () => {
  it('returns YYYY-YYYY spanning July→June', () => {
    expect(getCurrentExercice(jul2025)).toBe('2025-2026')
    expect(getCurrentExercice(mar2026)).toBe('2025-2026')
    expect(getCurrentExercice(jun2025)).toBe('2024-2025')
  })
})

describe('getCurrentFiscalStartYear', () => {
  it('is the calendar year for Jul–Dec, year-1 for Jan–Jun', () => {
    expect(getCurrentFiscalStartYear(jul2025)).toBe(2025)
    expect(getCurrentFiscalStartYear(mar2026)).toBe(2025)
    expect(getCurrentFiscalStartYear(jun2025)).toBe(2024)
  })
})

describe('getAvailableExercices', () => {
  it('lists exercices around the current one, most recent first', () => {
    const list = getAvailableExercices(2, 1, jul2025)
    expect(list).toEqual(['2026-2027', '2025-2026', '2024-2025', '2023-2024'])
  })

  it('respects back/forward counts', () => {
    expect(getAvailableExercices(1, 0, jul2025)).toEqual(['2025-2026', '2024-2025'])
  })
})

describe('getAvailableExercicesFY', () => {
  it('prefixes FY', () => {
    expect(getAvailableExercicesFY(1, 0, jul2025)).toEqual(['FY2025-2026', 'FY2024-2025'])
  })
})

describe('getAvailableYears', () => {
  it('lists civil years around now, descending', () => {
    expect(getAvailableYears(2, 1, jul2025)).toEqual([2026, 2025, 2024, 2023])
  })
})

describe('parseExerciceDates', () => {
  it('maps to July 1 → June 30', () => {
    expect(parseExerciceDates('2025-2026')).toEqual({ debut: '2025-07-01', fin: '2026-06-30' })
  })
  it('accepts FY prefix', () => {
    expect(parseExerciceDates('FY2025-2026')).toEqual({ debut: '2025-07-01', fin: '2026-06-30' })
  })
  it('returns null on bad input', () => {
    expect(parseExerciceDates('2025')).toBeNull()
    expect(parseExerciceDates('garbage')).toBeNull()
  })
})

describe('getPreviousExercice', () => {
  it('shifts back one fiscal year', () => {
    expect(getPreviousExercice('2025-2026')).toBe('2024-2025')
    expect(getPreviousExercice('FY2025-2026')).toBe('2024-2025')
  })
  it('falls back to current-1 on bad input', () => {
    expect(getPreviousExercice('garbage', jul2025)).toBe('2024-2025')
  })
})
