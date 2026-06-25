import { describe, it, expect } from 'vitest'
import { tauxHoraireFromBasic, HEURES_PAR_MOIS } from './disturbance-allowance'

describe('tauxHoraireFromBasic', () => {
  it('divides salary by 195 and rounds to 2 decimals', () => {
    expect(tauxHoraireFromBasic(19500)).toBe(100)
    expect(tauxHoraireFromBasic(15000)).toBe(76.92)
    expect(tauxHoraireFromBasic(25000)).toBe(128.21)
  })

  it('returns 0 for zero salary', () => {
    expect(tauxHoraireFromBasic(0)).toBe(0)
  })

  it('returns 0 for negative salary', () => {
    expect(tauxHoraireFromBasic(-5000)).toBe(0)
  })

  it('returns 0 for NaN / Infinity', () => {
    expect(tauxHoraireFromBasic(NaN)).toBe(0)
    expect(tauxHoraireFromBasic(Infinity)).toBe(0)
  })

  it('HEURES_PAR_MOIS constant is 195', () => {
    expect(HEURES_PAR_MOIS).toBe(195)
  })
})
