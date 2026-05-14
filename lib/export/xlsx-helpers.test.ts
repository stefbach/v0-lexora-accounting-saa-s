import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  cell, formula, aoaSheet, buildWorkbook, fmtMUR,
  FMT_MUR, FMT_DATE,
} from './xlsx-helpers'

describe('xlsx-helpers — cell()', () => {
  it('returns numeric cell with format', () => {
    const c = cell(1234.5, FMT_MUR)
    expect(c.t).toBe('n')
    expect(c.v).toBe(1234.5)
    expect(c.z).toBe(FMT_MUR)
  })

  it('returns string cell when value is string', () => {
    const c = cell('label')
    expect(c.t).toBe('s')
    expect(c.v).toBe('label')
  })

  it('returns empty string cell for null/undefined/empty', () => {
    expect(cell(null).v).toBe('')
    expect(cell(undefined).v).toBe('')
    expect(cell('').v).toBe('')
  })

  it('returns date cell with default date format', () => {
    const d = new Date('2026-05-11')
    const c = cell(d)
    expect(c.t).toBe('d')
    expect(c.z).toBe(FMT_DATE)
  })
})

describe('xlsx-helpers — formula()', () => {
  it('creates formula cell with format', () => {
    const f = formula('SUM(A1:A10)', FMT_MUR)
    expect(f.t).toBe('n')
    expect(f.f).toBe('SUM(A1:A10)')
    expect(f.z).toBe(FMT_MUR)
  })
})

describe('xlsx-helpers — aoaSheet()', () => {
  it('builds a sheet with column widths and freeze rows', () => {
    const ws = aoaSheet(
      [
        [cell('Compte'), cell('Solde')],
        [cell('411'), cell(1000, FMT_MUR)],
      ],
      { colWidths: [12, 16], freezeTopRows: 1 },
    )
    expect(ws['!cols']).toEqual([{ wch: 12 }, { wch: 16 }])
    expect(ws['!freeze']).toEqual({ ySplit: 1 })
  })
})

describe('xlsx-helpers — buildWorkbook()', () => {
  it('builds a buffer that can be re-parsed by xlsx', () => {
    const ws = aoaSheet([
      [cell('Label'), cell('Amount')],
      [cell('Test'), cell(42, FMT_MUR)],
    ])
    const buf = buildWorkbook([{ name: 'Test', ws }], { title: 'unit-test' })
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(100)

    // Round-trip : parse the buffer to confirm structure
    const wb = XLSX.read(buf, { type: 'buffer' })
    expect(wb.SheetNames).toContain('Test')
    const sheet = wb.Sheets['Test']
    expect(sheet['A1']?.v).toBe('Label')
    expect(sheet['B2']?.v).toBe(42)
  })

  it('sanitizes invalid characters in sheet names', () => {
    const ws = aoaSheet([[cell('x')]])
    const buf = buildWorkbook([{ name: 'has[brackets]/slash', ws }])
    const wb = XLSX.read(buf, { type: 'buffer' })
    // [, ], / replaced by _
    expect(wb.SheetNames[0]).toBe('has_brackets__slash')
  })

  it('truncates sheet names longer than 31 chars (Excel limit)', () => {
    const ws = aoaSheet([[cell('x')]])
    const longName = 'a'.repeat(40)
    const buf = buildWorkbook([{ name: longName, ws }])
    const wb = XLSX.read(buf, { type: 'buffer' })
    expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31)
  })
})

describe('xlsx-helpers — fmtMUR()', () => {
  it('formats positive amount with French thousand separators', () => {
    expect(fmtMUR(1234567.89)).toBe('1 234 567.89')
  })

  it('formats negative amount with parentheses', () => {
    expect(fmtMUR(-1234.5)).toBe('(1 234.50)')
  })

  it('returns dash for null, undefined, 0, NaN', () => {
    expect(fmtMUR(null)).toBe('—')
    expect(fmtMUR(undefined)).toBe('—')
    expect(fmtMUR(0)).toBe('—')
    expect(fmtMUR(NaN)).toBe('—')
  })
})
