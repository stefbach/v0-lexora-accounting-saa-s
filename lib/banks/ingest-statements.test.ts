import { describe, it, expect, vi } from 'vitest'
import {
  statementStoragePath,
  prepareStatements,
  selectStatementsToStore,
  toDocumentRow,
  ingestScrapedStatements,
  type StatementIngestContext,
} from './ingest-statements'
import type { ScrapedStatement } from './scraper'

const STMT = (over: Partial<ScrapedStatement>): ScrapedStatement => ({
  date_generated: '2026-07-31',
  period: '2026-07',
  doc_type: 'Current account statement',
  filename: 'Current Account statement',
  pdf_base64: Buffer.from('%PDF-fake').toString('base64'),
  ...over,
})

const CTX: StatementIngestContext = {
  societe_id: 'soc-1',
  compte_bancaire_id: 'cb-1',
  banque: 'MCB',
  numero_compte: '000447954587',
  dossier_id: 'dos-1',
  uploaded_by: 'prof-1',
}

describe('statementStoragePath', () => {
  it('chemin déterministe scopé par société', () => {
    expect(statementStoragePath(STMT({}), CTX)).toBe(
      'bank-statements/soc-1/MCB_000447954587_2026-07_Current_account_statement.pdf',
    )
  })
  it('périodes différentes → chemins différents', () => {
    const a = statementStoragePath(STMT({ period: '2026-07' }), CTX)
    const b = statementStoragePath(STMT({ period: '2026-06' }), CTX)
    expect(a).not.toBe(b)
  })
})

describe('selectStatementsToStore', () => {
  it('exclut les relevés déjà stockés (dédoublonnage vs base)', () => {
    const prepared = prepareStatements([STMT({ period: '2026-07' }), STMT({ period: '2026-06' })], CTX)
    const existing = new Set([prepared[0].storage_path])
    const fresh = selectStatementsToStore(prepared, existing)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].statement.period).toBe('2026-06')
  })
  it('dédoublonne à l’intérieur du lot', () => {
    const prepared = prepareStatements([STMT({ period: '2026-07' }), STMT({ period: '2026-07' })], CTX)
    expect(selectStatementsToStore(prepared, new Set())).toHaveLength(1)
  })
})

describe('toDocumentRow', () => {
  it('type releve_bancaire → déclenche le pipeline OCR existant', () => {
    const [p] = prepareStatements([STMT({})], CTX)
    const row = toDocumentRow(p, CTX)
    expect(row.type_document).toBe('releve_bancaire')
    expect(row.type_fichier).toBe('pdf')
    expect(row.dossier_id).toBe('dos-1')
    expect(row.uploaded_by).toBe('prof-1')
    expect(row.statut).toBe('en_cours')
    expect(row.storage_path).toBe(p.storage_path)
  })
})

describe('ingestScrapedStatements — I/O guardée', () => {
  function makeAdmin(existing: string[], opts: { uploadError?: boolean; insertError?: boolean } = {}) {
    const upload = vi.fn().mockResolvedValue({ error: opts.uploadError ? new Error('up') : null })
    const single = vi.fn().mockResolvedValue({
      data: opts.insertError ? null : { id: 'doc-new' },
      error: opts.insertError ? new Error('ins') : null,
    })
    const insert = vi.fn(() => ({ select: () => ({ single }) }))
    const admin = {
      storage: { from: vi.fn(() => ({ upload })) },
      from: vi.fn(() => ({
        select: () => ({ in: () => Promise.resolve({ data: existing.map((storage_path) => ({ storage_path })) }) }),
        insert,
      })),
    }
    return { admin: admin as any, upload, insert }
  }

  it('stocke, enregistre et enqueue les nouveaux relevés', async () => {
    const { admin, upload, insert } = makeAdmin([])
    const enqueue = vi.fn().mockResolvedValue(undefined)
    const res = await ingestScrapedStatements(admin, CTX, [STMT({ period: '2026-07' }), STMT({ period: '2026-06' })], enqueue)
    expect(res).toEqual({ ingested: 2, skipped: 0, errors: 0 })
    expect(upload).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenCalledWith('doc-new')
  })

  it('run idempotent : relevés déjà stockés → skipped, aucun enqueue', async () => {
    const p = statementStoragePath(STMT({ period: '2026-07' }), CTX)
    const { admin, upload } = makeAdmin([p])
    const enqueue = vi.fn()
    const res = await ingestScrapedStatements(admin, CTX, [STMT({ period: '2026-07' })], enqueue)
    expect(res).toEqual({ ingested: 0, skipped: 1, errors: 0 })
    expect(upload).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('erreur d’upload sur un relevé → comptée, n’interrompt pas le reste', async () => {
    const { admin } = makeAdmin([], { uploadError: true })
    const enqueue = vi.fn()
    const res = await ingestScrapedStatements(admin, CTX, [STMT({ period: '2026-07' })], enqueue)
    expect(res.errors).toBe(1)
    expect(res.ingested).toBe(0)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('lot vide → no-op', async () => {
    const { admin } = makeAdmin([])
    const enqueue = vi.fn()
    const res = await ingestScrapedStatements(admin, CTX, [], enqueue)
    expect(res).toEqual({ ingested: 0, skipped: 0, errors: 0 })
    expect(admin.from).not.toHaveBeenCalled()
  })
})
