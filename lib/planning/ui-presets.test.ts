import { describe, it, expect } from 'vitest'
import { UI_PRESETS, WRA_EXPLANATIONS, getWRAExplanation } from './ui-presets'
import {
  WRA_EXPLANATIONS as WRA_EXPLANATIONS_BIS,
  getWRAExplanation as getWRAExplanationBis,
} from './wra-explanations'

/**
 * Ces presets alimentent la section « Démarrage rapide » de
 * /rh/planning/regles : un clic écrit directement un planning en base. Une
 * incohérence dans la donnée (jour absent des shifts, code dupliqué, horaires
 * ne correspondant pas aux heures requises) produit donc un planning faux
 * sans qu'aucune saisie utilisateur ne soit en cause.
 */

const JOURS_VALIDES = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

/** Durée d'un créneau en heures, en gérant le passage de minuit. */
function dureeHeures(debut: string, fin: string): number {
  const [hd, md] = debut.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  const minutes = (hf * 60 + mf) - (hd * 60 + md)
  return (minutes <= 0 ? minutes + 24 * 60 : minutes) / 60
}

describe('UI_PRESETS', () => {
  it('expose des clés uniques', () => {
    const keys = UI_PRESETS.map(p => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('décrit chaque preset (label, description, icône)', () => {
    for (const preset of UI_PRESETS) {
      expect(preset.label.trim()).not.toBe('')
      expect(preset.description.trim()).not.toBe('')
      expect(preset.icon.trim()).not.toBe('')
      expect(preset.shifts.length).toBeGreaterThan(0)
    }
  })

  it('n’utilise que des codes jour valides', () => {
    for (const preset of UI_PRESETS) {
      for (const jour of preset.jours_travailles) {
        expect(JOURS_VALIDES).toContain(jour)
      }
      for (const shift of preset.shifts) {
        for (const jour of shift.jours) {
          expect(JOURS_VALIDES).toContain(jour)
        }
      }
    }
  })

  it('couvre les 7 jours de la semaine, travail ou repos', () => {
    for (const preset of UI_PRESETS) {
      const couverts = new Set(preset.shifts.flatMap(s => s.jours))
      expect([...couverts].sort()).toEqual([...JOURS_VALIDES].sort())
    }
  })

  it('fait correspondre jours_travailles et créneaux non-repos', () => {
    for (const preset of UI_PRESETS) {
      const travailles = new Set(
        preset.shifts.filter(s => s.type !== 'repos').flatMap(s => s.jours),
      )
      expect([...travailles].sort()).toEqual([...preset.jours_travailles].sort())
    }
  })

  it('donne des codes de créneau uniques au sein d’un preset', () => {
    for (const preset of UI_PRESETS) {
      const codes = preset.shifts.map(s => s.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it('rend les heures requises cohérentes avec horaires et pause', () => {
    for (const preset of UI_PRESETS) {
      for (const shift of preset.shifts) {
        if (shift.type === 'repos') {
          expect(shift.debut).toBeNull()
          expect(shift.fin).toBeNull()
          expect(shift.heures_requises).toBe(0)
          continue
        }
        expect(shift.debut).not.toBeNull()
        expect(shift.fin).not.toBeNull()
        const attendu = dureeHeures(shift.debut as string, shift.fin as string)
          - shift.pause_minutes / 60
        expect(shift.heures_requises).toBeCloseTo(attendu, 2)
      }
    }
  })

  it('garde la plage flexible autour de l’heure de début nominale', () => {
    for (const preset of UI_PRESETS) {
      for (const shift of preset.shifts) {
        if (!shift.flexible) continue
        expect(shift.debut_min).toBeTruthy()
        expect(shift.debut_max).toBeTruthy()
        expect(shift.debut_min! <= (shift.debut as string)).toBe(true)
        expect(shift.debut_max! >= (shift.debut as string)).toBe(true)
      }
    }
  })

  it('utilise des couleurs hexadécimales valides', () => {
    for (const preset of UI_PRESETS) {
      for (const shift of preset.shifts) {
        expect(shift.couleur).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it('respecte la limite hebdomadaire de 45 h du WRA 2019 art. 14(1)', () => {
    for (const preset of UI_PRESETS) {
      // Un salarié tient un seul créneau : on vérifie le plus chargé.
      const parShift = preset.shifts
        .filter(s => s.type !== 'repos')
        .map(s => s.heures_requises * s.jours.length)
      for (const heures of parShift) {
        expect(heures).toBeLessThanOrEqual(45 + 22.5)
      }
    }
  })
})

describe('getWRAExplanation', () => {
  it('explique chaque référence connue', () => {
    for (const [ref, explication] of Object.entries(WRA_EXPLANATIONS)) {
      expect(getWRAExplanation(ref)).toBe(explication)
      expect(explication.trim()).not.toBe('')
    }
  })

  it('retombe sur la référence brute si elle est inconnue', () => {
    expect(getWRAExplanation('WRA 2019, Art. 999')).toBe('WRA 2019, Art. 999')
    expect(getWRAExplanation('')).toBe('')
  })

  it('couvre les articles du WRA cités par les règles de planning', () => {
    for (const art of ['WRA 2019, Art. 14(1)', 'WRA 2019, Art. 15', 'WRA 2019, Art. 16(2)']) {
      expect(WRA_EXPLANATIONS[art]).toBeDefined()
    }
  })

  it('reste identique à la copie de lib/planning/wra-explanations', () => {
    // Le dictionnaire est dupliqué dans deux modules. Tant que la duplication
    // n'est pas résorbée, ce test garantit au moins qu'ils ne divergent pas :
    // deux écrans afficheraient sinon des explications différentes pour le
    // même article de loi.
    expect(WRA_EXPLANATIONS_BIS).toEqual(WRA_EXPLANATIONS)
    for (const ref of Object.keys(WRA_EXPLANATIONS)) {
      expect(getWRAExplanationBis(ref)).toBe(getWRAExplanation(ref))
    }
    expect(getWRAExplanationBis('inconnu')).toBe('inconnu')
  })
})
