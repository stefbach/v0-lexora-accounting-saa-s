import { describe, it, expect } from 'vitest'
import { pointsGagnes, soldeFidelite, POINTS_PAR_MUR } from './fidelite'

describe('pointsGagnes', () => {
  it('1 point par tranche pleine de 100 MUR', () => {
    expect(pointsGagnes(287.5)).toBe(2)
    expect(pointsGagnes(100)).toBe(1)
    expect(pointsGagnes(99.99)).toBe(0)
  })
  it('taux paramétrable', () => {
    expect(pointsGagnes(500, 50)).toBe(10)
  })
  it('robuste aux valeurs nulles/négatives', () => {
    expect(pointsGagnes(0)).toBe(0)
    expect(pointsGagnes(-10)).toBe(0)
    expect(pointsGagnes(100, 0)).toBe(0)
  })
  it('POINTS_PAR_MUR par défaut = 100', () => {
    expect(POINTS_PAR_MUR).toBe(100)
  })
})

describe('soldeFidelite', () => {
  it('somme les mouvements signés', () => {
    expect(soldeFidelite([{ points: 5 }, { points: 3 }, { points: -4 }])).toBe(4)
  })
  it('vide = 0', () => {
    expect(soldeFidelite([])).toBe(0)
  })
})
