import { describe, it, expect } from 'vitest'
import { isPostableAccount } from './postable'

describe('isPostableAccount', () => {
  it('compte détail (sans sous-compte) → postable', () => {
    expect(isPostableAccount({ hasActiveChildren: false, hasEcritures: false })).toBe(true)
    expect(isPostableAccount({ hasActiveChildren: false, hasEcritures: true })).toBe(true)
  })
  it('compte parent SANS écriture → non-postable (regroupement)', () => {
    expect(isPostableAccount({ hasActiveChildren: true, hasEcritures: false })).toBe(false)
  })
  it('compte collectif mouvementé (401/411/512…) → reste postable malgré ses sous-comptes', () => {
    expect(isPostableAccount({ hasActiveChildren: true, hasEcritures: true })).toBe(true)
  })
})
