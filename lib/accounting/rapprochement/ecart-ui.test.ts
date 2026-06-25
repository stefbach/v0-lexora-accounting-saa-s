import { describe, it, expect } from 'vitest'
import { resolveEcartCompte, ECART_TYPE_OPTIONS } from './ecart-ui'

describe('resolveEcartCompte', () => {
  it('returns null for auto', () => {
    expect(resolveEcartCompte('auto', 1)).toBeNull()
    expect(resolveEcartCompte('auto', -1)).toBeNull()
  })

  it('always returns 471 for attente regardless of sign', () => {
    expect(resolveEcartCompte('attente', 1)?.compte).toBe('471')
    expect(resolveEcartCompte('attente', -1)?.compte).toBe('471')
  })

  it('returns 766 (gain) for positive change', () => {
    expect(resolveEcartCompte('change', 1)?.compte).toBe('766')
  })

  it('returns 666 (perte) for negative change', () => {
    expect(resolveEcartCompte('change', -1)?.compte).toBe('666')
  })

  it('returns 765 escompte obtenu for positive escompte', () => {
    expect(resolveEcartCompte('escompte', 1)?.compte).toBe('765')
  })

  it('returns 665 escompte accordé for negative escompte', () => {
    expect(resolveEcartCompte('escompte', -1)?.compte).toBe('665')
  })

  it('always returns 631 for penalite', () => {
    expect(resolveEcartCompte('penalite', 1)?.compte).toBe('631')
    expect(resolveEcartCompte('penalite', -1)?.compte).toBe('631')
  })

  it('returns 758 for positive exceptionnel', () => {
    expect(resolveEcartCompte('exceptionnel', 1)?.compte).toBe('758')
  })

  it('returns 658 for negative exceptionnel', () => {
    expect(resolveEcartCompte('exceptionnel', -1)?.compte).toBe('658')
  })
})

describe('ECART_TYPE_OPTIONS', () => {
  it('has 6 options', () => {
    expect(ECART_TYPE_OPTIONS).toHaveLength(6)
  })

  it('all options have value and label', () => {
    for (const opt of ECART_TYPE_OPTIONS) {
      expect(opt.value).toBeTruthy()
      expect(opt.label).toBeTruthy()
    }
  })
})
