-- ============================================================================
-- Migration 420 — Tables référentielles RH (Wave 2-C problème 1)
-- ============================================================================
-- Remplace les 3 référentiels RH qui vivaient uniquement en localStorage
-- côté /client/parametres-rh :
--   - departements_rh        (remplace localStorage `rh_departments`)
--   - bureaux_rh             (remplace localStorage `rh_offices`)
--   - calendriers_travail    (remplace localStorage `rh_calendars`)
--
-- Les 3 autres entités gérées par la page (jours fériés, groupes de paie,
-- types de congés) sont déjà couvertes par :
--   - jours_feries           (mig 017 + mig 139)
--   - groupes_employes       (mig 041)
--   - conges_regles          (mig 170)
--
-- Pattern : societe_id NOT NULL (scope obligatoire), code unique par société,
-- RLS via user_has_societe_access() (helper migration 404).
-- Aucun ALTER sur tables existantes — uniquement CREATE IF NOT EXISTS.
-- ============================================================================

-- ─── Précondition : helper user_has_societe_access(uuid) ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_has_societe_access'
  ) THEN
    RAISE EXCEPTION 'Migration 420: user_has_societe_access() manquant — appliquer migration 404 d''abord';
  END IF;
END $$;

-- ─── 1. departements_rh ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departements_rh (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  nom         TEXT NOT NULL,
  description TEXT,
  manager_id  UUID REFERENCES public.employes(id) ON DELETE SET NULL,
  actif       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, code)
);
CREATE INDEX IF NOT EXISTS idx_departements_rh_societe
  ON public.departements_rh(societe_id);
CREATE INDEX IF NOT EXISTS idx_departements_rh_societe_actif
  ON public.departements_rh(societe_id) WHERE actif = TRUE;

COMMENT ON TABLE public.departements_rh IS
  'Référentiel des départements RH par société. Remplace localStorage rh_departments. À terme référencé par employes.departement_id.';

-- ─── 2. bureaux_rh ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bureaux_rh (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  nom              TEXT NOT NULL,
  adresse          TEXT,
  latitude         NUMERIC,
  longitude        NUMERIC,
  rayon_pointage_m INTEGER DEFAULT 50,
  actif            BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, code)
);
CREATE INDEX IF NOT EXISTS idx_bureaux_rh_societe
  ON public.bureaux_rh(societe_id);
CREATE INDEX IF NOT EXISTS idx_bureaux_rh_societe_actif
  ON public.bureaux_rh(societe_id) WHERE actif = TRUE;

COMMENT ON TABLE public.bureaux_rh IS
  'Référentiel des bureaux/sites par société. Remplace localStorage rh_offices. À terme référencé par employes.bureau_id.';

-- ─── 3. calendriers_travail ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendriers_travail (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom             TEXT NOT NULL,
  jours_semaine   TEXT[] NOT NULL DEFAULT ARRAY['Lun','Mar','Mer','Jeu','Ven']::TEXT[],
  heures_par_jour NUMERIC(4,2) NOT NULL DEFAULT 9,
  actif           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, nom)
);
CREATE INDEX IF NOT EXISTS idx_calendriers_travail_societe
  ON public.calendriers_travail(societe_id);
CREATE INDEX IF NOT EXISTS idx_calendriers_travail_societe_actif
  ON public.calendriers_travail(societe_id) WHERE actif = TRUE;

COMMENT ON TABLE public.calendriers_travail IS
  'Calendriers de travail par société (jours+heures). Remplace localStorage rh_calendars. À terme référencé par employes.calendrier_id.';

-- ─── 4. RLS : pattern hérité de mig 219/170 ────────────────────────────────
ALTER TABLE public.departements_rh    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bureaux_rh         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendriers_travail ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['departements_rh','bureaux_rh','calendriers_travail'] LOOP
    -- DROP IF EXISTS pour idempotence (pas de DROP POLICY IF NOT EXISTS sur PG<15)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_modify', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.user_has_societe_access(societe_id))',
      t || '_tenant_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.user_has_societe_access(societe_id)) WITH CHECK (public.user_has_societe_access(societe_id))',
      t || '_tenant_modify', t
    );
  END LOOP;
END $$;

-- ─── 5. Triggers updated_at (best-effort, no-op si helper absent) ──────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_departements_rh_updated_at ON public.departements_rh;
    CREATE TRIGGER trg_departements_rh_updated_at
      BEFORE UPDATE ON public.departements_rh
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_bureaux_rh_updated_at ON public.bureaux_rh;
    CREATE TRIGGER trg_bureaux_rh_updated_at
      BEFORE UPDATE ON public.bureaux_rh
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_calendriers_travail_updated_at ON public.calendriers_travail;
    CREATE TRIGGER trg_calendriers_travail_updated_at
      BEFORE UPDATE ON public.calendriers_travail
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
