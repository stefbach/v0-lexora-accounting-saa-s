import { describe, it, expect } from 'vitest'
import { retrieve, formatContextePrompt, formatCitations } from './retriever'
import { CORPUS_JURIDIQUE } from './corpus'

describe('RAG retriever juridique', () => {
  it('corpus non vide et bien formé', () => {
    expect(CORPUS_JURIDIQUE.length).toBeGreaterThan(20)
    for (const p of CORPUS_JURIDIQUE) {
      expect(p.id).toBeTruthy()
      expect(p.source).toBeTruthy()
      expect(p.reference).toBeTruthy()
      expect(p.texte.length).toBeGreaterThan(20)
    }
  })

  it('retrouve les bons passages pour une question de recouvrement', () => {
    const res = retrieve('mon client ne paie pas sa facture, recouvrement créance commerciale')
    expect(res.length).toBeGreaterThan(0)
    const sources = res.map((r) => r.source)
    // doit faire remonter le Code de Commerce (prescription) ou le Code Civil (mise en demeure)
    expect(sources.some((s) => /Code de Commerce|Code Civil/.test(s))).toBe(true)
  })

  it('filtre par domaine', () => {
    const res = retrieve('licenciement severance salarié', { domaines: ['travail'] })
    expect(res.length).toBeGreaterThan(0)
    expect(res.every((r) => r.domaine === 'travail')).toBe(true)
  })

  it('retrouve la disposition fiscale ARC pour une objection MRA', () => {
    const res = retrieve('contester une cotisation MRA objection assessment ARC')
    expect(res.some((r) => r.source === 'ITA' || r.source === 'VAT Act')).toBe(true)
  })

  it('formate le contexte et les citations', () => {
    const res = retrieve('oppression actionnaire minoritaire société')
    const ctx = formatContextePrompt(res)
    expect(ctx).toContain('SOURCES')
    const cites = formatCitations(res)
    expect(cites[0]?.ref).toBe('S1')
  })

  it('retourne un message explicite quand aucun passage ne matche', () => {
    const ctx = formatContextePrompt([])
    // Message durci (FAILLE-3, #394) : interdiction d'émettre une affirmation
    // juridique non sourcée quand le corpus ne renvoie rien.
    expect(ctx).toContain('AUCUN passage pertinent')
  })
})
