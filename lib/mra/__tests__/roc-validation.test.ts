import { describe, it, expect } from 'vitest'
import { validateRocBoardComposition } from '../roc-validation'

describe('validateRocBoardComposition — Companies Act s.223', () => {
  it('rejette un return vide (pas de directors)', () => {
    const r = validateRocBoardComposition([], [])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.field).toBe('directors')
      expect(r.error).toMatch(/directeur/i)
    }
  })

  it('rejette si tous les directors ont un nom vide', () => {
    const r = validateRocBoardComposition(
      [{ name: '', nic: 'X123' }],
      [{ name: 'A', pct: 100 }],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.field).toBe('directors')
  })

  it('rejette si la liste des actionnaires est vide', () => {
    const r = validateRocBoardComposition(
      [{ name: 'John Doe', nic: 'J1234' }],
      [],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.field).toBe('shareholders')
  })

  it('rejette si la somme des % ≠ 100 (hors tolérance)', () => {
    const r = validateRocBoardComposition(
      [{ name: 'John Doe' }],
      [
        { name: 'A', pct: 40 },
        { name: 'B', pct: 30 },
      ],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.field).toBe('pct_total')
      expect(r.error).toMatch(/70/)
    }
  })

  it('accepte un return valide (1 directeur nommé + actionnariat = 100%)', () => {
    const r = validateRocBoardComposition(
      [{ name: 'Jane Doe', nic: 'J1234567890123', date_appointed: '2024-01-01' }],
      [
        { name: 'Holding A', pct: 60, shares: 6000 },
        { name: 'Holding B', pct: 40, shares: 4000 },
      ],
    )
    expect(r.ok).toBe(true)
  })

  it('accepte une somme à 100 ± 0.5 (arrondi)', () => {
    const r = validateRocBoardComposition(
      [{ name: 'Jane Doe' }],
      [
        { name: 'A', pct: 33.33 },
        { name: 'B', pct: 33.33 },
        { name: 'C', pct: 33.34 },
      ],
    )
    expect(r.ok).toBe(true)
  })
})
