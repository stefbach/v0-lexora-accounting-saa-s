import { describe, it, expect } from 'vitest'
import { isUuid, asUuid } from './uuid'

describe('isUuid', () => {
  it('accepte un uuid v4 canonique', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true)
  })

  it('accepte la casse majuscule et les espaces autour', () => {
    expect(isUuid('  3F2504E0-4F89-41D3-9A0C-0305E82C3301  ')).toBe(true)
  })

  it('rejette les sentinelles d\'UI Radix', () => {
    expect(isUuid('none')).toBe(false)
    expect(isUuid('manual')).toBe(false)
    expect(isUuid('all')).toBe(false)
  })

  it('rejette le vide et les types non-string', () => {
    expect(isUuid('')).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(42)).toBe(false)
    expect(isUuid({})).toBe(false)
  })

  it('rejette un uuid tronqué ou sans tirets', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c')).toBe(false)
    expect(isUuid('3f2504e04f8941d39a0c0305e82c3301')).toBe(false)
  })
})

describe('asUuid', () => {
  it('renvoie l\'uuid normalisé', () => {
    expect(asUuid(' 3f2504e0-4f89-41d3-9a0c-0305e82c3301 ')).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
  })

  it('renvoie null pour "none" — cause du 500 uuid sur nouvelle-facture', () => {
    expect(asUuid('none')).toBeNull()
  })

  it('renvoie null pour vide/undefined/null', () => {
    expect(asUuid('')).toBeNull()
    expect(asUuid(undefined)).toBeNull()
    expect(asUuid(null)).toBeNull()
  })
})
