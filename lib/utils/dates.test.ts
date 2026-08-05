import { describe, it, expect } from 'vitest'
import { todayISO, toISODate, addDaysISO } from './dates'

describe('todayISO', () => {
  it('renvoie une date au format YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('suit le calendrier local, pas UTC', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})

describe('toISODate', () => {
  it('laisse passer une date déjà normalisée', () => {
    expect(toISODate('2026-07-30')).toBe('2026-07-30')
  })

  it('extrait la date d\'un timestamp Postgres sans décalage de fuseau', () => {
    expect(toISODate('2026-07-30T00:00:00+04:00')).toBe('2026-07-30')
    expect(toISODate('2026-01-01T23:30:00Z')).toBe('2026-01-01')
  })

  it('accepte un objet Date', () => {
    expect(toISODate(new Date(Date.UTC(2026, 6, 30)))).toBe('2026-07-30')
  })

  it('retombe sur le parsing natif pour un format non canonique', () => {
    expect(toISODate('2026/07/30')).toBe('2026-07-30')
  })

  it('renvoie "" sur vide ou invalide au lieu de lever', () => {
    expect(toISODate('')).toBe('')
    expect(toISODate(null)).toBe('')
    expect(toISODate(undefined)).toBe('')
    expect(toISODate('pas-une-date')).toBe('')
    expect(toISODate(new Date('nope'))).toBe('')
  })
})

describe('addDaysISO', () => {
  it('ajoute les jours en calendrier', () => {
    expect(addDaysISO('2026-07-30', 30)).toBe('2026-08-29')
    expect(addDaysISO('2026-07-30', 0)).toBe('2026-07-30')
  })

  it('gère les fins de mois et années bissextiles', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('accepte les décalages négatifs', () => {
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('ne lève pas sur une date vide/invalide — retombe sur aujourd\'hui', () => {
    expect(() => addDaysISO('', 30)).not.toThrow()
    expect(addDaysISO('', 0)).toBe(todayISO())
    expect(addDaysISO('pas-une-date', 0)).toBe(todayISO())
    expect(addDaysISO(undefined, 0)).toBe(todayISO())
  })

  it('accepte un timestamp complet en entrée', () => {
    expect(addDaysISO('2026-07-30T10:00:00+04:00', 1)).toBe('2026-07-31')
  })

  it('reporte un jour hors bornes au lieu de lever', () => {
    // "2026-02-31" passe le regex de toISODate ; JS le normalise en 2026-03-03.
    // Cas inatteignable via <input type="date"> ou une colonne `date`, mais on
    // vérifie qu'il produit une date valide plutôt qu'un throw.
    expect(addDaysISO('2026-02-31', 5)).toBe('2026-03-08')
  })

  it('traite un nombre de jours non fini comme 0', () => {
    expect(addDaysISO('2026-07-30', Number.NaN)).toBe('2026-07-30')
    expect(addDaysISO('2026-07-30', Number.POSITIVE_INFINITY)).toBe('2026-07-30')
  })
})
