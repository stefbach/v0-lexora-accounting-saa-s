import { describe, it, expect } from 'vitest'
import { isDeclarationRequired, controlLevel, isKycComplete, needsAnnualAttestation, UBO_DECLARATION_THRESHOLD_PCT } from './ubo'

describe('UBO — isDeclarationRequired', () => {
  it('TRUE si ≥10%', () => {
    expect(isDeclarationRequired(10)).toBe(true)
    expect(isDeclarationRequired(25)).toBe(true)
  })
  it('FALSE si <10%', () => {
    expect(isDeclarationRequired(5)).toBe(false)
  })
})

describe('UBO — controlLevel', () => {
  it('controlling ≥ 25%', () => {
    expect(controlLevel(25)).toBe('controlling')
    expect(controlLevel(60)).toBe('controlling')
  })
  it('significant entre 10 et 25%', () => {
    expect(controlLevel(15)).toBe('significant')
  })
  it('minor <10%', () => {
    expect(controlLevel(5)).toBe('minor')
  })
})

describe('UBO — isKycComplete', () => {
  const required = [
    { type: 'passport_copy' as const, file_id: 'a', uploaded_at: '2025-01-01' },
    { type: 'utility_bill' as const, file_id: 'b', uploaded_at: '2025-01-01' },
    { type: 'sanctions_check' as const, file_id: 'c', uploaded_at: '2025-01-01' },
  ]
  it('TRUE si les 3 docs requis sont présents', () => {
    expect(isKycComplete(required)).toBe(true)
  })
  it('FALSE si manque un doc requis', () => {
    expect(isKycComplete(required.slice(0, 2))).toBe(false)
  })
  it('FALSE si vide', () => {
    expect(isKycComplete([])).toBe(false)
  })
})

describe('UBO — needsAnnualAttestation', () => {
  it('TRUE si jamais vérifié', () => {
    expect(needsAnnualAttestation(null)).toBe(true)
    expect(needsAnnualAttestation(undefined)).toBe(true)
  })
  it('TRUE si dernière vérification > 12 mois', () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString()
    expect(needsAnnualAttestation(twoYearsAgo)).toBe(true)
  })
  it('FALSE si récent', () => {
    const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString()
    expect(needsAnnualAttestation(lastMonth)).toBe(false)
  })
})

describe('UBO — constants', () => {
  it('seuil déclaration 10%', () => {
    expect(UBO_DECLARATION_THRESHOLD_PCT).toBe(10)
  })
})
