-- Migration 464 — Persistance du module Audit-Readiness GBC
-- ----------------------------------------------------------------------------
-- Trois tables :
--   • audit_runs            : historique des dossiers d'audit générés (snapshot)
--   • audit_pbc_status      : statut manuel des pièces PBC (cochage persistant)
--   • audit_findings_status : statut des constats (résolu / accepté / faux positif)
--
-- RLS (SEC-003) : accès via public.user_has_societe_access(societe_id) — pas de
-- sous-requête inline. Les écritures applicatives passent par le service role
-- (admin) ; la RLS protège tout accès client direct.

-- == audit_runs ==============================================================
CREATE TABLE IF NOT EXISTS public.audit_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice             TEXT NOT NULL,
  genere_le            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  genere_par           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  equilibre            BOOLEAN,
  nb_findings_critical INT DEFAULT 0,
  nb_findings_warning  INT DEFAULT 0,
  pbc_fournis          INT DEFAULT 0,
  pbc_total            INT DEFAULT 0,
  resume               JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_runs_societe_exercice
  ON public.audit_runs(societe_id, exercice, genere_le DESC);

-- == audit_pbc_status ========================================================
CREATE TABLE IF NOT EXISTS public.audit_pbc_status (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice    TEXT NOT NULL,
  pbc_code    TEXT NOT NULL,
  statut      TEXT NOT NULL DEFAULT 'todo' CHECK (statut IN ('todo','fourni','na')),
  note        TEXT,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice, pbc_code)
);
CREATE INDEX IF NOT EXISTS idx_audit_pbc_societe_exercice
  ON public.audit_pbc_status(societe_id, exercice);

-- == audit_findings_status ===================================================
CREATE TABLE IF NOT EXISTS public.audit_findings_status (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice    TEXT NOT NULL,
  finding_key TEXT NOT NULL,
  statut      TEXT NOT NULL DEFAULT 'open' CHECK (statut IN ('open','resolved','accepted','false_positive')),
  note        TEXT,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice, finding_key)
);
CREATE INDEX IF NOT EXISTS idx_audit_findings_societe_exercice
  ON public.audit_findings_status(societe_id, exercice);

-- == RLS =====================================================================
ALTER TABLE public.audit_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_pbc_status      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_findings_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_runs_access ON public.audit_runs;
CREATE POLICY audit_runs_access ON public.audit_runs
  FOR ALL
  USING (public.user_has_societe_access(societe_id))
  WITH CHECK (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS audit_pbc_status_access ON public.audit_pbc_status;
CREATE POLICY audit_pbc_status_access ON public.audit_pbc_status
  FOR ALL
  USING (public.user_has_societe_access(societe_id))
  WITH CHECK (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS audit_findings_status_access ON public.audit_findings_status;
CREATE POLICY audit_findings_status_access ON public.audit_findings_status
  FOR ALL
  USING (public.user_has_societe_access(societe_id))
  WITH CHECK (public.user_has_societe_access(societe_id));

COMMENT ON TABLE public.audit_runs IS 'Historique des dossiers de pré-audit générés (module audit-readiness GBC).';
COMMENT ON TABLE public.audit_pbc_status IS 'Statut manuel persistant des pièces PBC par société/exercice.';
COMMENT ON TABLE public.audit_findings_status IS 'Statut de traitement des constats d''audit (résolu/accepté/faux positif).';
