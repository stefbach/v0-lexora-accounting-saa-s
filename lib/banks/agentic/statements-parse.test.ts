import { describe, it, expect } from 'vitest'
import {
  parseStatementRow,
  parseStatements,
  statementDedupeKey,
  selectNewStatements,
  statementStorageName,
  type RawStatementRow,
  type StatementRef,
} from './statements-parse'

// Tableau réel MCB « Documents & statements » (compte EUR 000447954587, 2026).
const MCB_ROWS: RawStatementRow[] = [
  { dateGenerated: '31 Jul 2026', docType: 'Current account statement', filename: 'Current Account statement' },
  { dateGenerated: '30 Jun 2026', docType: 'Current account statement', filename: 'Current Account statement' },
  { dateGenerated: '29 May 2026', docType: 'Current account statement', filename: 'Current Account statement' },
  { dateGenerated: '30 Apr 2026', docType: 'Current account statement', filename: 'Current Account statement' },
  { dateGenerated: '31 Mar 2026', docType: 'Current account statement', filename: 'Current Account statement' },
]

describe('parseStatementRow', () => {
  it('dérive la période mensuelle de la date de génération', () => {
    const s = parseStatementRow(MCB_ROWS[0])!
    expect(s.date_generated).toBe('2026-07-31')
    expect(s.period).toBe('2026-07')
    expect(s.doc_type).toBe('Current account statement')
    expect(s.filename).toBe('Current Account statement')
    expect(s.download_href).toBeNull()
  })
  it('capte le href de téléchargement si présent', () => {
    const s = parseStatementRow({ dateGenerated: '30 Jun 2026', docType: 'X', downloadHref: 'https://ibpro.mcb.mu/doc/123.pdf' })!
    expect(s.download_href).toBe('https://ibpro.mcb.mu/doc/123.pdf')
  })
  it('date illisible → null', () => {
    expect(parseStatementRow({ dateGenerated: 'Date generated' })).toBeNull()
  })
  it('type/filename manquants → valeurs par défaut', () => {
    const s = parseStatementRow({ dateGenerated: '31 Jul 2026' })!
    expect(s.doc_type).toBe('Statement')
    expect(s.filename).toBe('Statement')
  })
})

describe('parseStatements', () => {
  it('parse les 5 relevés réels', () => {
    const list = parseStatements(MCB_ROWS)
    expect(list).toHaveLength(5)
    expect(list.map((s) => s.period)).toEqual(['2026-07', '2026-06', '2026-05', '2026-04', '2026-03'])
  })
  it('ignore le bruit sans planter', () => {
    expect(parseStatements([{ dateGenerated: 'Date generated' }, ...MCB_ROWS.slice(0, 1)])).toHaveLength(1)
  })
  it('liste vide → []', () => expect(parseStatements([])).toEqual([]))
})

describe('statementDedupeKey', () => {
  it('période + type', () => {
    const s = parseStatementRow(MCB_ROWS[0])!
    expect(statementDedupeKey(s)).toBe('2026-07|current account statement')
  })
})

describe('selectNewStatements', () => {
  const all: StatementRef[] = parseStatements(MCB_ROWS)
  it('exclut les relevés déjà ingérés', () => {
    const existing = new Set(['2026-07|current account statement', '2026-06|current account statement'])
    const fresh = selectNewStatements(all, existing)
    expect(fresh.map((s) => s.period)).toEqual(['2026-05', '2026-04', '2026-03'])
  })
  it('run idempotent : tout déjà là → []', () => {
    const existing = new Set(all.map(statementDedupeKey))
    expect(selectNewStatements(all, existing)).toEqual([])
  })
  it('dédoublonne à l’intérieur du lot', () => {
    const dup = [...all, all[0]]
    expect(selectNewStatements(dup, new Set())).toHaveLength(5)
  })
})

describe('statementStorageName', () => {
  it('nom de fichier stable, sans collision compte/période', () => {
    const s = parseStatementRow(MCB_ROWS[0])!
    const name = statementStorageName(s, { banque: 'MCB', numero_compte: '000447954587' })
    expect(name).toBe('MCB_000447954587_2026-07_Current_account_statement.pdf')
  })
})
