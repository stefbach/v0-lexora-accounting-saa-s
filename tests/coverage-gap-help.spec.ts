/**
 * Coverage-gap test — Phase V5-47.
 *
 * `lib/help/content.ts` and `lib/help/content-en.ts` are large static maps
 * consumed by the <PageHelp /> drawer. They contain no runtime branches,
 * yet account for ~4.5k uncovered lines. A single import lifts both files
 * fully into coverage and catches accidental syntax breaks in CI.
 */
import { describe, it, expect } from 'vitest'

import * as helpFr from '@/lib/help/content'
import * as helpEn from '@/lib/help/content-en'

describe('help content — coverage gap', () => {
  it('loads the French help content map', () => {
    const exported = Object.values(helpFr)
    expect(exported.length).toBeGreaterThan(0)
    // At least one exported value should be a non-empty object/map.
    const hasContent = exported.some((value) => {
      if (!value) return false
      if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
      return false
    })
    expect(hasContent).toBe(true)
  })

  it('loads the English help content map', () => {
    const exported = Object.values(helpEn)
    expect(exported.length).toBeGreaterThan(0)
    const hasContent = exported.some((value) => {
      if (!value) return false
      if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
      return false
    })
    expect(hasContent).toBe(true)
  })
})
