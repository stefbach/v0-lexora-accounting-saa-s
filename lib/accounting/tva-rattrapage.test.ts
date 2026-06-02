import { describe, it, expect } from 'vitest'
import {
  ym, dateLimite, genererPeriodes, isMraPayment, penaliteRetard,
} from './tva-rattrapage'

describe('ym', () => {
  it('pads the month to 2 digits', () => {
    expect(ym(2026, 1)).toBe('2026-01')
    expect(ym(2026, 12)).toBe('2026-12')
  })
})

describe('dateLimite', () => {
  it('returns the 20th of the following month', () => {
    expect(dateLimite(2026, 5)).toBe('2026-06-20')
  })
  it('rolls over to January of next year for December', () => {
    expect(dateLimite(2026, 12)).toBe('2027-01-20')
  })
})

describe('genererPeriodes — mensuelle', () => {
  it('generates one entry per month inclusive', () => {
    const p = genererPeriodes(2026, 1, 2026, 3, 'mensuelle')
    expect(p).toHaveLength(3)
    expect(p[0]).toMatchObject({ periode: '2026-01', type: 'mensuel', trimestre: null, date_limite: '2026-02-20' })
    expect(p[2].periode).toBe('2026-03')
    expect(p[2].mois).toEqual(['2026-03'])
  })
  it('crosses the year boundary correctly', () => {
    const p = genererPeriodes(2025, 11, 2026, 2, 'mensuelle')
    expect(p.map(x => x.periode)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('genererPeriodes — trimestrielle', () => {
  it('generates quarters with 3 covered months and the MRA deadline', () => {
    const p = genererPeriodes(2026, 1, 2026, 6, 'trimestrielle')
    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ trimestre: '2026-Q1', periode: '2026-03', type: 'trimestriel' })
    expect(p[0].mois).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(p[0].date_limite).toBe('2026-04-20')
    expect(p[1].trimestre).toBe('2026-Q2')
    expect(p[1].date_limite).toBe('2026-07-20')
  })
})

describe('isMraPayment', () => {
  it('matches common MRA / VAT labels', () => {
    expect(isMraPayment('PAYMENT MRA VAT')).toBe(true)
    expect(isMraPayment('Mauritius Revenue Authority')).toBe(true)
    expect(isMraPayment('Virement T.V.A juin')).toBe(true)
    expect(isMraPayment('M.R.A')).toBe(true)
  })
  it('does not match unrelated labels', () => {
    expect(isMraPayment('SALAIRE Jean Dupont')).toBe(false)
    expect(isMraPayment('Achat fournitures')).toBe(false)
    expect(isMraPayment('')).toBe(false)
    expect(isMraPayment(null)).toBe(false)
    expect(isMraPayment(undefined)).toBe(false)
  })
})

describe('penaliteRetard', () => {
  it('applies 5% + 0.5%/month with a 1-month floor', () => {
    expect(penaliteRetard(10000, 1)).toBe(550)
    expect(penaliteRetard(10000, 3)).toBe(650)
    expect(penaliteRetard(10000, 0)).toBe(550)
  })
  it('returns 0 for non-positive net VAT', () => {
    expect(penaliteRetard(0, 5)).toBe(0)
    expect(penaliteRetard(-100, 5)).toBe(0)
  })
})
