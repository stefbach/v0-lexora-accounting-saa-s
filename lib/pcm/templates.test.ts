import { describe, it, expect } from 'vitest'
import { validateTemplate, deriveParent, sortComptes } from './templates'
import { PCMError } from './errors'

const validTemplate = {
  code: 'test_core',
  nom: 'Test',
  type: 'core',
  juridiction_code: 'MU',
  version: '1.0.0',
  prerequisites: [],
  comptes: [
    { numero: '401', intitule: 'Fournisseurs', classe: 4, type: 'passif', sens_normal: 'credit', lettrable: true, obligatoire: true },
    { numero: '4511.OCC', intitule: 'CC OCC', classe: 4, type: 'mixte', sens_normal: 'mixte', lettrable: true, obligatoire: false },
  ],
}

describe('validateTemplate', () => {
  it('accepte un template valide', () => {
    const t = validateTemplate(validTemplate)
    expect(t.code).toBe('test_core')
    expect(t.comptes).toHaveLength(2)
  })

  it('rejette un template sans comptes', () => {
    expect(() => validateTemplate({ ...validTemplate, comptes: [] })).toThrow(PCMError)
  })

  it('rejette un numéro de compte invalide', () => {
    const bad = { ...validTemplate, comptes: [{ ...validTemplate.comptes[0], numero: 'ABC' }] }
    expect(() => validateTemplate(bad)).toThrow(PCMError)
  })

  it('rejette une incohérence classe/numéro (PCM_009)', () => {
    const bad = { ...validTemplate, comptes: [{ ...validTemplate.comptes[0], numero: '601', classe: 4 }] }
    try {
      validateTemplate(bad)
      expect.unreachable('devrait throw')
    } catch (e) {
      expect(e).toBeInstanceOf(PCMError)
      expect((e as PCMError).code).toBe('PCM_009')
    }
  })

  it('rejette les numéros en doublon', () => {
    const bad = { ...validTemplate, comptes: [validTemplate.comptes[0], validTemplate.comptes[0]] }
    expect(() => validateTemplate(bad)).toThrow(PCMError)
  })

  it('rejette un type invalide', () => {
    const bad = { ...validTemplate, comptes: [{ ...validTemplate.comptes[0], type: 'invalide' }] }
    expect(() => validateTemplate(bad)).toThrow(PCMError)
  })
})

describe('deriveParent', () => {
  it('retourne null pour un compte racine', () => {
    expect(deriveParent('401')).toBeNull()
    expect(deriveParent('4511')).toBeNull()
  })
  it('extrait le parent d\'un sous-compte', () => {
    expect(deriveParent('4511.OCC')).toBe('4511')
    expect(deriveParent('701.SKYCALL')).toBe('701')
  })
})

describe('sortComptes', () => {
  it('trie numériquement avec sous-comptes', () => {
    const input = [{ numero: '4511.OCC' }, { numero: '401' }, { numero: '101' }, { numero: '4511' }]
    const sorted = sortComptes(input).map(c => c.numero)
    expect(sorted[0]).toBe('101')
    expect(sorted[1]).toBe('401')
    expect(sorted.indexOf('4511')).toBeLessThan(sorted.indexOf('4511.OCC'))
  })
})
