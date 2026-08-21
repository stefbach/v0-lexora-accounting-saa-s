/**
 * Cron — filet de sécurité de la file d'attente `document_processing_queue`.
 *
 * Le traitement quasi-temps réel se fait via le kick `after()` déclenché
 * juste après l'enqueue (cf. `lib/documents/queue.ts`). Ce cron rattrape :
 *   - les jobs `pending` non capturés par un kick (crash du process avant
 *     l'exécution de `after()`, redéploiement, etc.) ;
 *   - les jobs `processing` bloqués par un crash worker (verrou > 6 min),
 *     requeue automatiquement via `requeue_stale_document_jobs()`.
 *
 * Auth : `Authorization: Bearer <CRON_SECRET>` (verifyCronSecret, même
 * pattern que les autres crons du repo).
 * Schedule : cf. vercel.json.
 */
import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/claude'
import { claimAndProcessBatch } from '@/lib/documents/queue'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Batch de 5 par tick, appelé en boucle jusqu'à ~4 min de budget interne
// pour rester sous maxDuration=300 tout en vidant un backlog éventuel.
const BATCH_SIZE = 5
const TIME_BUDGET_MS = 4 * 60 * 1000

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  let totalProcessed = 0
  let totalRequeued = 0
  let ticks = 0

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { processed, requeued } = await claimAndProcessBatch(BATCH_SIZE, 'cron')
    totalProcessed += processed
    totalRequeued += requeued
    ticks++
    if (processed === 0) break // plus rien à traiter — inutile de reboucler
  }

  return NextResponse.json({
    success: true,
    ticks,
    processed: totalProcessed,
    requeued: totalRequeued,
    duration_ms: Date.now() - startedAt,
  })
}
