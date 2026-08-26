import { describe, it, expect } from 'vitest'
import { buildPlanComptableSection } from '../prompts'
import {
  COMPTES_POSTABLES_SNAPSHOT,
  FIXTURES_CATEGORISATION,
  CODES_DERIVE_A_BANNIR,
} from '../__fixtures__/factures-categorisation'

const CODES = new Set(COMPTES_POSTABLES_SNAPSHOT.map((c) => c.compte))

describe('non-régression catégorisation facture', () => {
  it('chaque compte attendu par une fixture EXISTE dans le plan réel', () => {
    const manquants = FIXTURES_CATEGORISATION.filter((f) => !CODES.has(f.compteAttendu))
    expect(manquants.map((f) => `${f.label} → ${f.compteAttendu}`)).toEqual([])
  })

  it('les alternatives acceptables existent aussi', () => {
    for (const f of FIXTURES_CATEGORISATION) {
      for (const alt of f.comptesAcceptables || []) expect(CODES.has(alt)).toBe(true)
    }
  })

  it('électricité et eau ont désormais un compte dédié (mig 508)', () => {
    expect(CODES.has('6263')).toBe(true)
    expect(CODES.has('6264')).toBe(true)
  })

  it('les codes de la dérive prompt↔plan n\'existent pas (le fix ne doit pas régresser)', () => {
    for (const code of CODES_DERIVE_A_BANNIR) expect(CODES.has(code)).toBe(false)
  })

  it('la section plan injectée dans le prompt contient chaque compte attendu', () => {
    const section = buildPlanComptableSection(COMPTES_POSTABLES_SNAPSHOT)
    for (const f of FIXTURES_CATEGORISATION) {
      expect(section).toContain(`- ${f.compteAttendu} `)
    }
  })
})
