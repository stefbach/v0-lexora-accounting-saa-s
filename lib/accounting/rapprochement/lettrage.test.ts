import { describe, it, expect } from 'vitest'
import {
  lettrageCroiseTolerance,
  selectClosestByDate,
  LETTRER_MULTI_SEUIL_AUTO_ABS,
  LETTRER_MULTI_SEUIL_AUTO_PCT,
  LETTRAGE_CROISE_DATE_WINDOW_DAYS,
  computeEcartCompte,
  ecartRequiresQualification,
} from './lettrage'

describe('lettrageCroiseTolerance', () => {
  it('returns minimum 0.5 for small amounts', () => {
    expect(lettrageCroiseTolerance(0)).toBe(0.5)
    expect(lettrageCroiseTolerance(50)).toBe(0.5)
  })

  it('returns 0.5% of amount for large amounts', () => {
    expect(lettrageCroiseTolerance(10000)).toBe(50)
    expect(lettrageCroiseTolerance(1000)).toBe(5)
  })
})

describe('selectClosestByDate', () => {
  const items = [
    { date_ecriture: '2026-01-01', label: 'a' },
    { date_ecriture: '2026-01-10', label: 'b' },
    { date_ecriture: '2026-01-20', label: 'c' },
  ]

  it('returns null for empty array', () => {
    expect(selectClosestByDate([], new Date('2026-01-05'))).toBeNull()
  })

  it('selects the closest entry to dateRef', () => {
    const result = selectClosestByDate(items, new Date('2026-01-09')) as any
    expect(result?.label).toBe('b')
  })

  it('selects sole item regardless of distance', () => {
    const result = selectClosestByDate([items[2]], new Date('2026-01-01')) as any
    expect(result?.label).toBe('c')
  })

  it('handles null date_ecriture gracefully', () => {
    const mixed = [{ date_ecriture: null, label: 'x' }, { date_ecriture: '2026-01-15', label: 'y' }]
    const result = selectClosestByDate(mixed, new Date('2026-01-14')) as any
    expect(result?.label).toBe('x')
  })
})

describe('constants', () => {
  it('LETTRER_MULTI_SEUIL_AUTO_ABS is 100', () => {
    expect(LETTRER_MULTI_SEUIL_AUTO_ABS).toBe(100)
  })

  it('LETTRER_MULTI_SEUIL_AUTO_PCT is 0.02', () => {
    expect(LETTRER_MULTI_SEUIL_AUTO_PCT).toBe(0.02)
  })

  it('LETTRAGE_CROISE_DATE_WINDOW_DAYS is 60', () => {
    expect(LETTRAGE_CROISE_DATE_WINDOW_DAYS).toBe(60)
  })
})

describe('computeEcartCompte', () => {
  it('returns 658 for small auto ecart (charge side)', () => {
    const r = computeEcartCompte(50, -1, 'M001', undefined)
    expect(r.compte).toBe('658')
    expect(r.debit).toBe(50)
    expect(r.credit).toBe(0)
  })

  it('returns 758 for small auto ecart (produit side)', () => {
    const r = computeEcartCompte(50, 1, 'M001', undefined)
    expect(r.compte).toBe('758')
    expect(r.credit).toBe(50)
  })

  it('returns 666 for change ecart (perte de change)', () => {
    const r = computeEcartCompte(500, -1, 'M001', 'change')
    expect(r.compte).toBe('666')
    expect(r.debit).toBe(500)
  })

  it('returns 766 for change ecart (gain de change)', () => {
    const r = computeEcartCompte(500, 1, 'M001', 'change')
    expect(r.compte).toBe('766')
    expect(r.credit).toBe(500)
  })

  it('returns 665 for escompte accordé (debit ecart)', () => {
    const r = computeEcartCompte(200, -1, 'M001', 'escompte')
    expect(r.compte).toBe('665')
  })

  it('returns 631 for penalite', () => {
    const r = computeEcartCompte(300, 1, 'M001', 'penalite')
    expect(r.compte).toBe('631')
    expect(r.debit).toBe(300)
  })

  it('returns 471 for a_regulariser', () => {
    const r = computeEcartCompte(400, -1, 'M001', 'a_regulariser')
    expect(r.compte).toBe('471')
    expect(r.debit).toBe(400)
  })

  it('returns 658/758 for exceptionnel (default)', () => {
    const r = computeEcartCompte(500, 1, 'M001', 'exceptionnel')
    expect(r.compte).toBe('758')
  })
})

describe('ecartRequiresQualification', () => {
  it('returns false when typeEcart is already set', () => {
    expect(ecartRequiresQualification(500, 10000, 'change')).toBe(false)
  })

  it('returns false for small ecart below threshold', () => {
    expect(ecartRequiresQualification(50, 10000, undefined)).toBe(false)
  })

  it('returns false when ecart pct <= 2%', () => {
    expect(ecartRequiresQualification(150, 20000, undefined)).toBe(false)
  })

  it('returns true when ecart > 100 AND pct > 2%', () => {
    expect(ecartRequiresQualification(300, 5000, undefined)).toBe(true)
  })
})
