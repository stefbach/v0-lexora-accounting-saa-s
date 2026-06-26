import { describe, it, expect } from 'vitest'
import { normalizeResendDomain, fromEmailMatchesDomain } from './router'

describe('normalizeResendDomain', () => {
  it('met en minuscules et retire les espaces', () => {
    expect(normalizeResendDomain('  Lexora.Finance ')).toBe('lexora.finance')
  })
  it('retire un @ de tête', () => {
    expect(normalizeResendDomain('@societe.com')).toBe('societe.com')
  })
  it('gère une entrée vide', () => {
    expect(normalizeResendDomain('')).toBe('')
    expect(normalizeResendDomain(undefined as any)).toBe('')
  })
})

describe('fromEmailMatchesDomain', () => {
  it('accepte un expéditeur sur le domaine vérifié', () => {
    expect(fromEmailMatchesDomain('factures@societe.com', 'societe.com')).toBe(true)
  })
  it('est insensible à la casse et aux espaces', () => {
    expect(fromEmailMatchesDomain('  Contact@Societe.COM ', '  societe.com')).toBe(true)
  })
  it('accepte un domaine saisi avec @ de tête', () => {
    expect(fromEmailMatchesDomain('a@societe.com', '@societe.com')).toBe(true)
  })
  it('rejette un expéditeur sur un autre domaine', () => {
    expect(fromEmailMatchesDomain('factures@autre.com', 'societe.com')).toBe(false)
  })
  it('ne se laisse pas tromper par un sous-domaine non identique', () => {
    // "evilsociete.com" ne doit PAS matcher "societe.com"
    expect(fromEmailMatchesDomain('a@evilsociete.com', 'societe.com')).toBe(false)
  })
  it('rejette une adresse sans @', () => {
    expect(fromEmailMatchesDomain('societe.com', 'societe.com')).toBe(false)
  })
  it('rejette si email ou domaine vide', () => {
    expect(fromEmailMatchesDomain('', 'societe.com')).toBe(false)
    expect(fromEmailMatchesDomain('a@societe.com', '')).toBe(false)
  })
})
