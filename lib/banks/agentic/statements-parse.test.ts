import { describe, it, expect } from 'vitest'
import {
  parseStatementRow,
  parseStatements,
  statementDedupeKey,
  selectNewStatements,
  selectStatementsForBackfill,
  statementStorageName,
  mcbDisplayDatePattern,
  type RawStatementRow,
  type StatementRef,
} from './statements-parse'

describe('mcbDisplayDatePattern — cible la BONNE ligne de relevé au clic', () => {
  it('cible la date exacte (jour+mois+année), pas seulement l\'année', () => {
    const pat = mcbDisplayDatePattern('2026-06-30')
    expect(pat).toBeTruthy()
    const rx = new RegExp(pat as string, 'i')
    expect(rx.test('30 Jun 2026')).toBe(true)
    // Ne doit PAS matcher un autre mois de la même année (le bug d\'origine).
    expect(rx.test('31 Jul 2026')).toBe(false)
    expect(rx.test('30 Jun 2025')).toBe(false)
  })

  it('tolère le zéro initial du jour', () => {
    const rx = new RegExp(mcbDisplayDatePattern('2026-05-03') as string, 'i')
    expect(rx.test('3 May 2026')).toBe(true)
    expect(rx.test('03 May 2026')).toBe(true)
  })

  it('renvoie null sur une date non ISO', () => {
    expect(mcbDisplayDatePattern('31 Jul 2026')).toBeNull()
    expect(mcbDisplayDatePattern('')).toBeNull()
  })
})

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

describe('selectStatementsForBackfill — backfill historique progressif', () => {
  // Historique multi-années (onglets 2026/2025), listé en vrac.
  const HIST: RawStatementRow[] = [
    { dateGenerated: '30 Jun 2026', docType: 'Current account statement', filename: 'x' },
    { dateGenerated: '31 May 2026', docType: 'Current account statement', filename: 'x' },
    { dateGenerated: '30 Apr 2026', docType: 'Current account statement', filename: 'x' },
    { dateGenerated: '31 Dec 2025', docType: 'Current account statement', filename: 'x' },
  ]
  const parsed = parseStatements(HIST)

  it('saute les mois déjà ingérés et priorise le plus récent, borné à maxN', () => {
    // Avril déjà en base → on récupère juin puis mai (les 2 plus récents restants).
    const known = new Set(['2026-04'])
    const picked = selectStatementsForBackfill(parsed, known, 2)
    expect(picked.map((s) => s.period)).toEqual(['2026-06', '2026-05'])
  })

  it('remonte l’historique ancien quand le récent est déjà pris (run suivant)', () => {
    const known = new Set(['2026-06', '2026-05', '2026-04'])
    const picked = selectStatementsForBackfill(parsed, known, 5)
    expect(picked.map((s) => s.period)).toEqual(['2025-12'])
  })

  it('rien à faire si tout est déjà ingéré', () => {
    const known = new Set(['2026-06', '2026-05', '2026-04', '2025-12'])
    expect(selectStatementsForBackfill(parsed, known, 10)).toEqual([])
  })

  it('dédoublonne le lot (même mois listé deux fois via API + DOM)', () => {
    const picked = selectStatementsForBackfill([...parsed, parsed[0]], new Set(), 10)
    expect(picked).toHaveLength(4)
  })
})
