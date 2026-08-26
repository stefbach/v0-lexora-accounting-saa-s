import { describe, it, expect } from 'vitest'
import { resolveParamsRow, type DatedParamsRow } from './tax-params'

type Row = DatedParamsRow & { taux: number }

const rows: Row[] = [
  { annee: 2023, actif: false, date_debut: '2023-01-01', date_fin: '2023-12-31', taux: 0.10 },
  { annee: 2024, actif: false, date_debut: '2024-01-01', date_fin: '2024-12-31', taux: 0.12 },
  { annee: 2025, actif: true, date_debut: '2025-01-01', date_fin: null, taux: 0.15 },
]

describe('resolveParamsRow', () => {
  it('retourne null si liste vide', () => {
    expect(resolveParamsRow([] as Row[], { annee: 2025 })).toBeNull()
  })

  it('résout par plage de dates (date_debut ≤ date ≤ date_fin)', () => {
    expect(resolveParamsRow(rows, { date: '2024-06-30' })?.taux).toBe(0.12)
    expect(resolveParamsRow(rows, { date: '2023-01-01' })?.taux).toBe(0.10)
  })

  it('plage ouverte (date_fin null) = encore en vigueur', () => {
    expect(resolveParamsRow(rows, { date: '2026-08-26' })?.taux).toBe(0.15)
  })

  it('repli sur l\'année ≤ demandée la plus récente si aucune plage ne contient la date', () => {
    // 2022 : aucune plage ne matche → on retombe sur l'année la plus récente ≤ 2022… il n'y en a pas
    // donc repli final sur la ligne active.
    expect(resolveParamsRow(rows, { annee: 2022 })?.taux).toBe(0.15)
    // 2024 par année (sans date) → 2024
    expect(resolveParamsRow(rows, { annee: 2024 })?.taux).toBe(0.12)
    // 2099 par année → dernière année connue 2025
    expect(resolveParamsRow(rows, { annee: 2099 })?.taux).toBe(0.15)
  })

  it('déduit l\'année à partir de la date si aucune plage ne contient la date', () => {
    const noRanges: Row[] = rows.map((r) => ({ ...r, date_debut: null, date_fin: null }))
    expect(resolveParamsRow(noRanges, { date: '2024-05-01' })?.taux).toBe(0.12)
  })

  it('repli final sur la ligne active la plus récente', () => {
    const noYearNoRange: Row[] = [
      { annee: null, actif: true, taux: 0.15 },
      { annee: null, actif: false, taux: 0.01 },
    ]
    expect(resolveParamsRow(noYearNoRange, {})?.taux).toBe(0.15)
  })

  it('la plage la plus récente gagne si plusieurs contiennent la date (chevauchement)', () => {
    const overlap: Row[] = [
      { annee: 2025, actif: false, date_debut: '2025-01-01', date_fin: '2025-12-31', taux: 0.15 },
      { annee: 2025, actif: true, date_debut: '2025-07-01', date_fin: null, taux: 0.18 },
    ]
    expect(resolveParamsRow(overlap, { date: '2025-08-01' })?.taux).toBe(0.18)
  })
})
