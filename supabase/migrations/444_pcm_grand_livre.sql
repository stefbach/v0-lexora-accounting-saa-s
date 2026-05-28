-- =============================================================================
-- Migration 444 — PCM (Plan Comptable Mauricien) éditable + audit
-- =============================================================================
-- CONTEXTE :
--   Lexora doit permettre à chaque société d'avoir un PCM éditable basé sur
--   un template CORE Maurice + des modules d'extension (GBC1, Health, Holding,
--   B2B Tech). Aujourd'hui, le PCM est codé en dur dans
--   lib/accounting/rapprochement/lettrage.ts et non éditable.
--
-- PRINCIPES :
--   • Un seul PCM CORE Maurice (~70 comptes) défini comme template
--   • Modules d'extension activables (15+ comptes chacun)
--   • Société customise libellés, ajoute sous-comptes, archive (jamais delete)
--   • Sous-comptes via pattern 4511.OCC (point séparateur)
--   • Audit trail systématique
--   • RLS via helper user_has_societe_access (SEC-003)
--
-- TABLES :
--   1. pcm_templates       — Catalogue templates (CORE + modules)
--   2. comptes_societes    — PCM par société (éditable)
--   3. pcm_modules_actifs  — Tracking modules activés par société
--   4. audit_log_pcm       — Audit trail toutes modifications PCM/écritures
--
-- À ne pas confondre :
--   • plan_comptable_pcm (table existante) = référentiel GLOBAL en lecture
--   • pcm_templates (nouvelle) = catalogue de templates appliquables
--   • comptes_societes (nouvelle) = instance par société, éditable
-- =============================================================================

-- ============================================================================
-- 1. pcm_templates — Catalogue de templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pcm_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  nom             TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL CHECK (type IN ('core', 'module')),
  juridiction_code TEXT NOT NULL DEFAULT 'MU',
  version         TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  comptes_json    JSONB NOT NULL,
  prerequisites   TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcm_templates_type ON public.pcm_templates(type, is_active);

COMMENT ON TABLE public.pcm_templates IS
'Catalogue de templates PCM Lexora (CORE Maurice + modules d''extension). comptes_json contient le JSON des comptes à appliquer.';


-- ============================================================================
-- 2. comptes_societes — PCM par société (éditable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.comptes_societes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id        UUID NOT NULL REFERENCES public.societes(id) ON DELETE RESTRICT,
  numero            TEXT NOT NULL CHECK (numero ~ '^[0-9]{1,8}(\.[A-Z0-9_]{1,16})?$'),
  numero_parent     TEXT,
  intitule          TEXT NOT NULL CHECK (length(trim(intitule)) > 0),
  intitule_custom   BOOLEAN NOT NULL DEFAULT FALSE,
  classe            INTEGER NOT NULL CHECK (classe BETWEEN 1 AND 8),
  type              TEXT NOT NULL CHECK (type IN ('actif', 'passif', 'charge', 'produit', 'mixte', 'tresorerie')),
  nature            TEXT,
  sens_normal       TEXT NOT NULL DEFAULT 'mixte' CHECK (sens_normal IN ('debit', 'credit', 'mixte')),
  lettrable         BOOLEAN NOT NULL DEFAULT FALSE,
  obligatoire       BOOLEAN NOT NULL DEFAULT FALSE,
  archive           BOOLEAN NOT NULL DEFAULT FALSE,
  archive_at        TIMESTAMPTZ,
  archive_reason    TEXT,
  archive_target    TEXT,                          -- compte de reclassement éventuel
  template_source   TEXT,                          -- 'core_maurice', 'module_gbc1', 'legacy_migration', 'custom'
  tags              TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata          JSONB DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID,
  UNIQUE(societe_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_comptes_societes_societe_classe
  ON public.comptes_societes(societe_id, classe);
CREATE INDEX IF NOT EXISTS idx_comptes_societes_parent
  ON public.comptes_societes(societe_id, numero_parent)
  WHERE numero_parent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comptes_societes_archive
  ON public.comptes_societes(societe_id, archive);
CREATE INDEX IF NOT EXISTS idx_comptes_societes_tags
  ON public.comptes_societes USING GIN(tags);

COMMENT ON TABLE public.comptes_societes IS
'PCM par société, éditable. Sous-comptes via pattern 4511.OCC. Archive seulement, jamais DELETE.';


-- ============================================================================
-- 3. pcm_modules_actifs — Modules activés par société
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pcm_modules_actifs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  template_code    TEXT NOT NULL,
  activated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_by     UUID,
  version_applied  TEXT NOT NULL,
  UNIQUE(societe_id, template_code)
);

CREATE INDEX IF NOT EXISTS idx_pcm_modules_actifs_societe
  ON public.pcm_modules_actifs(societe_id);

COMMENT ON TABLE public.pcm_modules_actifs IS
'Tracking des modules PCM activés par société. Permet l''idempotence des initialisations.';


-- ============================================================================
-- 4. audit_log_pcm — Audit trail PCM + écritures
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log_pcm (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL,
  action       TEXT NOT NULL,        -- 'create_compte', 'update_compte', 'archive_compte', 'reclass_ecritures', 'apply_template', 'activate_module', 'cloturer', 'decloturer', etc.
  entity_type  TEXT NOT NULL,        -- 'compte', 'ecriture', 'template', 'module', 'periode'
  entity_id    TEXT NOT NULL,
  before_state JSONB,
  after_state  JSONB,
  actor_id     UUID,
  actor_type   TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'mcp_llm', 'system', 'migration')),
  reason       TEXT,
  metadata     JSONB DEFAULT '{}'::JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_pcm_societe_date
  ON public.audit_log_pcm(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_pcm_action
  ON public.audit_log_pcm(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_pcm_entity
  ON public.audit_log_pcm(entity_type, entity_id);

COMMENT ON TABLE public.audit_log_pcm IS
'Audit trail systématique de toutes les modifications PCM, écritures, clôtures. Append-only.';


-- ============================================================================
-- 5. Triggers updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_pcm_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pcm_templates_updated_at ON public.pcm_templates;
CREATE TRIGGER tg_pcm_templates_updated_at
  BEFORE UPDATE ON public.pcm_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_pcm_set_updated_at();

DROP TRIGGER IF EXISTS tg_comptes_societes_updated_at ON public.comptes_societes;
CREATE TRIGGER tg_comptes_societes_updated_at
  BEFORE UPDATE ON public.comptes_societes
  FOR EACH ROW EXECUTE FUNCTION public.tg_pcm_set_updated_at();


-- ============================================================================
-- 6. Row Level Security (RLS)
-- ============================================================================

-- pcm_templates : lecture publique (templates accessibles à tous), écriture super_admin
ALTER TABLE public.pcm_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcm_templates_read ON public.pcm_templates;
CREATE POLICY pcm_templates_read ON public.pcm_templates
  FOR SELECT USING (TRUE);

-- comptes_societes : RLS via user_has_societe_access (SEC-003)
ALTER TABLE public.comptes_societes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comptes_societes_select ON public.comptes_societes;
CREATE POLICY comptes_societes_select ON public.comptes_societes
  FOR SELECT USING (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS comptes_societes_insert ON public.comptes_societes;
CREATE POLICY comptes_societes_insert ON public.comptes_societes
  FOR INSERT WITH CHECK (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS comptes_societes_update ON public.comptes_societes;
CREATE POLICY comptes_societes_update ON public.comptes_societes
  FOR UPDATE USING (public.user_has_societe_access(societe_id))
  WITH CHECK (public.user_has_societe_access(societe_id));

-- Pas de policy DELETE → archive uniquement

-- pcm_modules_actifs
ALTER TABLE public.pcm_modules_actifs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcm_modules_actifs_select ON public.pcm_modules_actifs;
CREATE POLICY pcm_modules_actifs_select ON public.pcm_modules_actifs
  FOR SELECT USING (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS pcm_modules_actifs_insert ON public.pcm_modules_actifs;
CREATE POLICY pcm_modules_actifs_insert ON public.pcm_modules_actifs
  FOR INSERT WITH CHECK (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS pcm_modules_actifs_delete ON public.pcm_modules_actifs;
CREATE POLICY pcm_modules_actifs_delete ON public.pcm_modules_actifs
  FOR DELETE USING (public.user_has_societe_access(societe_id));

-- audit_log_pcm : SELECT pour tous les users de la société, INSERT free (system)
ALTER TABLE public.audit_log_pcm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_pcm_select ON public.audit_log_pcm;
CREATE POLICY audit_log_pcm_select ON public.audit_log_pcm
  FOR SELECT USING (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS audit_log_pcm_insert ON public.audit_log_pcm;
CREATE POLICY audit_log_pcm_insert ON public.audit_log_pcm
  FOR INSERT WITH CHECK (public.user_has_societe_access(societe_id));

-- Pas d'UPDATE/DELETE sur audit_log_pcm → append-only


-- ============================================================================
-- 7. Vue helper : balance d'un compte (utilitaire pour audit)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_balance_compte_societe AS
SELECT
  cs.societe_id,
  cs.numero,
  cs.intitule,
  cs.classe,
  cs.archive,
  COALESCE(SUM(ec.debit_mur), 0)::NUMERIC(15,2)    AS total_debit,
  COALESCE(SUM(ec.credit_mur), 0)::NUMERIC(15,2)   AS total_credit,
  (COALESCE(SUM(ec.debit_mur), 0) - COALESCE(SUM(ec.credit_mur), 0))::NUMERIC(15,2) AS solde,
  COUNT(ec.id)                                     AS nb_ecritures
FROM public.comptes_societes cs
LEFT JOIN public.ecritures_comptables_v2 ec
  ON ec.societe_id = cs.societe_id
  AND ec.numero_compte = cs.numero
GROUP BY cs.societe_id, cs.numero, cs.intitule, cs.classe, cs.archive;

COMMENT ON VIEW public.v_balance_compte_societe IS
'Balance par compte (cumul débit/crédit/solde). Utilisée pour audit PCM et reclassement.';
