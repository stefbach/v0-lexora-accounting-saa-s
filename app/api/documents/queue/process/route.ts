/**
 * Route interne du worker de la file d'attente `document_processing_queue`.
 *
 * Auth : X-Internal-Token (comme les autres endpoints internes Telegram/n8n).
 * Cette route n'est PAS le chemin critique de latence — le kick nominal
 * (`after()`, cf. `lib/documents/queue.ts`) appelle directement la fonction
 * en mémoire dans le même process, sans repasser par HTTP. Cette route sert
 * de déclenchement manuel/debug :
 *
 *   POST /api/documents/queue/process              → mode batch (claim_next_document_jobs)
 *   POST /api/documents/queue/process?document_id=… → traite un job précis
 */
import { NextRequest, NextResponse } from 'next/server'
import { claimAndProcessOne, claimAndProcessBatch } from '@/lib/documents/queue'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const internalToken = request.headers.get('x-internal-token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const documentId = request.nextUrl.searchParams.get('document_id')

  if (documentId) {
    await claimAndProcessOne(documentId, 'manual-http')
    return NextResponse.json({ success: true, mode: 'single', document_id: documentId })
  }

  const batchSize = Number(request.nextUrl.searchParams.get('batch_size')) || 5
  const result = await claimAndProcessBatch(batchSize, 'manual-http')
  return NextResponse.json({ success: true, mode: 'batch', ...result })
}
