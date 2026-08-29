import { describe, it, expect } from 'vitest'
import { computeChecklist, type OnboardingSignals } from '@/lib/onboarding/checklist'

const vide: OnboardingSignals = {
  profil_complet: false, banque_connectee: false, a_document: false,
  soldes_ouverture: false, a_salarie: false,
}

describe('computeChecklist', () => {
  it('tout à faire → progression 0, non terminé, 4 étapes requises', () => {
    const r = computeChecklist(vide)
    expect(r.progression).toBe(0)
    expect(r.termine).toBe(false)
    expect(r.nb_requis).toBe(4)
    expect(r.nb_requis_faits).toBe(0)
    expect(r.items).toHaveLength(5) // 4 requises + 1 optionnelle
  })

  it('progression sur les étapes requises uniquement (salariés optionnel)', () => {
    const r = computeChecklist({ ...vide, profil_complet: true, banque_connectee: true })
    expect(r.progression).toBe(50) // 2/4
    expect(r.termine).toBe(false)
  })

  it('les 4 requises faites → terminé même sans salariés', () => {
    const r = computeChecklist({
      profil_complet: true, banque_connectee: true, a_document: true,
      soldes_ouverture: true, a_salarie: false,
    })
    expect(r.progression).toBe(100)
    expect(r.termine).toBe(true)
  })

  it('les étapes non faites remontent en tête, optionnelles en fin', () => {
    const r = computeChecklist({ ...vide, profil_complet: true })
    // profil (fait) ne doit pas être en 1re position ; une non-faite requise oui
    expect(r.items[0].fait).toBe(false)
    expect(r.items[0].optionnel).toBe(false)
    expect(r.items[r.items.length - 1].optionnel).toBe(true) // salariés en dernier
  })

  it('chaque item a un lien de navigation', () => {
    const r = computeChecklist(vide)
    expect(r.items.every(i => i.lien.startsWith('/'))).toBe(true)
  })
})
