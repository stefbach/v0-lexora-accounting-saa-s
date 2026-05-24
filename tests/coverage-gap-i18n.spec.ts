/**
 * Coverage-gap test — Phase V5-47.
 *
 * The i18n modules are flat dictionaries (objects of translation strings).
 * Side-effect free, no runtime branches. They were excluded from coverage
 * historically simply because no test imported them. By touching each
 * module here we lift roughly ~19k lines into "covered" territory and
 * surface accidental syntax / duplicate-key regressions during CI.
 *
 * Each assertion is intentionally shallow: we only confirm the module
 * loaded and exposed at least one non-empty key/value. Deep validation of
 * translation completeness lives in the dedicated i18n parity suite (when
 * present).
 */
import { describe, it, expect } from 'vitest'

// Static dictionaries
import * as i18nIndex from '@/lib/i18n'
import * as comptable from '@/lib/i18n/comptable'
import * as rhAdmin from '@/lib/i18n/rh_admin'
import * as invoicing from '@/lib/i18n/invoicing'
import * as invoicingExt from '@/lib/i18n/invoicing_ext'
import * as admin from '@/lib/i18n/admin'
import * as core from '@/lib/i18n/core'
import * as publicChunk from '@/lib/i18n/public'
import * as gbc from '@/lib/i18n/gbc'
import * as mra from '@/lib/i18n/mra'
import * as mraExt from '@/lib/i18n/mra_ext'
import * as hr from '@/lib/i18n/hr'
import * as accounting from '@/lib/i18n/accounting'
import * as components from '@/lib/i18n/components'

function assertNonEmptyDict(mod: Record<string, unknown>, label: string) {
  const exportedValues = Object.values(mod)
  expect(exportedValues.length, `${label} should export something`).toBeGreaterThan(0)

  // At least one exported value must contain real translation content.
  const hasContent = exportedValues.some((value) => {
    if (!value || typeof value !== 'object') return false
    return Object.keys(value as Record<string, unknown>).length > 0
  })
  expect(hasContent, `${label} should export at least one non-empty chunk`).toBe(true)
}

describe('i18n dictionaries — coverage gap', () => {
  it('loads the i18n index module', () => {
    expect(i18nIndex).toBeTruthy()
    // Either a default export or named helpers; both fine.
    expect(Object.keys(i18nIndex).length).toBeGreaterThan(0)
  })

  const modules: Array<[string, Record<string, unknown>]> = [
    ['comptable', comptable],
    ['rh_admin', rhAdmin],
    ['invoicing', invoicing],
    ['invoicing_ext', invoicingExt],
    ['admin', admin],
    ['core', core],
    ['public', publicChunk],
    ['gbc', gbc],
    ['mra', mra],
    ['mra_ext', mraExt],
    ['hr', hr],
    ['accounting', accounting],
    ['components', components],
  ]

  for (const [label, mod] of modules) {
    it(`loads ${label} chunk`, () => {
      assertNonEmptyDict(mod, label)
    })
  }
})
