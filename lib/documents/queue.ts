/**
 * File d'attente asynchrone pour le traitement OCR/catégorisation des
 * documents (factures fournisseurs et autres pièces).
 *
 * - `enqueueDocumentProcessing` : insère le job (idempotent — pas de doublon
 *   pending/processing pour un même document) puis déclenche un kick
 *   "fire-and-forget" via `after()` de Next.js, exécuté APRÈS l'envoi de la
 *   réponse HTTP. Latence quasi nulle côté appelant dans le cas nominal.
 * - `claimAndProcessOne` : réclame et traite UN job précis (chemin kick).
 * - `claimAndProcessBatch` : réclame et traite un lot de jobs `pending` via
 *   la RPC `claim_next_document_jobs` (SKIP LOCKED) + reprise des jobs
 *   `processing` bloqués par un crash (chemin cron, filet de sécurité).
 *
 * Aucune dépendance externe (pas de Redis/BullMQ) — Postgres SKIP LOCKED +
 * Next.js `after()` suffisent au volume d'un cabinet comptable.
 */
import { after } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { processDocument, type ProcessDocumentResult } from '@/lib/documents/process-document'

export type QueueSource = 'web_upload' | 'telegram' | 'reanalyze' | 'manual'

// Backoff exponentiel entre tentatives : 30s, 2min, 8min.
const RETRY_BACKOFF_SECONDS = [30, 120, 480]
const STALE_LOCK_LABEL = 'requeued after crash timeout (>6min)'

interface QueueRow {
  id: string
  document_id: string
  source: QueueSource
  statut: string
  attempts: number
  max_attempts: number
  payload: Record<string, any> | null
}

export interface EnqueueParams {
  documentId: string
  source: QueueSource
  payload?: Record<string, unknown> | null
}

export interface EnqueueResult {
  ok: boolean
  queueId?: string
  alreadyQueued?: boolean
  error?: string
}

export async function enqueueDocumentProcessing(params: EnqueueParams): Promise<EnqueueResult> {
  const { documentId, source, payload } = params
  const supabase = getAdminClient()

  const { data: existing } = await supabase
    .from('document_processing_queue')
    .select('id')
    .eq('document_id', documentId)
    .in('statut', ['pending', 'processing'])
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { ok: true, queueId: existing.id, alreadyQueued: true }
  }

  const { data: inserted, error } = await supabase
    .from('document_processing_queue')
    .insert({ document_id: documentId, source, payload: payload ?? null })
    .select('id')
    .single()

  if (error || !inserted) {
    return { ok: false, error: error?.message || 'Insert document_processing_queue failed' }
  }

  // Kick fire-and-forget : after() s'exécute une fois la réponse HTTP déjà
  // envoyée — zéro impact sur la latence perçue par l'utilisateur/le bot,
  // mais déclenche le traitement en quasi-temps réel dans le cas nominal.
  // Le cron `/api/cron/process-document-queue` reste le filet de sécurité.
  after(() => {
    claimAndProcessOne(documentId, 'kick').catch((e: any) => {
      console.error('[queue] kick claimAndProcessOne failed:', e?.message || e)
    })
  })

  return { ok: true, queueId: inserted.id, alreadyQueued: false }
}

/**
 * Réclame et traite le job `pending` le plus récent pour un document donné.
 * No-op silencieux si le job a déjà été réclamé entre-temps (cron ou un
 * autre kick) — le claim est une UPDATE conditionnelle atomique, jamais de
 * double traitement.
 */
export async function claimAndProcessOne(documentId: string, workerId = 'kick'): Promise<void> {
  const supabase = getAdminClient()

  const { data: candidate } = await supabase
    .from('document_processing_queue')
    .select('id')
    .eq('document_id', documentId)
    .eq('statut', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!candidate) return

  const { data: claimed } = await supabase
    .from('document_processing_queue')
    .update({ statut: 'processing', locked_at: new Date().toISOString(), locked_by: workerId, updated_at: new Date().toISOString() })
    .eq('id', candidate.id)
    .eq('statut', 'pending')
    .select('id, document_id, source, statut, attempts, max_attempts, payload')
    .maybeSingle()

  if (!claimed) return // déjà réclamé ailleurs entre-temps

  await processClaimedJob(supabase, claimed as QueueRow)
}

/**
 * Mode cron/batch : reprend les jobs `processing` bloqués par un crash
 * (verrou > 6 min), puis réclame et traite jusqu'à `batchSize` jobs
 * `pending` via SKIP LOCKED.
 */
export async function claimAndProcessBatch(batchSize = 5, workerId = 'cron'): Promise<{ requeued: number; processed: number }> {
  const supabase = getAdminClient()

  const { data: requeuedCount } = await supabase.rpc('requeue_stale_document_jobs')
  if (typeof requeuedCount === 'number' && requeuedCount > 0) {
    console.warn(`[queue] ${requeuedCount} job(s) 'processing' repris après timeout (${STALE_LOCK_LABEL})`)
  }

  const { data: claimed, error } = await supabase.rpc('claim_next_document_jobs', {
    p_batch_size: batchSize,
    p_worker_id: workerId,
  })
  if (error) {
    console.error('[queue] claim_next_document_jobs RPC failed:', error.message)
    return { requeued: requeuedCount || 0, processed: 0 }
  }

  const rows = (claimed || []) as QueueRow[]
  for (const row of rows) {
    await processClaimedJob(supabase, row)
  }

  return { requeued: requeuedCount || 0, processed: rows.length }
}

async function processClaimedJob(supabase: ReturnType<typeof getAdminClient>, row: QueueRow): Promise<void> {
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path, nom_fichier')
    .eq('id', row.document_id)
    .maybeSingle()

  if (!doc?.storage_path || !doc?.nom_fichier) {
    await finalizeJob(supabase, row, { ok: false, error: 'Document introuvable ou storage_path/nom_fichier manquant' })
    return
  }

  const result = await processDocument({
    documentId: row.document_id,
    storagePath: doc.storage_path,
    nomFichier: doc.nom_fichier,
  })

  await finalizeJob(supabase, row, result)
}

async function finalizeJob(
  supabase: ReturnType<typeof getAdminClient>,
  row: QueueRow,
  result: ProcessDocumentResult,
): Promise<void> {
  const now = new Date().toISOString()

  if (result.ok) {
    await supabase.from('document_processing_queue').update({
      statut: 'done',
      last_error: null,
      finished_at: now,
      updated_at: now,
    }).eq('id', row.id)

    if (row.source === 'telegram' && row.payload?.chat_id) {
      await notifyTelegram(row.payload.chat_id, result).catch((e: any) =>
        console.warn('[queue] notifyTelegram (success) failed:', e?.message))
    }
    return
  }

  const attempts = (row.attempts || 0) + 1
  const maxAttempts = row.max_attempts || 3

  if (attempts >= maxAttempts) {
    await supabase.from('document_processing_queue').update({
      statut: 'dead_letter',
      attempts,
      last_error: result.error,
      finished_at: now,
      updated_at: now,
    }).eq('id', row.id)

    await supabase.from('documents').update({
      statut: 'erreur',
      n8n_result: { error: result.error },
    }).eq('id', row.document_id)

    await insertDeadLetterAlert(supabase, row, attempts, result.error)

    if (row.source === 'telegram' && row.payload?.chat_id) {
      await notifyTelegram(row.payload.chat_id, result).catch((e: any) =>
        console.warn('[queue] notifyTelegram (dead_letter) failed:', e?.message))
    }
    return
  }

  const backoffSeconds = RETRY_BACKOFF_SECONDS[attempts - 1] ?? RETRY_BACKOFF_SECONDS[RETRY_BACKOFF_SECONDS.length - 1]
  await supabase.from('document_processing_queue').update({
    statut: 'pending',
    attempts,
    last_error: result.error,
    next_attempt_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
    locked_at: null,
    locked_by: null,
    updated_at: now,
  }).eq('id', row.id)
}

async function insertDeadLetterAlert(
  supabase: ReturnType<typeof getAdminClient>,
  row: QueueRow,
  attempts: number,
  error: string,
): Promise<void> {
  try {
    const { data: doc } = await supabase
      .from('documents')
      .select('nom_fichier, dossiers(societe_id)')
      .eq('id', row.document_id)
      .maybeSingle()
    const societeId = (doc as any)?.dossiers?.societe_id || null
    const nomFichier = (doc as any)?.nom_fichier || row.document_id

    await supabase.from('alertes').insert({
      societe_id: societeId,
      type_alerte: 'document_traitement_echec',
      niveau: 'critique',
      titre: `Échec du traitement automatique — ${nomFichier}`,
      description: `Le document n'a pas pu être traité après ${attempts} tentatives : ${String(error).slice(0, 400)}. ` +
        `Relance possible depuis Lexora → Documents → Réanalyser.`,
      statut: 'active',
      metadata: { document_id: row.document_id, queue_id: row.id, attempts, error, source: row.source },
    })
  } catch (e: any) {
    console.warn('[queue] insertDeadLetterAlert failed:', e?.message)
  }
}

const TYPE_LABEL: Record<string, string> = {
  facture_fournisseur: 'Facture fournisseur',
  facture_client: 'Facture client',
  releve_bancaire: 'Relevé bancaire',
  fiche_paie: 'Fiche de paie',
  charges_sociales: 'Charges sociales',
  contrat: 'Contrat',
  ticket: 'Ticket',
  recu: 'Reçu',
  bon_livraison: 'Bon de livraison',
  autre: 'Document',
}

async function notifyTelegram(chatId: number, result: ProcessDocumentResult): Promise<void> {
  const { sendTelegramMessage } = await import('@/lib/telegram/auth')
  if (result.ok) {
    const lines = [`✅ <b>Document traité</b>`, `📋 Type : <b>${TYPE_LABEL[result.type_document] || result.type_document}</b>`]
    if (result.societe_detectee && result.societe_detectee !== 'INCONNU') {
      lines.push(`🏢 Société : ${result.societe_detectee}`)
    }
    if (result.statut === 'en_attente_revue') {
      lines.push('', '⚠️ Confiance d\'extraction faible — vérification manuelle conseillée.')
    }
    lines.push('', 'Disponible dans <b>Lexora → Documents</b>.')
    await sendTelegramMessage(chatId, lines.join('\n'))
  } else {
    await sendTelegramMessage(
      chatId,
      `⚠️ <b>Échec du traitement du document</b>\n<code>${String(result.error).slice(0, 400)}</code>\n\n` +
      `Tu peux relancer depuis <b>Lexora → Documents → Réanalyser</b>.`,
    )
  }
}
