import { describe, it, expect } from 'vitest'
import {
  WIZARD_STEPS, NB_ETAPES_ACTION, firstIncompleteStep, wizardTermine,
  nbEtapesFaites, stepFait,
} from '@/lib/onboarding/wizard'
import type { OnboardingSignals } from '@/lib/onboarding/checklist'

const vide: OnboardingSignals = {
  profil_complet: false, banque_connectee: false, a_document: false,
  soldes_ouverture: false, a_salarie: false,
}

describe('wizard', () => {
  it('4 étapes dont 1 finale → 3 étapes action', () => {
    expect(WIZARD_STEPS).toHaveLength(4)
    expect(NB_ETAPES_ACTION).toBe(3)
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1].finale).toBe(true)
  })

  it('tout à faire → ouvre sur l’étape 0 (profil), non terminé', () => {
    expect(firstIncompleteStep(vide)).toBe(0)
    expect(wizardTermine(vide)).toBe(false)
    expect(nbEtapesFaites(vide)).toBe(0)
  })

  it('profil fait → ouvre sur banque (index 1)', () => {
    expect(firstIncompleteStep({ ...vide, profil_complet: true })).toBe(1)
    expect(nbEtapesFaites({ ...vide, profil_complet: true })).toBe(1)
  })

  it('profil + document faits mais banque non → ouvre sur banque (première trouée)', () => {
    const s = { ...vide, profil_complet: true, a_document: true }
    expect(firstIncompleteStep(s)).toBe(1)
  })

  it('les 3 étapes action faites → écran final, terminé (soldes/salariés ignorés)', () => {
    const s: OnboardingSignals = {
      profil_complet: true, banque_connectee: true, a_document: true,
      soldes_ouverture: false, a_salarie: false,
    }
    expect(firstIncompleteStep(s)).toBe(3)
    expect(WIZARD_STEPS[firstIncompleteStep(s)].finale).toBe(true)
    expect(wizardTermine(s)).toBe(true)
    expect(nbEtapesFaites(s)).toBe(3)
  })

  it('stepFait renvoie false pour l’étape finale', () => {
    const finale = WIZARD_STEPS.find(s => s.finale)!
    expect(stepFait(finale, { ...vide, profil_complet: true, banque_connectee: true, a_document: true })).toBe(false)
  })
})
