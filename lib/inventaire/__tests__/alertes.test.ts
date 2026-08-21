import { describe, it, expect } from 'vitest'
import { evaluerSeuil } from '@/lib/inventaire/alertes'

describe('evaluerSeuil', () => {
  it('rupture quand quantité ≤ 0 (prioritaire sur tout seuil)', () => {
    expect(evaluerSeuil(0, { seuil_alerte: 5 })).toEqual({ type_alerte: 'rupture', seuil_reference: 0 })
    expect(evaluerSeuil(-1, {})).toEqual({ type_alerte: 'rupture', seuil_reference: 0 })
  })

  it('seuil_bas quand quantité ≤ seuil_alerte', () => {
    expect(evaluerSeuil(5, { seuil_alerte: 5 })).toEqual({ type_alerte: 'seuil_bas', seuil_reference: 5 })
    expect(evaluerSeuil(4.999, { seuil_alerte: 5 })).toEqual({ type_alerte: 'seuil_bas', seuil_reference: 5 })
  })

  it('fallback sur stock_mini quand seuil_alerte absent', () => {
    expect(evaluerSeuil(2, { stock_mini: 3 })).toEqual({ type_alerte: 'seuil_bas', seuil_reference: 3 })
  })

  it('seuil_alerte prime sur stock_mini', () => {
    expect(evaluerSeuil(4, { seuil_alerte: 3, stock_mini: 10 })).toBeNull()
  })

  it('surstockage quand quantité > stock_maxi', () => {
    expect(evaluerSeuil(101, { stock_maxi: 100 })).toEqual({ type_alerte: 'surstockage', seuil_reference: 100 })
    expect(evaluerSeuil(100, { stock_maxi: 100 })).toBeNull()
  })

  it('aucune alerte sans seuils définis et stock positif', () => {
    expect(evaluerSeuil(1, {})).toBeNull()
    expect(evaluerSeuil(50, { seuil_alerte: null, stock_mini: 0, stock_maxi: null })).toBeNull()
  })
})
