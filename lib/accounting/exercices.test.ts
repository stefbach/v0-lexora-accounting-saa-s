import { describe, it, expect } from 'vitest'
import {
  exerciceDatesFromLabel,
  canTransition,
  actionIsAllowed,
  ACTION_TO_STATUT,
  seedExercicesFromLabels,
} from './exercices'

describe('exerciceDatesFromLabel', () => {
  it('« YYYY-YYYY » → juillet→juin (exercice mauricien)', () => {
    expect(exerciceDatesFromLabel('2025-2026')).toEqual({ date_debut: '2025-07-01', date_fin: '2026-06-30' })
    expect(exerciceDatesFromLabel('FY2024-2025')).toEqual({ date_debut: '2024-07-01', date_fin: '2025-06-30' })
  })
  it('« YYYY » → année civile', () => {
    expect(exerciceDatesFromLabel('2026')).toEqual({ date_debut: '2026-01-01', date_fin: '2026-12-31' })
  })
  it('rejette les années non consécutives et les formats inconnus', () => {
    expect(exerciceDatesFromLabel('2025-2027')).toBeNull()
    expect(exerciceDatesFromLabel('juin')).toBeNull()
    expect(exerciceDatesFromLabel('')).toBeNull()
  })
})

describe('transitions de statut', () => {
  it('ouvert → verrouille / cloture', () => {
    expect(canTransition('ouvert', 'verrouille')).toBe(true)
    expect(canTransition('ouvert', 'cloture')).toBe(true)
  })
  it('verrouille → ouvert (réajuster) ou cloture', () => {
    expect(canTransition('verrouille', 'ouvert')).toBe(true)
    expect(canTransition('verrouille', 'cloture')).toBe(true)
  })
  it('cloture → ouvert seulement (rouvrir pour réajuster)', () => {
    expect(canTransition('cloture', 'ouvert')).toBe(true)
    expect(canTransition('cloture', 'verrouille')).toBe(false)
  })
  it('pas de transition vers soi-même', () => {
    expect(canTransition('ouvert', 'ouvert')).toBe(false)
  })
})

describe('actionIsAllowed', () => {
  it('verrouiller seulement depuis ouvert', () => {
    expect(actionIsAllowed('verrouiller', 'ouvert')).toBe(true)
    expect(actionIsAllowed('verrouiller', 'verrouille')).toBe(false)
    expect(actionIsAllowed('verrouiller', 'cloture')).toBe(false)
  })
  it('deverrouiller (réajuster) depuis verrouille', () => {
    expect(actionIsAllowed('deverrouiller', 'verrouille')).toBe(true)
    expect(actionIsAllowed('deverrouiller', 'ouvert')).toBe(false)
  })
  it('cloturer depuis ouvert ou verrouille', () => {
    expect(actionIsAllowed('cloturer', 'ouvert')).toBe(true)
    expect(actionIsAllowed('cloturer', 'verrouille')).toBe(true)
    expect(actionIsAllowed('cloturer', 'cloture')).toBe(false)
  })
  it('rouvrir depuis cloture', () => {
    expect(actionIsAllowed('rouvrir', 'cloture')).toBe(true)
    expect(actionIsAllowed('rouvrir', 'ouvert')).toBe(false)
  })
  it('ACTION_TO_STATUT est cohérent', () => {
    expect(ACTION_TO_STATUT.verrouiller).toBe('verrouille')
    expect(ACTION_TO_STATUT.cloturer).toBe('cloture')
    expect(ACTION_TO_STATUT.deverrouiller).toBe('ouvert')
    expect(ACTION_TO_STATUT.rouvrir).toBe('ouvert')
  })
})

describe('seedExercicesFromLabels', () => {
  it('dérive dates, dédoublonne, ignore le bruit, trie récent→ancien', () => {
    const seeded = seedExercicesFromLabels(['2025', '2026', '2025', null, 'xxx', '2024-2025'])
    expect(seeded.map((s) => s.annee)).toEqual(['2026', '2025', '2024-2025'])
    expect(seeded[0]).toEqual({ annee: '2026', date_debut: '2026-01-01', date_fin: '2026-12-31' })
    expect(seeded.find((s) => s.annee === '2024-2025')).toEqual({
      annee: '2024-2025', date_debut: '2024-07-01', date_fin: '2025-06-30',
    })
  })
  it('liste vide → []', () => {
    expect(seedExercicesFromLabels([])).toEqual([])
    expect(seedExercicesFromLabels([null, undefined, ''])).toEqual([])
  })
})
