-- =============================================================================
-- Migration 480 — File d'attente asynchrone pour le traitement des documents
--
-- Contexte : le pipeline OCR/catégorisation (appel Claude vision + écritures
-- comptables) tournait jusqu'ici DANS la requête HTTP (upload web ou webhook
-- Telegram), ce qui expose l'utilisateur/le bot à la latence complète de
-- l'appel IA (10-60s) et à un risque de timeout silencieux en cas de pic de
-- charge. Cette migration ajoute une file d'attente Postgres pour découpler
-- l'accusé de réception du traitement réel :
--
--   1. `document_processing_queue` : une ligne par job de traitement.
--   2. `claim_next_document_jobs(batch_size, worker_id)` : claim atomique
--      d'un lot de jobs 'pending' via `FOR UPDATE SKIP LOCKED` — appelée par
--      le cron de secours (traitement par lot, jamais de double-prise même
--      si le kick immédiat traite le même job en parallèle).
--   3. `requeue_stale_document_jobs()` : reprise des jobs 'processing' dont
--      le worker a crashé (verrou > 6 min) — remise en 'pending'.
--
-- Écriture réservée au service_role (routes internes / worker / cron) : pas
-- de policy INSERT/UPDATE pour authenticated/anon, cohérent avec SEC-002
-- (pas d'exécution ad-hoc côté client). Lecture scopée via le helper SEC-003
-- `user_has_societe_access` (pas de sous-requête inline).
--
-- Idempotente, additive, rejouable. Rollback : DROP FUNCTION (x2) + DROP
-- TABLE public.document_processing_queue.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.document_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('web_upload', 'telegram', 'reanalyze', 'manual')),
  statut TEXT NOT NULL DEFAULT 'pending'
    CHECK (statut IN ('pending', 'processing', 'done', 'error', 'dead_letter')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_doc_queue_claim
  ON public.document_processing_queue (next_attempt_at)
  WHERE statut = 'pending';

CREATE INDEX IF NOT EXISTS idx_doc_queue_document
  ON public.document_processing_queue (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_queue_stale_processing
  ON public.document_processing_queue (locked_at)
  WHERE statut = 'processing';

-- Anti-double-job : au plus un job actif (pending/processing) par document, quel
-- que soit le point d'entrée (double-clic « Réanalyser », POST + retry, webhook +
-- cron). Rend l'enqueue idempotent via INSERT ... ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_queue_one_active_per_document
  ON public.document_processing_queue (document_id)
  WHERE statut IN ('pending', 'processing');

ALTER TABLE public.document_processing_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_queue_select_by_societe_access ON public.document_processing_queue;
CREATE POLICY doc_queue_select_by_societe_access
  ON public.document_processing_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.dossiers ds ON ds.id = d.dossier_id
      WHERE d.id = document_processing_queue.document_id
        AND public.user_has_societe_access(ds.societe_id)
    )
  );

COMMENT ON TABLE public.document_processing_queue IS
  'File d''attente du traitement OCR/catégorisation asynchrone des documents
   (facture_fournisseur et autres pièces). Une ligne = un job. Claim atomique
   via claim_next_document_jobs() (SKIP LOCKED). Écrite uniquement par le
   service_role (routes internes / worker / cron) — pas de policy INSERT ni
   UPDATE pour authenticated/anon.';

-- Claim atomique d'un lot de jobs pending, avec verrouillage anti double-prise.
CREATE OR REPLACE FUNCTION public.claim_next_document_jobs(
  p_batch_size INT DEFAULT 5,
  p_worker_id TEXT DEFAULT 'worker'
)
RETURNS SETOF public.document_processing_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.document_processing_queue q
  SET statut = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  WHERE q.id IN (
    SELECT id
    FROM public.document_processing_queue
    WHERE statut = 'pending'
      AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_document_jobs(INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_document_jobs(INT, TEXT) TO service_role;

-- Reprise des jobs 'processing' bloqués par un crash worker (timeout de 6 min).
CREATE OR REPLACE FUNCTION public.requeue_stale_document_jobs()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stale AS (
    UPDATE public.document_processing_queue
    -- Un crash dur du worker (kill maxDuration, OOM sur un PDF pathologique)
    -- laisse le job en 'processing' sans passer par finalizeJob : attempts n'y
    -- est donc jamais incrémenté. On l'incrémente ICI, sinon un « document
    -- poison » serait requeué et re-crasherait indéfiniment (coût API en boucle,
    -- jamais de dead_letter). Au-delà de max_attempts, on l'enterre.
    SET statut = CASE
                   WHEN attempts + 1 >= max_attempts THEN 'dead_letter'
                   ELSE 'pending'
                 END,
        attempts = attempts + 1,
        locked_at = NULL,
        locked_by = NULL,
        last_error = COALESCE(last_error, 'worker stale (crash présumé), requeue automatique'),
        next_attempt_at = now(),
        finished_at = CASE
                        WHEN attempts + 1 >= max_attempts THEN now()
                        ELSE finished_at
                      END,
        updated_at = now()
    WHERE statut = 'processing'
      AND locked_at < now() - INTERVAL '6 minutes'
    RETURNING id
  )
  SELECT count(*)::INT FROM stale;
$$;

REVOKE ALL ON FUNCTION public.requeue_stale_document_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_stale_document_jobs() TO service_role;
