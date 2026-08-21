/**
 * Point d'entrée du traitement OCR/catégorisation d'un document.
 *
 * Depuis la mise en place de la file d'attente asynchrone (migration 480,
 * `lib/documents/queue.ts`), cette route ne fait PLUS l'appel Claude en
 * synchrone dans la requête HTTP : elle enqueue un job dans
 * `document_processing_queue` et répond immédiatement (202). Le traitement
 * réel (extraction + écritures) tourne dans `lib/documents/process-document.ts`,
 * déclenché par le kick `after()` (quasi-immédiat) et/ou le cron de secours
 * `/api/cron/process-document-queue`.
 *
 * Gardée pour compatibilité (appel manuel/admin) — l'ingestion Telegram
 * (`lib/telegram/document-ingest.ts`) appelle désormais directement
 * `enqueueDocumentProcessing()` sans passer par cette route HTTP.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { enqueueDocumentProcessing, type QueueSource } from '@/lib/documents/queue'

const ALLOWED_SOURCES: QueueSource[] = ['web_upload', 'telegram', 'reanalyze', 'manual']

export async function POST(request: NextRequest) {
  // Auth : soit session web (auth.getUser), soit X-Internal-Token (n8n, outils internes)
  const internalToken = request.headers.get('x-internal-token')
  const isInternal = !!internalToken && internalToken === process.env.INTERNAL_API_TOKEN
  if (!isInternal) {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const documentId: string | undefined = body.document_id
  if (!documentId) {
    return NextResponse.json({ error: 'Paramètre manquant: document_id' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc || !doc.storage_path) {
    return NextResponse.json({ error: 'Document introuvable ou sans fichier associé' }, { status: 404 })
  }

  const requestedSource = typeof body.source === 'string' ? body.source : 'manual'
  const source: QueueSource = ALLOWED_SOURCES.includes(requestedSource as QueueSource)
    ? (requestedSource as QueueSource)
    : 'manual'

  const result = await enqueueDocumentProcessing({
    documentId,
    source,
    payload: body.payload ?? null,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  if (!result.alreadyQueued) {
    await supabase.from('documents').update({ statut: 'en_attente' }).eq('id', documentId)
  }

  return NextResponse.json({
    success: true,
    document_id: documentId,
    statut: 'en_attente',
    queue_id: result.queueId,
    already_queued: result.alreadyQueued || false,
  }, { status: 202 })
}
