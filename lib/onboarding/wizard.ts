/**
 * lib/onboarding/wizard.ts — Assistant de démarrage (cible A, lever 3).
 *
 * Le parcours guidé « une chose à la fois » qui amène un dirigeant tout neuf de
 * zéro à opérationnel : profil société → 1er relevé bancaire → 1er document →
 * prêt. Contrairement à la checklist passive du dashboard, l'assistant est
 * linéaire et reprend automatiquement à la première étape non faite.
 *
 * Pur → testable, aucune dépendance UI/réseau.
 */

import type { OnboardingSignals } from './checklist'

export type WizardStepKey = 'profil' | 'banque' | 'document' | 'pret'

export interface WizardStep {
  key: WizardStepKey
  titre: string
  /** Étape « prêt » (écran final) : pas de signal, marque la fin du parcours. */
  finale: boolean
  /** Nom du signal qui valide l'étape (absent pour l'étape finale). */
  signal?: keyof OnboardingSignals
}

/** Les 4 étapes du parcours, dans l'ordre. */
export const WIZARD_STEPS: readonly WizardStep[] = [
  { key: 'profil', titre: 'Votre société', finale: false, signal: 'profil_complet' },
  { key: 'banque', titre: 'Votre banque', finale: false, signal: 'banque_connectee' },
  { key: 'document', titre: 'Votre premier document', finale: false, signal: 'a_document' },
  { key: 'pret', titre: 'Prêt à démarrer', finale: true },
]

/** Nombre d'étapes « action » (hors écran final). */
export const NB_ETAPES_ACTION = WIZARD_STEPS.filter(s => !s.finale).length

/** Une étape action est-elle faite, d'après les signaux ? */
export function stepFait(step: WizardStep, s: OnboardingSignals): boolean {
  if (step.finale) return false
  return step.signal ? !!s[step.signal] : false
}

/**
 * Index de la première étape non faite → sur quoi ouvrir l'assistant.
 * Si toutes les étapes action sont faites, renvoie l'index de l'écran final.
 */
export function firstIncompleteStep(s: OnboardingSignals): number {
  for (let i = 0; i < WIZARD_STEPS.length; i++) {
    const step = WIZARD_STEPS[i]
    if (step.finale) return i // toutes les précédentes faites → écran final
    if (!stepFait(step, s)) return i
  }
  return WIZARD_STEPS.length - 1
}

/** Toutes les étapes action sont-elles faites (parcours terminé) ? */
export function wizardTermine(s: OnboardingSignals): boolean {
  return WIZARD_STEPS.every(step => step.finale || stepFait(step, s))
}

/** Nombre d'étapes action faites (pour la barre de progression). */
export function nbEtapesFaites(s: OnboardingSignals): number {
  return WIZARD_STEPS.reduce((n, step) => n + (stepFait(step, s) ? 1 : 0), 0)
}
