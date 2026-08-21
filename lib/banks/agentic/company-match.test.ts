import { describe, it, expect } from 'vitest'
import {
  normalizeCompany,
  tokenMatches,
  scoreCompanyMatch,
  pickBestCompany,
} from './company-match'

describe('normalizeCompany', () => {
  it('minuscule, accents, ponctuation, espaces', () => {
    expect(normalizeCompany('  Digital Data  Solutions, Ltd.  ')).toBe('digital data solutions ltd')
    expect(normalizeCompany('Société Générale (Maurice) Ltée')).toBe('societe generale maurice ltee')
    expect(normalizeCompany('A & B Co')).toBe('a and b co')
  })
})

describe('tokenMatches', () => {
  it('exact', () => expect(tokenMatches('digital', 'digital')).toBe(true))
  it('préfixe / abréviation', () => {
    expect(tokenMatches('solutions', 'sol')).toBe(true)
    expect(tokenMatches('commercial', 'comm')).toBe(true)
    expect(tokenMatches('management', 'mgmt')).toBe(false) // mgmt n'est pas un préfixe
  })
  it('synonymes de forme juridique', () => {
    expect(tokenMatches('limited', 'ltd')).toBe(true)
    expect(tokenMatches('ltee', 'ltd')).toBe(true)
  })
  it('préfixe trop court refusé', () => {
    expect(tokenMatches('sa', 'sales')).toBe(false) // min < 3
  })
  it('mots distincts', () => expect(tokenMatches('marketing', 'data')).toBe(false))
})

describe('scoreCompanyMatch — cas MCB réel', () => {
  it('« Digital Data Solutions Ltd » matche « DIGITAL DATA SOL LTD » à 1.0', () => {
    const s = scoreCompanyMatch('Digital Data Solutions Ltd', 'DIGITAL DATA SOL LTD')
    expect(s).toBe(1)
  })
  it('une société sans rapport score bas', () => {
    expect(scoreCompanyMatch('Digital Data Solutions Ltd', 'View consolidated account summary')).toBeLessThan(0.3)
  })
  it('une société partiellement homonyme mais distincte est pénalisée', () => {
    // Cible = Digital Data Solutions ; candidat = Digital Marketing → 1 token sur 3.
    expect(scoreCompanyMatch('Digital Data Solutions Ltd', 'Digital Marketing Ltd')).toBeLessThan(0.6)
  })
  it('candidat plus large que la cible est pénalisé (couverture candidat)', () => {
    const exact = scoreCompanyMatch('Digital Data Solutions Ltd', 'Digital Data Sol Ltd')
    const large = scoreCompanyMatch('Digital Data Solutions Ltd', 'Digital Data Marketing Analytics Ltd')
    expect(large).toBeLessThan(exact)
  })
})

describe('pickBestCompany', () => {
  it('sélectionne la bonne société malgré l’abréviation', () => {
    const r = pickBestCompany('Digital Data Solutions Ltd', [
      'View consolidated account summary',
      'DIGITAL DATA SOL LTD',
    ])
    expect(r).not.toBeNull()
    expect(r!.candidate).toBe('DIGITAL DATA SOL LTD')
    expect(r!.ambiguous).toBe(false)
  })

  it('candidat unique retenu même sous le seuil normal', () => {
    const r = pickBestCompany('Digital Data Solutions Ltd', ['DIGITAL DATA SOL LTD'])
    expect(r).not.toBeNull()
    expect(r!.index).toBe(0)
  })

  it('aucun candidat pertinent → null', () => {
    const r = pickBestCompany('Digital Data Solutions Ltd', [
      'Terms and Conditions',
      'Cookies Policy',
    ])
    expect(r).toBeNull()
  })

  it('deux sociétés homonymes proches → ambiguous', () => {
    const r = pickBestCompany('Digital Data Ltd', [
      'DIGITAL DATA NORTH LTD',
      'DIGITAL DATA SOUTH LTD',
    ])
    expect(r).not.toBeNull()
    expect(r!.ambiguous).toBe(true)
  })

  it('liste vide → null', () => {
    expect(pickBestCompany('X Ltd', [])).toBeNull()
  })
})
