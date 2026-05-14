import { describe, it, expect } from 'vitest'
import { isFatcaReportable, isCrsReportable, generateCrsXmlSkeleton, CRS_REPORTABLE_JURISDICTIONS } from './crs-fatca'

describe('CRS/FATCA — isFatcaReportable', () => {
  it('TRUE si US Person individuel ≥ $50k', () => {
    expect(isFatcaReportable('individual', 50_000, true)).toBe(true)
    expect(isFatcaReportable('individual', 100_000, true)).toBe(true)
  })
  it('FALSE si non US Person', () => {
    expect(isFatcaReportable('individual', 1_000_000, false)).toBe(false)
  })
  it('FALSE si individuel < $50k', () => {
    expect(isFatcaReportable('individual', 30_000, true)).toBe(false)
  })
  it('Entity threshold $250k', () => {
    expect(isFatcaReportable('entity', 300_000, true)).toBe(true)
    expect(isFatcaReportable('entity', 200_000, true)).toBe(false)
  })
})

describe('CRS/FATCA — isCrsReportable', () => {
  it('TRUE pour juridictions CRS courantes', () => {
    expect(isCrsReportable('FR')).toBe(true)
    expect(isCrsReportable('GB')).toBe(true)
    expect(isCrsReportable('ZA')).toBe(true)
    expect(isCrsReportable('SG')).toBe(true)
  })
  it('FALSE pour juridictions non listées', () => {
    expect(isCrsReportable('MU')).toBe(false)  // Maurice = pays déclarant, pas reportable
    expect(isCrsReportable('XX')).toBe(false)
  })
  it('case-insensitive', () => {
    expect(isCrsReportable('fr')).toBe(true)
  })
})

describe('CRS/FATCA — generateCrsXmlSkeleton', () => {
  it('génère un XML valide avec namespaces CRS', () => {
    const xml = generateCrsXmlSkeleton({
      reportingYear: 2025,
      societeName: 'Acme Holdings Ltd',
      societeTin: 'MU-12345',
      holders: [{
        holderName: 'John Doe', countryOfResidence: 'FR',
        tin: 'FR-987', accountNumber: 'ACC-001',
        balanceUsd: 250000, interestUsd: 5000,
      }],
    })
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('xmlns:crs="urn:oecd:ties:crs:v2"')
    expect(xml).toContain('Acme Holdings Ltd')
    expect(xml).toContain('John Doe')
    expect(xml).toContain('250000.00')
    expect(xml).toContain('CRS502')  // Type Interest
  })

  it('omet les sections de paiement vides', () => {
    const xml = generateCrsXmlSkeleton({
      reportingYear: 2025, societeName: 'X', societeTin: 'Y',
      holders: [{
        holderName: 'A', countryOfResidence: 'GB', accountNumber: '1', balanceUsd: 100,
      }],
    })
    expect(xml).not.toContain('CRS502')
    expect(xml).not.toContain('CRS501')
  })
})

describe('CRS/FATCA — jurisdictions list', () => {
  it('contient les juridictions UE majeures', () => {
    ;['FR','DE','BE','LU','NL','IT'].forEach(c => expect(CRS_REPORTABLE_JURISDICTIONS.has(c)).toBe(true))
  })
})
