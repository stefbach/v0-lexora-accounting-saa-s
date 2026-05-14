-- ═══════════════════════════════════════════════════════════════════════
-- Migration 248: Audit log MRA e-invoicing (fiscalisation factures)
--
-- Demande utilisateur : "tu dois maintenant mettre aux normes e-voicing
-- cela doit être 100% PARFAIT".
--
-- Avant : la fonction fiscaliseInvoice() (lib/mra-ifp.ts) faisait des
-- appels mock sans aucune trace. Impossible de reconstituer l'historique
-- des tentatives, de detecter les erreurs, de réémettre en cas d'échec.
--
-- Cette table trace TOUS les appels à l'API MRA EBS :
--   • Action effectuée (fiscalise / cancel / check_status)
--   • Payload envoyé + reçu (jsonb pour debug + audit légal)
--   • Statut HTTP + duration
--   • IRN obtenu / QR généré
--   • Erreur si applicable
--   • Source : manuel (UI) vs cron auto-retry
--
-- Conservation requise par MRA : 7 ans (RLS scopée par société, jamais
-- de suppression — utiliser archive si besoin).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mra_fiscalisation_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  -- Métier
  action        TEXT NOT NULL CHECK (action IN ('fiscalise','cancel','check_status','test_connection')),
  environment   TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  -- Résultat
  success       BOOLEAN NOT NULL DEFAULT FALSE,
  irn           TEXT,
  qr_code_url   TEXT,
  http_status   INTEGER,
  duration_ms   INTEGER,
  error_code    TEXT,
  error_message TEXT,
  -- Payloads (jsonb pour requête analytique + audit légal)
  request_payload  JSONB,
  response_payload JSONB,
  -- Origine
  source        TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','cron','retry','api')),
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mra_logs_facture
  ON public.mra_fiscalisation_logs(facture_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mra_logs_societe_date
  ON public.mra_fiscalisation_logs(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mra_logs_success
  ON public.mra_fiscalisation_logs(societe_id, success, created_at DESC);

-- RLS scopée par société
ALTER TABLE public.mra_fiscalisation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mra_logs_select" ON public.mra_fiscalisation_logs;
CREATE POLICY "mra_logs_select" ON public.mra_fiscalisation_logs
  FOR SELECT USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

-- Pas de policy INSERT/UPDATE/DELETE pour les users — seul le service
-- role peut écrire dans cette table (via l'API serveur). Évite les
-- manipulations frauduleuses des logs d'audit.

COMMENT ON TABLE public.mra_fiscalisation_logs IS
  'Audit log des appels MRA EBS (e-invoicing Maurice). Conservation 7 ans minimum.';

NOTIFY pgrst, 'reload schema';
