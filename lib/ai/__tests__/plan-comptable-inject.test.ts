import { describe, it, expect } from 'vitest'
import { buildPlanComptableSection, injectPlanComptable } from '../prompts'

describe('buildPlanComptableSection', () => {
  it('liste les comptes réels triés avec la règle de source de vérité', () => {
    const s = buildPlanComptableSection([
      { compte: '651', libelle: 'Redevances licences SaaS' },
      { compte: '601', libelle: 'Achats de marchandises' },
      { compte: '6131', libelle: 'Loyers' },
    ])
    expect(s).toContain('SOURCE DE VÉRITÉ')
    // Triés par code
    expect(s.indexOf('- 601 ')).toBeLessThan(s.indexOf('- 6131 '))
    expect(s.indexOf('- 6131 ')).toBeLessThan(s.indexOf('- 651 '))
    expect(s).toContain('- 651 Redevances licences SaaS')
  })
  it('vide si aucun compte', () => {
    expect(buildPlanComptableSection([])).toBe('')
  })
})

describe('injectPlanComptable', () => {
  it('remplace le placeholder par le plan réel', () => {
    const out = injectPlanComptable('avant {{PLAN_COMPTABLE_REEL}} après', [
      { compte: '601', libelle: 'Achats de marchandises' },
    ])
    expect(out).not.toContain('{{PLAN_COMPTABLE_REEL}}')
    expect(out).toContain('- 601 Achats de marchandises')
  })
  it('retire proprement le placeholder sans comptes (repli conceptuel)', () => {
    const out = injectPlanComptable('x {{PLAN_COMPTABLE_REEL}} y', [])
    expect(out).toBe('x  y')
  })
  it('no-op si le prompt ne contient pas le placeholder', () => {
    const p = 'aucun placeholder ici'
    expect(injectPlanComptable(p, [{ compte: '601', libelle: 'X' }])).toBe(p)
  })
})
