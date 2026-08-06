import { describe, it, expect } from 'vitest'
import { isUuid, cleanUuid, cleanUuidFields } from './uuid'

const UUID = '3f0c2b1a-9d4e-4c8b-8f1a-2e5d6c7b8a90'

describe('isUuid', () => {
  it('accepte un uuid v4 (casse indifférente, espaces tolérés)', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid(UUID.toUpperCase())).toBe(true)
    expect(isUuid(`  ${UUID}  `)).toBe(true)
  })

  it('refuse les sentinelles et les valeurs non-uuid', () => {
    expect(isUuid('none')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(42)).toBe(false)
    expect(isUuid('3f0c2b1a-9d4e-4c8b-8f1a')).toBe(false)
  })
})

describe('cleanUuid', () => {
  it('renvoie null sur la sentinelle "none" du <Select>', () => {
    // Régression : template_id="none" partait en base et provoquait
    // `invalid input syntax for type uuid: "none"` à la création de facture.
    expect(cleanUuid('none')).toBeNull()
    expect(cleanUuid('None')).toBeNull()
  })

  it('renvoie null sur les autres formes de valeur absente', () => {
    expect(cleanUuid('')).toBeNull()
    expect(cleanUuid('   ')).toBeNull()
    expect(cleanUuid('null')).toBeNull()
    expect(cleanUuid('undefined')).toBeNull()
    expect(cleanUuid(null)).toBeNull()
    expect(cleanUuid(undefined)).toBeNull()
    expect(cleanUuid({})).toBeNull()
  })

  it('renvoie null sur un identifiant legacy non-uuid (localStorage)', () => {
    expect(cleanUuid('client-1712345678901')).toBeNull()
  })

  it('conserve un uuid valide et le débarrasse des espaces', () => {
    expect(cleanUuid(UUID)).toBe(UUID)
    expect(cleanUuid(` ${UUID} `)).toBe(UUID)
    expect(cleanUuid(UUID.toUpperCase())).toBe(UUID.toUpperCase())
  })
})

describe('cleanUuidFields', () => {
  it('nettoie uniquement les clés présentes', () => {
    const payload: Record<string, unknown> = { template_id: 'none', contact_id: UUID, tiers: 'ACME' }
    cleanUuidFields(payload, ['template_id', 'contact_id', 'facture_reference_id'])
    expect(payload).toEqual({ template_id: null, contact_id: UUID, tiers: 'ACME' })
  })

  it("n'introduit pas une clé absente (PATCH partiel ne doit rien écraser)", () => {
    const payload: Record<string, unknown> = { statut: 'brouillon' }
    cleanUuidFields(payload, ['template_id'])
    expect('template_id' in payload).toBe(false)
  })
})
