// @vitest-environment node
// Helpers purs (aucun DOM) — on force l'environnement node pour éviter la
// dépendance jsdom (le glob components/** est mappé jsdom par défaut).
import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  formatMUR,
  formatPct,
  signedClass,
  hexToRgba,
  severityColor,
  severityRank,
  SEVERITY_ORDER,
} from '@/components/operations/format'

// fr-FR NumberFormat utilise l'espace insécable fine (U+202F) comme séparateur
// de milliers dans les runtimes récents. On normalise pour des assertions
// robustes indépendantes du type d'espace.
const norm = (s: string) => s.replace(/ | /g, ' ')

describe('formatNumber', () => {
  it('formate avec séparateur de milliers', () => {
    expect(norm(formatNumber(1234567))).toBe('1 234 567')
  })
  it('respecte le nombre de décimales', () => {
    expect(norm(formatNumber(1234.5, 2))).toBe('1 234,50')
    expect(formatNumber(3.14159, 3)).toBe('3,142')
  })
  it('gère zéro et négatifs', () => {
    expect(formatNumber(0)).toBe('0')
    expect(norm(formatNumber(-4200))).toBe('-4 200')
  })
  it('retourne "—" pour null/undefined/NaN/Infinity', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
    expect(formatNumber(NaN)).toBe('—')
    expect(formatNumber(Infinity)).toBe('—')
  })
})

describe('formatMUR', () => {
  it('suffixe " MUR" sans décimale par défaut', () => {
    expect(norm(formatMUR(1234567))).toBe('1 234 567 MUR')
    expect(formatMUR(0)).toBe('0 MUR')
  })
  it('accepte des décimales pour les montants unitaires', () => {
    expect(norm(formatMUR(12.5, 2))).toBe('12,50 MUR')
  })
  it('gère les montants négatifs', () => {
    expect(norm(formatMUR(-999.99, 2))).toBe('-999,99 MUR')
  })
  it('retourne "—" pour valeur invalide', () => {
    expect(formatMUR(null)).toBe('—')
    expect(formatMUR(NaN)).toBe('—')
  })
})

describe('formatPct', () => {
  it('formate avec le symbole %', () => {
    expect(formatPct(12.5)).toBe('12,5 %')
    expect(formatPct(100, 0)).toBe('100 %')
  })
  it('conserve le signe négatif', () => {
    expect(formatPct(-3.2)).toBe('-3,2 %')
  })
  it('force le + pour les positifs quand signed=true', () => {
    expect(formatPct(4.1, 1, true)).toBe('+4,1 %')
    expect(formatPct(-4.1, 1, true)).toBe('-4,1 %')
    expect(formatPct(0, 1, true)).toBe('0,0 %')
  })
  it('retourne "—" pour valeur invalide', () => {
    expect(formatPct(null)).toBe('—')
    expect(formatPct(Infinity)).toBe('—')
  })
})

describe('signedClass', () => {
  it('teal pour positif', () => {
    expect(signedClass(10)).toBe('text-[#0F766E]')
  })
  it('rouge pour négatif', () => {
    expect(signedClass(-1)).toBe('text-[#9F1239]')
  })
  it('gris pour zéro / invalide', () => {
    expect(signedClass(0)).toBe('text-slate-500')
    expect(signedClass(null)).toBe('text-slate-500')
    expect(signedClass(NaN)).toBe('text-slate-500')
  })
})

describe('hexToRgba', () => {
  it('convertit un hex 6 chiffres', () => {
    expect(hexToRgba('#9F1239', 0.06)).toBe('rgba(159, 18, 57, 0.06)')
    expect(hexToRgba('0F766E', 1)).toBe('rgba(15, 118, 110, 1)')
  })
  it('développe un hex 3 chiffres', () => {
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
  })
  it('dégrade en noir pour un hex invalide', () => {
    expect(hexToRgba('nope', 0.2)).toBe('rgba(0, 0, 0, 0.2)')
    expect(hexToRgba('', 0.2)).toBe('rgba(0, 0, 0, 0.2)')
  })
})

describe('severityColor', () => {
  it('retourne la palette danger', () => {
    expect(severityColor('danger')).toEqual({
      hex: '#9F1239',
      text: '#9F1239',
      border: '#9F1239',
      bg: 'rgba(159, 18, 57, 0.06)',
    })
  })
  it('mappe warning / info / success', () => {
    expect(severityColor('warning').hex).toBe('#B45309')
    expect(severityColor('info').hex).toBe('#2A6FCC')
    expect(severityColor('success').hex).toBe('#0F766E')
  })
  it('repli sur info pour une sévérité inconnue ou nulle', () => {
    expect(severityColor('bizarre').hex).toBe('#2A6FCC')
    expect(severityColor(null).hex).toBe('#2A6FCC')
    expect(severityColor(undefined).hex).toBe('#2A6FCC')
  })
})

describe('severityRank / SEVERITY_ORDER', () => {
  it('trie danger avant success', () => {
    expect(severityRank('danger')).toBeLessThan(severityRank('success'))
    expect(severityRank('warning')).toBeLessThan(severityRank('info'))
  })
  it('range une sévérité inconnue comme info', () => {
    expect(severityRank('xxx')).toBe(SEVERITY_ORDER.info)
  })
})
