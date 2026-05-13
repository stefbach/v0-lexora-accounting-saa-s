import { describe, it, expect } from 'vitest'
import { getActiveModules, suggestedDevise, isGbc, requiresFscLicense, type SocieteRegime } from './regime'

describe('regime — getActiveModules', () => {
  it('domestic : aucun module GBC activé', () => {
    const m = getActiveModules({ regime: 'domestic' })
    expect(m.gbc_modules_active).toBe(false)
    expect(m.per_active).toBe(false)
    expect(m.substance_required).toBe(false)
    expect(m.ubo_required).toBe(false)
    expect(m.consolidation_active).toBe(false)
    expect(m.crs_fatca_active).toBe(false)
    expect(m.pillar_two_eligible).toBe(false)
    expect(m.ifrs16_leases_active).toBe(true)  // cross-cutting
  })

  it('gbc1 : tous les modules sauf consolidation/pillar_two', () => {
    const m = getActiveModules({ regime: 'gbc1', devise_fonctionnelle: 'USD' })
    expect(m.gbc_modules_active).toBe(true)
    expect(m.per_active).toBe(true)
    expect(m.substance_required).toBe(true)
    expect(m.ubo_required).toBe(true)
    expect(m.tp_required).toBe(true)
    expect(m.consolidation_active).toBe(false)
    expect(m.crs_fatca_active).toBe(true)
    expect(m.pillar_two_eligible).toBe(false)
    expect(m.ias21_translation_active).toBe(true)
  })

  it('authorised_company : pas de substance ni consolidation', () => {
    const m = getActiveModules({ regime: 'authorised_company', devise_fonctionnelle: 'USD' })
    expect(m.substance_required).toBe(false)  // AC = pas tax resident → pas de substance
    expect(m.per_active).toBe(true)
    expect(m.ubo_required).toBe(true)
    expect(m.crs_fatca_active).toBe(true)
  })

  it('holding : consolidation + pillar two eligible', () => {
    const m = getActiveModules({ regime: 'holding' })
    expect(m.consolidation_active).toBe(true)
    expect(m.pillar_two_eligible).toBe(true)
    expect(m.substance_required).toBe(true)
    expect(m.crs_fatca_active).toBe(false)  // pas de financial account holding par défaut
  })

  it('branch_foreign_pe : IAS 21 toujours actif', () => {
    const m = getActiveModules({ regime: 'branch_foreign_pe' })
    expect(m.ias21_translation_active).toBe(true)  // même sans devise étrangère explicite
  })

  it('domestic + devise USD (cas inhabituel) : translation IAS 21 active', () => {
    const m = getActiveModules({ regime: 'domestic', devise_fonctionnelle: 'USD' })
    expect(m.gbc_modules_active).toBe(false)
    expect(m.ias21_translation_active).toBe(true)  // basée sur devise, pas regime
  })
})

describe('regime — suggestedDevise', () => {
  it('USD pour GBC1/AC/holding', () => {
    expect(suggestedDevise('gbc1')).toBe('USD')
    expect(suggestedDevise('authorised_company')).toBe('USD')
    expect(suggestedDevise('holding')).toBe('USD')
  })
  it('MUR pour domestic', () => {
    expect(suggestedDevise('domestic')).toBe('MUR')
  })
  it('EUR pour branch (hypothèse)', () => {
    expect(suggestedDevise('branch_foreign_pe')).toBe('EUR')
  })
})

describe('regime — isGbc', () => {
  it('TRUE pour tous sauf domestic', () => {
    const regimes: SocieteRegime[] = ['gbc1', 'authorised_company', 'holding', 'branch_foreign_pe']
    for (const r of regimes) expect(isGbc(r)).toBe(true)
  })
  it('FALSE pour domestic/null/undefined', () => {
    expect(isGbc('domestic')).toBe(false)
    expect(isGbc(null)).toBe(false)
    expect(isGbc(undefined)).toBe(false)
  })
})

describe('regime — requiresFscLicense', () => {
  it('TRUE pour gbc1 et authorised_company', () => {
    expect(requiresFscLicense('gbc1')).toBe(true)
    expect(requiresFscLicense('authorised_company')).toBe(true)
  })
  it('FALSE pour domestic/holding/branch', () => {
    expect(requiresFscLicense('domestic')).toBe(false)
    expect(requiresFscLicense('holding')).toBe(false)
    expect(requiresFscLicense('branch_foreign_pe')).toBe(false)
  })
})
