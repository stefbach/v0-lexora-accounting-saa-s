import { describe, it, expect } from 'vitest'
import {
  PCM_EXPORT_COLUMNS,
  PCM_AMOUNT_COLUMNS,
  pcmDisplay,
  pcmCsvField,
  pcmAmount,
  buildPcmCsv,
  pcmCountByClasse,
  type PcmExportRow,
} from './plan-comptable-export'

const row = (o: Partial<PcmExportRow>): PcmExportRow => ({
  compte: '', libelle: null, classe: null, type_compte: null, sens_normal: null,
  compte_parent: null, niveau: null, est_analytique: null, categorie_ifrs: null,
  sous_categorie_ifrs: null, poste_etat_financier_ifrs: null, est_contra_ifrs: null,
  type_mra_ifrs: null, notes: null, ...o,
})

describe('pcmDisplay', () => {
  it('null/undefined → vide, booléen → Oui/vide', () => {
    expect(pcmDisplay(null)).toBe('')
    expect(pcmDisplay(undefined)).toBe('')
    expect(pcmDisplay(true)).toBe('Oui')
    expect(pcmDisplay(false)).toBe('')
    expect(pcmDisplay(4)).toBe('4')
    expect(pcmDisplay('4330')).toBe('4330')
  })
})

describe('pcmCsvField', () => {
  it('échappe séparateur, guillemets et retours ligne', () => {
    expect(pcmCsvField('simple')).toBe('simple')
    expect(pcmCsvField('a;b')).toBe('"a;b"')
    expect(pcmCsvField('dit "bonjour"')).toBe('"dit ""bonjour"""')
    expect(pcmCsvField('ligne1\nligne2')).toBe('"ligne1\nligne2"')
  })
})

describe('buildPcmCsv', () => {
  it('BOM + en-tête + une ligne par compte, séparateur ;', () => {
    const csv = buildPcmCsv([
      row({ compte: '4330', libelle: 'PAYE à reverser à la MRA', classe: 4, type_mra_ifrs: 'PAYE' }),
    ])
    expect(csv.charCodeAt(0)).toBe(0xfeff) // BOM UTF-8
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0].split(';')[0]).toBe('Compte')
    expect(lines[0].split(';').length).toBe(PCM_EXPORT_COLUMNS.length)
    expect(lines[1].startsWith('4330;PAYE à reverser à la MRA;4;')).toBe(true)
    expect(lines[1]).toContain('PAYE')
  })

  it('un libellé contenant « ; » est quoté et ne casse pas le nombre de colonnes', () => {
    const csv = buildPcmCsv([row({ compte: '706', libelle: 'Services; conseils' })])
    const dataLine = csv.slice(1).split('\r\n')[1]
    expect(dataLine).toContain('"Services; conseils"')
  })
})

describe('pcmAmount', () => {
  it('formate un montant à 2 décimales, vide si 0/absent', () => {
    expect(pcmAmount(1234.5)).toBe('1234.50')
    expect(pcmAmount(0)).toBe('')
    expect(pcmAmount(undefined)).toBe('')
    expect(pcmAmount(-42)).toBe('-42.00')
  })
})

describe('buildPcmCsv avec montants (exercice valorisé)', () => {
  it('ajoute les colonnes Débit/Crédit/Solde quand withAmounts', () => {
    const csv = buildPcmCsv(
      [row({ compte: '4210', libelle: 'Salaires nets', classe: 4, debit: 4968438.4, credit: 8212842.35, solde: -3244403.95 })],
      true,
    )
    const lines = csv.slice(1).split('\r\n')
    const header = lines[0].split(';')
    expect(header.slice(-3)).toEqual(['Débit', 'Crédit', 'Solde'])
    expect(header.length).toBe(PCM_EXPORT_COLUMNS.length + PCM_AMOUNT_COLUMNS.length)
    const data = lines[1].split(';')
    expect(data.slice(-3)).toEqual(['4968438.40', '8212842.35', '-3244403.95'])
  })
  it('sans withAmounts : pas de colonnes montants', () => {
    const csv = buildPcmCsv([row({ compte: '701' })])
    expect(csv.slice(1).split('\r\n')[0].split(';').length).toBe(PCM_EXPORT_COLUMNS.length)
  })
})

describe('pcmCountByClasse', () => {
  it('agrège par classe', () => {
    const m = pcmCountByClasse([
      row({ compte: '401', classe: 4 }),
      row({ compte: '411', classe: 4 }),
      row({ compte: '601', classe: 6 }),
    ])
    expect(m.get('4')).toBe(2)
    expect(m.get('6')).toBe(1)
  })
})
