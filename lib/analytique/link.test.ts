import { describe, it, expect } from 'vitest'
import { tagLines } from './link'

describe('tagLines', () => {
  it('injecte section_analytique_id + ordre_fabrication_id sur chaque ligne', () => {
    const lignes = [
      { numero_compte: '3300', debit_mur: 100, credit_mur: 0 },
      { numero_compte: '3701', debit_mur: 0, credit_mur: 100 },
    ]
    const tagged = tagLines(lignes, { section_analytique_id: 'sec-1', ordre_fabrication_id: 'of-1' })
    expect(tagged).toHaveLength(2)
    expect(tagged[0]).toMatchObject({ numero_compte: '3300', section_analytique_id: 'sec-1', ordre_fabrication_id: 'of-1' })
    expect(tagged[1].section_analytique_id).toBe('sec-1')
  })
  it('préserve les champs d’origine et accepte une section null', () => {
    const tagged = tagLines([{ a: 1 }], { section_analytique_id: null })
    expect(tagged[0]).toEqual({ a: 1, section_analytique_id: null })
  })
})
