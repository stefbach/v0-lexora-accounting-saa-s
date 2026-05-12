import { describe, it, expect } from 'vitest'
import { parseIban, inferSwiftFromIban, inferSwiftWithDiagnostic } from './iban-swift'

describe('parseIban', () => {
  it('parse un IBAN Maurice valide', () => {
    // MCB Maurice : MU17 MCBL 0101 1010 3030 0200 000 MUR (30 chars)
    const r = parseIban('MU17MCBL0101101030300200000MUR')
    expect(r.countryCode).toBe('MU')
    expect(r.bankCode).toBe('MCBL')
    expect(r.isValidFormat).toBe(true)
  })

  it('parse un IBAN France valide', () => {
    const r = parseIban('FR1430004000123456789012345')
    expect(r.countryCode).toBe('FR')
    expect(r.bankCode).toBe('30004')
    expect(r.isValidFormat).toBe(true)
  })

  it('gère les espaces et casse mixte', () => {
    const r = parseIban('  fr14 3000 4000 1234 5678 9012 345  ')
    expect(r.countryCode).toBe('FR')
    expect(r.bankCode).toBe('30004')
  })

  it('retourne isValidFormat=false sur IBAN trop court', () => {
    const r = parseIban('FR123')
    expect(r.isValidFormat).toBe(false)
  })

  it('retourne null bankCode sur entrée vide', () => {
    expect(parseIban('').bankCode).toBeNull()
    expect(parseIban(null).bankCode).toBeNull()
    expect(parseIban(undefined).bankCode).toBeNull()
  })
})

describe('inferSwiftFromIban', () => {
  it('déduit SWIFT pour MCB Maurice', () => {
    expect(inferSwiftFromIban('MU17MCBL0101101030300200000MUR')).toBe('MCBLMUMU')
  })

  it('déduit SWIFT pour SBM (STCB)', () => {
    expect(inferSwiftFromIban('MU17STCB0101101030300200000MUR')).toBe('STCBMUMU')
  })

  it('déduit SWIFT pour HSBC Maurice', () => {
    expect(inferSwiftFromIban('MU17HSBC0101101030300200000MUR')).toBe('HSBCMUMU')
  })

  it('déduit SWIFT pour BNP Paribas France', () => {
    expect(inferSwiftFromIban('FR1430004000123456789012345')).toBe('BNPAFRPP')
  })

  it('déduit SWIFT pour LCL France', () => {
    expect(inferSwiftFromIban('FR1430002000123456789012345')).toBe('CRLYFRPP')
  })

  it('retourne null pour banque Maurice inconnue', () => {
    expect(inferSwiftFromIban('MU17XXXX0101101030300200000MUR')).toBeNull()
  })

  it('retourne null pour pays non couvert', () => {
    expect(inferSwiftFromIban('IT60X0542811101000000123456')).toBeNull()
  })

  it('retourne null pour entrée vide', () => {
    expect(inferSwiftFromIban('')).toBeNull()
    expect(inferSwiftFromIban(null)).toBeNull()
  })
})

describe('inferSwiftWithDiagnostic', () => {
  it("retourne un message clair quand IBAN vide", () => {
    const r = inferSwiftWithDiagnostic('')
    expect(r.swift).toBeNull()
    expect(r.message).toMatch(/vide/)
  })

  it("retourne le SWIFT + message de confirmation quand reconnu", () => {
    const r = inferSwiftWithDiagnostic('MU17MCBL0101101030300200000MUR')
    expect(r.swift).toBe('MCBLMUMU')
    expect(r.countryCode).toBe('MU')
    expect(r.bankCode).toBe('MCBL')
    expect(r.message).toMatch(/reconnue/)
  })

  it("retourne null + message explicatif si banque inconnue", () => {
    const r = inferSwiftWithDiagnostic('MU17ZZZZ0101101030300200000MUR')
    expect(r.swift).toBeNull()
    expect(r.message).toMatch(/non reconnu/)
  })

  it("signale un format IBAN suspect", () => {
    const r = inferSwiftWithDiagnostic('FR12345')
    expect(r.swift).toBeNull()
    expect(r.message).toMatch(/Format/)
  })
})
