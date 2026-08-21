/**
 * Tests unitaires de la file d'attente documents (lib/documents/queue.ts).
 *
 * STRATÉGIE : on stub `getAdminClient` (Supabase admin), `processDocument`
 * (pipeline OCR), `next/server.after` (kick fire-and-forget) et l'envoi
 * Telegram. Le vrai code de queue.ts s'exécute intégralement : idempotence
 * de l'enqueue, claim atomique, transitions pending → processing → done /
 * pending(retry) / dead_letter, backoff, alertes et notifications.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Infrastructure de mock Supabase (query-builder chaînable) ──────────────
interface RecordedOp {
  method: string
  args: any[]
}
interface RecordedCall {
  table: string
  ops: RecordedOp[]
}

const h = vi.hoisted(() => {
  const state: {
    calls: RecordedCall[]
    route: (call: { table: string; ops: { method: string; args: any[] }[] }) => any
    afterCallbacks: Array<() => unknown>
  } = {
    calls: [],
    route: () => ({ data: null, error: null }),
    afterCallbacks: [],
  }

  const rpc = vi.fn()
  const processDocument = vi.fn()
  const sendTelegramMessage = vi.fn()
  const after = vi.fn()

  const CHAIN_METHODS = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'limit', 'order', 'like']

  function from(table: string) {
    const call = { table, ops: [] as { method: string; args: any[] }[] }
    state.calls.push(call)
    const resolve = () => Promise.resolve(state.route(call) ?? { data: null, error: null })
    const builder: any = {}
    for (const m of CHAIN_METHODS) {
      builder[m] = (...args: any[]) => {
        call.ops.push({ method: m, args })
        return builder
      }
    }
    builder.maybeSingle = () => {
      call.ops.push({ method: 'maybeSingle', args: [] })
      return resolve()
    }
    builder.single = () => {
      call.ops.push({ method: 'single', args: [] })
      return resolve()
    }
    // Le builder est thenable : `await supabase.from(...).update(...).eq(...)`
    builder.then = (onFulfilled: any, onRejected: any) => resolve().then(onFulfilled, onRejected)
    return builder
  }

  const client = { from, rpc }
  return { state, client, rpc, processDocument, sendTelegramMessage, after }
})

vi.mock('next/server', () => ({ after: h.after }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => h.client }))
vi.mock('@/lib/documents/process-document', () => ({ processDocument: h.processDocument }))
vi.mock('@/lib/telegram/auth', () => ({ sendTelegramMessage: h.sendTelegramMessage }))

import { enqueueDocumentProcessing, claimAndProcessOne, claimAndProcessBatch } from '../queue'

// ─── Helpers d'inspection des appels enregistrés ────────────────────────────
function callsFor(table: string): RecordedCall[] {
  return h.state.calls.filter((c) => c.table === table)
}
function opArg(call: RecordedCall, method: string): any {
  return call.ops.find((o) => o.method === method)?.args?.[0]
}
function updatesFor(table: string): any[] {
  return callsFor(table)
    .map((c) => opArg(c, 'update'))
    .filter(Boolean)
}
function insertsFor(table: string): any[] {
  return callsFor(table)
    .map((c) => opArg(c, 'insert'))
    .filter(Boolean)
}

const OK_RESULT = {
  ok: true as const,
  type_document: 'facture_fournisseur',
  societe_detectee: 'ACME LTD',
  format_detecte: 'facture_structuree',
  confiance_extraction: 92,
  description_libre: 'Facture ACME',
  categorie_suggeree: null,
  statut: 'traite' as const,
  processing_time_ms: 1234,
}

beforeEach(() => {
  h.state.calls = []
  h.state.afterCallbacks = []
  h.state.route = () => ({ data: null, error: null })
  h.after.mockReset().mockImplementation((cb: () => unknown) => {
    h.state.afterCallbacks.push(cb)
  })
  h.rpc.mockReset().mockResolvedValue({ data: null, error: null })
  h.processDocument.mockReset().mockResolvedValue(OK_RESULT)
  h.sendTelegramMessage.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── enqueueDocumentProcessing ──────────────────────────────────────────────
describe('enqueueDocumentProcessing', () => {
  it('est idempotent : un job pending/processing existant est réutilisé sans insert ni kick', async () => {
    h.state.route = (call) => {
      if (call.table === 'document_processing_queue' && call.ops.some((o) => o.method === 'select')) {
        return { data: { id: 'q-existing' }, error: null }
      }
      return { data: null, error: null }
    }

    const res = await enqueueDocumentProcessing({ documentId: 'doc-1', source: 'web_upload' })

    expect(res).toEqual({ ok: true, queueId: 'q-existing', alreadyQueued: true })
    expect(insertsFor('document_processing_queue')).toHaveLength(0)
    expect(h.after).not.toHaveBeenCalled()
    // Le check d'idempotence filtre bien sur les statuts actifs uniquement.
    const dedupCall = callsFor('document_processing_queue')[0]
    expect(dedupCall.ops.find((o) => o.method === 'in')?.args).toEqual(['statut', ['pending', 'processing']])
  })

  it("insère le job avec la source et le payload puis programme le kick via after()", async () => {
    h.state.route = (call) => {
      if (call.table === 'document_processing_queue' && call.ops.some((o) => o.method === 'insert')) {
        return { data: { id: 'q-new' }, error: null }
      }
      return { data: null, error: null }
    }

    const res = await enqueueDocumentProcessing({
      documentId: 'doc-2',
      source: 'telegram',
      payload: { chat_id: 42 },
    })

    expect(res).toEqual({ ok: true, queueId: 'q-new', alreadyQueued: false })
    expect(insertsFor('document_processing_queue')[0]).toEqual({
      document_id: 'doc-2',
      source: 'telegram',
      payload: { chat_id: 42 },
    })
    expect(h.state.afterCallbacks).toHaveLength(1)

    // Le kick exécute claimAndProcessOne — ici aucun job pending restant :
    // no-op silencieux, aucun processDocument déclenché.
    h.state.route = () => ({ data: null, error: null })
    await h.state.afterCallbacks[0]()
    expect(h.processDocument).not.toHaveBeenCalled()
  })

  it("payload absent → inséré à null", async () => {
    h.state.route = (call) => {
      if (call.table === 'document_processing_queue' && call.ops.some((o) => o.method === 'insert')) {
        return { data: { id: 'q-3' }, error: null }
      }
      return { data: null, error: null }
    }
    await enqueueDocumentProcessing({ documentId: 'doc-3', source: 'manual' })
    expect(insertsFor('document_processing_queue')[0].payload).toBeNull()
  })

  it("retourne ok:false avec le message d'erreur si l'insert échoue", async () => {
    h.state.route = (call) => {
      if (call.table === 'document_processing_queue' && call.ops.some((o) => o.method === 'insert')) {
        return { data: null, error: { message: 'duplicate key' } }
      }
      return { data: null, error: null }
    }
    const res = await enqueueDocumentProcessing({ documentId: 'doc-4', source: 'reanalyze' })
    expect(res).toEqual({ ok: false, error: 'duplicate key' })
    expect(h.after).not.toHaveBeenCalled()
  })
})

// ─── claimAndProcessOne ─────────────────────────────────────────────────────
describe('claimAndProcessOne', () => {
  const PENDING_ROW = {
    id: 'q-1',
    document_id: 'doc-1',
    source: 'web_upload',
    statut: 'processing',
    attempts: 0,
    max_attempts: 3,
    payload: null as Record<string, any> | null,
  }

  /** Route standard : candidat pending → claim OK → document présent. */
  function standardRoute(overrides: {
    claimed?: any
    doc?: any
    row?: Partial<typeof PENDING_ROW>
  } = {}) {
    const row = { ...PENDING_ROW, ...(overrides.row || {}) }
    h.state.route = (call) => {
      if (call.table === 'document_processing_queue') {
        if (call.ops.some((o) => o.method === 'update')) {
          const upd = call.ops.find((o) => o.method === 'update')!.args[0]
          if (upd.statut === 'processing') {
            // Étape de claim (UPDATE conditionnelle pending → processing)
            return 'claimed' in overrides ? overrides.claimed : { data: row, error: null }
          }
          return { data: null, error: null } // finalisation
        }
        return { data: { id: row.id }, error: null } // sélection du candidat
      }
      if (call.table === 'documents' && call.ops.some((o) => o.method === 'select')) {
        return 'doc' in overrides
          ? overrides.doc
          : { data: { storage_path: 'societe/doc.pdf', nom_fichier: 'facture.pdf' }, error: null }
      }
      return { data: null, error: null }
    }
    return row
  }

  it('no-op si aucun job pending pour ce document', async () => {
    h.state.route = () => ({ data: null, error: null })
    await claimAndProcessOne('doc-x')
    expect(h.processDocument).not.toHaveBeenCalled()
    expect(updatesFor('document_processing_queue')).toHaveLength(0)
  })

  it('no-op si le claim est perdu (job déjà réclamé par un autre worker)', async () => {
    standardRoute({ claimed: { data: null, error: null } })
    await claimAndProcessOne('doc-1', 'kick')
    expect(h.processDocument).not.toHaveBeenCalled()
    // Une seule update (la tentative de claim), pas de finalisation.
    expect(updatesFor('document_processing_queue')).toHaveLength(1)
  })

  it('claim → processDocument → statut done avec last_error purgé en cas de succès', async () => {
    standardRoute()
    await claimAndProcessOne('doc-1', 'worker-7')

    expect(h.processDocument).toHaveBeenCalledWith({
      documentId: 'doc-1',
      storagePath: 'societe/doc.pdf',
      nomFichier: 'facture.pdf',
    })

    const updates = updatesFor('document_processing_queue')
    // update #1 = claim (processing + verrou), update #2 = done
    expect(updates[0]).toMatchObject({ statut: 'processing', locked_by: 'worker-7' })
    expect(updates[0].locked_at).toBeTruthy()
    expect(updates[1]).toMatchObject({ statut: 'done', last_error: null })
    expect(updates[1].finished_at).toBeTruthy()
    // Succès → documents.statut n'est PAS touché par la queue.
    expect(updatesFor('documents')).toHaveLength(0)
  })

  it('document introuvable → échec finalisé en retry (pending + attempts=1 + backoff 30s)', async () => {
    standardRoute({ doc: { data: null, error: null } })
    await claimAndProcessOne('doc-1')

    expect(h.processDocument).not.toHaveBeenCalled()
    const finalUpdate = updatesFor('document_processing_queue')[1]
    expect(finalUpdate).toMatchObject({
      statut: 'pending',
      attempts: 1,
      locked_at: null,
      locked_by: null,
    })
    expect(finalUpdate.last_error).toMatch(/introuvable/)
    const backoffMs = new Date(finalUpdate.next_attempt_at).getTime() - Date.now()
    expect(backoffMs).toBeGreaterThan(25_000)
    expect(backoffMs).toBeLessThan(35_000)
  })

  it('2e échec → backoff exponentiel de 120s', async () => {
    standardRoute({ row: { attempts: 1 } })
    h.processDocument.mockResolvedValue({ ok: false, error: 'OCR timeout' })
    await claimAndProcessOne('doc-1')

    const finalUpdate = updatesFor('document_processing_queue')[1]
    expect(finalUpdate).toMatchObject({ statut: 'pending', attempts: 2, last_error: 'OCR timeout' })
    const backoffMs = new Date(finalUpdate.next_attempt_at).getTime() - Date.now()
    expect(backoffMs).toBeGreaterThan(115_000)
    expect(backoffMs).toBeLessThan(125_000)
  })

  it('épuisement des tentatives → dead_letter + documents.statut=erreur + alerte critique', async () => {
    standardRoute({ row: { attempts: 2, max_attempts: 3 } })
    h.processDocument.mockResolvedValue({ ok: false, error: 'PDF corrompu' })
    // La sous-requête de l'alerte lit documents (nom_fichier + société)
    const baseRoute = h.state.route
    h.state.route = (call) => {
      if (call.table === 'documents' && opArg(call, 'select')?.includes('dossiers')) {
        return { data: { nom_fichier: 'facture.pdf', dossiers: { societe_id: 'soc-9' } }, error: null }
      }
      return baseRoute(call)
    }

    await claimAndProcessOne('doc-1')

    const queueUpdates = updatesFor('document_processing_queue')
    expect(queueUpdates[1]).toMatchObject({ statut: 'dead_letter', attempts: 3, last_error: 'PDF corrompu' })
    expect(updatesFor('documents')[0]).toEqual({ statut: 'erreur', n8n_result: { error: 'PDF corrompu' } })

    const alerte = insertsFor('alertes')[0]
    expect(alerte).toMatchObject({
      societe_id: 'soc-9',
      type_alerte: 'document_traitement_echec',
      niveau: 'critique',
      statut: 'active',
    })
    expect(alerte.titre).toContain('facture.pdf')
    expect(alerte.metadata).toMatchObject({ document_id: 'doc-1', queue_id: 'q-1', attempts: 3 })
  })

  it('source telegram + succès → notification avec le libellé de type et la société', async () => {
    standardRoute({ row: { source: 'telegram', payload: { chat_id: 777 } } })
    await claimAndProcessOne('doc-1')

    expect(h.sendTelegramMessage).toHaveBeenCalledTimes(1)
    const [chatId, message] = h.sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe(777)
    expect(message).toContain('Document traité')
    expect(message).toContain('Facture fournisseur')
    expect(message).toContain('ACME LTD')
    expect(message).not.toContain('Confiance')
  })

  it('source telegram + succès en_attente_revue → avertissement de confiance faible', async () => {
    standardRoute({ row: { source: 'telegram', payload: { chat_id: 5 } } })
    h.processDocument.mockResolvedValue({
      ...OK_RESULT,
      statut: 'en_attente_revue',
      societe_detectee: 'INCONNU',
      type_document: 'inconnu_du_mapping',
    })
    await claimAndProcessOne('doc-1')

    const [, message] = h.sendTelegramMessage.mock.calls[0]
    expect(message).toContain('Confiance d\'extraction faible')
    // Société INCONNU non affichée, type inconnu affiché brut (fallback du label)
    expect(message).not.toContain('INCONNU')
    expect(message).toContain('inconnu_du_mapping')
  })

  it('source telegram + dead_letter → message d\'échec tronqué', async () => {
    standardRoute({ row: { source: 'telegram', payload: { chat_id: 9 }, attempts: 2 } })
    h.processDocument.mockResolvedValue({ ok: false, error: 'X'.repeat(1000) })
    await claimAndProcessOne('doc-1')

    const [chatId, message] = h.sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe(9)
    expect(message).toContain('Échec du traitement du document')
    // Erreur tronquée à 400 caractères dans le <code>
    expect(message).toContain('X'.repeat(400))
    expect(message).not.toContain('X'.repeat(401))
  })

  it('échec de sendTelegramMessage → avalé sans faire échouer la finalisation', async () => {
    standardRoute({ row: { source: 'telegram', payload: { chat_id: 1 } } })
    h.sendTelegramMessage.mockRejectedValue(new Error('bot down'))
    await expect(claimAndProcessOne('doc-1')).resolves.toBeUndefined()
    expect(updatesFor('document_processing_queue')[1]).toMatchObject({ statut: 'done' })
  })

  it('web_upload → aucune notification Telegram même avec un payload chat_id', async () => {
    standardRoute({ row: { source: 'web_upload', payload: { chat_id: 42 } } })
    await claimAndProcessOne('doc-1')
    expect(h.sendTelegramMessage).not.toHaveBeenCalled()
  })
})

// ─── claimAndProcessBatch ───────────────────────────────────────────────────
describe('claimAndProcessBatch', () => {
  it('reprend les jobs stale puis traite le lot réclamé via SKIP LOCKED', async () => {
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'requeue_stale_document_jobs') return { data: 2, error: null }
      return {
        data: [
          { id: 'q-a', document_id: 'doc-a', source: 'web_upload', statut: 'processing', attempts: 0, max_attempts: 3, payload: null },
          { id: 'q-b', document_id: 'doc-b', source: 'manual', statut: 'processing', attempts: 0, max_attempts: 3, payload: null },
        ],
        error: null,
      }
    })
    h.state.route = (call) => {
      if (call.table === 'documents') {
        const id = call.ops.find((o) => o.method === 'eq')?.args?.[1]
        return { data: { storage_path: `path/${id}.pdf`, nom_fichier: `${id}.pdf` }, error: null }
      }
      return { data: null, error: null }
    }

    const res = await claimAndProcessBatch(5, 'cron-worker')

    expect(res).toEqual({ requeued: 2, processed: 2 })
    expect(h.rpc).toHaveBeenCalledWith('claim_next_document_jobs', { p_batch_size: 5, p_worker_id: 'cron-worker' })
    expect(h.processDocument).toHaveBeenCalledTimes(2)
    expect(h.processDocument).toHaveBeenNthCalledWith(1, {
      documentId: 'doc-a',
      storagePath: 'path/doc-a.pdf',
      nomFichier: 'doc-a.pdf',
    })
    // Chaque job réussi est marqué done.
    const doneUpdates = updatesFor('document_processing_queue').filter((u) => u.statut === 'done')
    expect(doneUpdates).toHaveLength(2)
  })

  it('lot vide → {requeued:0, processed:0} sans traitement', async () => {
    h.rpc.mockResolvedValue({ data: null, error: null })
    const res = await claimAndProcessBatch()
    expect(res).toEqual({ requeued: 0, processed: 0 })
    expect(h.processDocument).not.toHaveBeenCalled()
  })

  it('échec de la RPC de claim → retourne requeued sans rien traiter', async () => {
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'requeue_stale_document_jobs') return { data: 1, error: null }
      return { data: null, error: { message: 'RPC missing' } }
    })
    const res = await claimAndProcessBatch(3)
    expect(res).toEqual({ requeued: 1, processed: 0 })
    expect(h.processDocument).not.toHaveBeenCalled()
  })

  it('un échec au milieu du lot ne bloque pas les jobs suivants', async () => {
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'requeue_stale_document_jobs') return { data: 0, error: null }
      return {
        data: [
          { id: 'q-a', document_id: 'doc-a', source: 'web_upload', statut: 'processing', attempts: 0, max_attempts: 3, payload: null },
          { id: 'q-b', document_id: 'doc-b', source: 'web_upload', statut: 'processing', attempts: 0, max_attempts: 3, payload: null },
        ],
        error: null,
      }
    })
    h.state.route = (call) => {
      if (call.table === 'documents') {
        return { data: { storage_path: 'p.pdf', nom_fichier: 'p.pdf' }, error: null }
      }
      return { data: null, error: null }
    }
    h.processDocument
      .mockResolvedValueOnce({ ok: false, error: 'boom' })
      .mockResolvedValueOnce(OK_RESULT)

    const res = await claimAndProcessBatch(2)
    expect(res).toEqual({ requeued: 0, processed: 2 })
    const updates = updatesFor('document_processing_queue')
    expect(updates.some((u) => u.statut === 'pending' && u.attempts === 1)).toBe(true)
    expect(updates.some((u) => u.statut === 'done')).toBe(true)
  })
})
