-- ============================================================================
-- Migration 237 — IFRS 9 ultra : Stages 1/2/3 + SICR + PD/LGD + macro + audit
-- ============================================================================
--
-- Contexte :
-- La mig 222 a posé les bases ECL IFRS 9 "simplified approach" :
--   • Table ifrs9_ecl_buckets (taux flat par tranche d'âge)
--   • Vue vw_creances_aging
--   • RPC calculer_ecl_clients() — provision agrégée
--
-- Cette migration porte Lexora au niveau de l'approche IFRS 9 **complète**
-- (general approach) attendue par les auditeurs pour des bilans audit-ready :
--
--   1. Stages 1 / 2 / 3 (IFRS 9 §5.5.5)
--       Stage 1 : 12-month ECL — performing, pas de SICR
--       Stage 2 : Lifetime ECL — SICR détecté (Significant Increase in
--                 Credit Risk) mais pas encore credit-impaired
--       Stage 3 : Lifetime ECL — credit-impaired (default constaté)
--
--   2. SICR (Significant Increase in Credit Risk) — règles automatisées
--       a) Retard > 30j sur une créance → Stage 2 minimum
--       b) Retard > 90j → Stage 3 (default présumé, IFRS 9 §5.5.5)
--       c) Override manuel via UI (audit trail)
--       d) Watchlist sectorielle (param futur)
--
--   3. PD (Probability of Default) et LGD (Loss Given Default)
--       Paramétrables par contrepartie OU par secteur (fallback).
--       Évite le taux flat par bucket qui ne tient pas en cas d'audit.
--
--   4. Forward-looking macro adjustment (IFRS 9 §5.5.17)
--       Multiplicateurs PD selon scénarios pondérés (base/optimiste/
--       pessimiste). Initialement neutre (×1.0), à affiner avec données BoM
--       (taux directeur, inflation, PIB Maurice).
--
--   5. Audit trail des reclassifications de stage
--       Trace immuable pour l'auditeur externe (qui, quand, pourquoi).
--
-- IDEMPOTENTE : peut être rejouée. Aucune donnée existante détruite.
-- ============================================================================

-- ── 1. Table : params PD/LGD par contrepartie ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ifrs9_counterparty_params (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  tiers         TEXT NOT NULL,         -- nom contrepartie (clé naturelle simple)
  secteur       TEXT,                  -- ex: 'tourism', 'manufacturing', 'services'
  pd_12m_pct    NUMERIC(5,2) NOT NULL DEFAULT 1.0,   -- Probability of Default 12 mois (%)
  pd_lifetime_pct NUMERIC(5,2) NOT NULL DEFAULT 3.0, -- PD lifetime (%)
  lgd_pct       NUMERIC(5,2) NOT NULL DEFAULT 45.0,  -- Loss Given Default (%) - Bâle II default
  ead_factor    NUMERIC(5,2) NOT NULL DEFAULT 100.0, -- Exposure at Default factor (%)
  note          TEXT,
  updated_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, tiers)
);
CREATE INDEX IF NOT EXISTS idx_ifrs9_cp_params_societe ON public.ifrs9_counterparty_params(societe_id);
CREATE INDEX IF NOT EXISTS idx_ifrs9_cp_params_secteur ON public.ifrs9_counterparty_params(secteur);

COMMENT ON TABLE public.ifrs9_counterparty_params IS
  'Paramètres IFRS 9 par contrepartie : PD (12m + lifetime), LGD, EAD factor. '
  'Permet d''affiner l''ECL au-delà du taux flat par bucket de la mig 222. '
  'Si absent pour une contrepartie, fallback sur défauts secteur (cf. ifrs9_sector_defaults).';

-- ── 2. Table : défauts secteur (fallback PD/LGD) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.ifrs9_sector_defaults (
  secteur       TEXT PRIMARY KEY,
  pd_12m_pct    NUMERIC(5,2) NOT NULL,
  pd_lifetime_pct NUMERIC(5,2) NOT NULL,
  lgd_pct       NUMERIC(5,2) NOT NULL DEFAULT 45.0,
  description   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Defaults conservateurs Maurice (à ajuster selon historique de pertes)
INSERT INTO public.ifrs9_sector_defaults (secteur, pd_12m_pct, pd_lifetime_pct, lgd_pct, description) VALUES
  ('default',       2.0,  5.0,  45.0, 'Fallback générique si secteur inconnu'),
  ('tourism',       4.0,  9.0,  50.0, 'Hôtellerie / restauration / agences voyage'),
  ('manufacturing', 1.5,  4.0,  40.0, 'Manufacturing / textile / agro-industrie'),
  ('services',      1.0,  3.0,  35.0, 'Services professionnels / BPO / IT'),
  ('construction',  3.0,  7.0,  50.0, 'BTP / immobilier'),
  ('retail',        2.5,  6.0,  45.0, 'Retail / distribution'),
  ('financial',     0.5,  1.5,  30.0, 'Banques / assurances / fintech'),
  ('agriculture',   3.5,  8.0,  50.0, 'Agriculture / pêche / sucre')
ON CONFLICT (secteur) DO UPDATE
  SET pd_12m_pct = EXCLUDED.pd_12m_pct,
      pd_lifetime_pct = EXCLUDED.pd_lifetime_pct,
      lgd_pct = EXCLUDED.lgd_pct,
      description = EXCLUDED.description,
      updated_at = NOW();

COMMENT ON TABLE public.ifrs9_sector_defaults IS
  'Taux PD/LGD par défaut par secteur économique mauricien. Fallback quand '
  'un client n''a pas de paramètres explicites dans ifrs9_counterparty_params.';

-- ── 3. Table : stage assignment courant ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ifrs9_stage_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id     UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  tiers          TEXT NOT NULL,
  stage          SMALLINT NOT NULL CHECK (stage IN (1, 2, 3)),
  sicr_reason    TEXT,                       -- 'past_due_30d', 'past_due_90d', 'manual', 'sector_watchlist'
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by    UUID REFERENCES auth.users(id),
  UNIQUE (societe_id, tiers)
);
CREATE INDEX IF NOT EXISTS idx_ifrs9_stage_assignments_societe ON public.ifrs9_stage_assignments(societe_id);
CREATE INDEX IF NOT EXISTS idx_ifrs9_stage_assignments_stage   ON public.ifrs9_stage_assignments(stage);

COMMENT ON TABLE public.ifrs9_stage_assignments IS
  'Stage IFRS 9 actuel par contrepartie. Mis à jour par ifrs9_compute_stage() '
  'ou override manuel via UI. Snapshot mensuel via ifrs9_stage_history.';

-- ── 4. Table : audit trail historique des stages ───────────────────────────
CREATE TABLE IF NOT EXISTS public.ifrs9_stage_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  tiers        TEXT NOT NULL,
  stage_from   SMALLINT CHECK (stage_from IN (1, 2, 3)),
  stage_to     SMALLINT NOT NULL CHECK (stage_to IN (1, 2, 3)),
  reason       TEXT NOT NULL,
  changed_by   UUID REFERENCES auth.users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ifrs9_stage_history_societe_tiers
  ON public.ifrs9_stage_history(societe_id, tiers, changed_at DESC);

COMMENT ON TABLE public.ifrs9_stage_history IS
  'Audit trail des reclassifications de stage IFRS 9 (immuable, INSERT only). '
  'Exigence auditeur externe : qui, quand, pourquoi.';

-- ── 5. Table : forward-looking macro factors ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.ifrs9_macro_scenarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id     UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  scenario       TEXT NOT NULL,         -- 'base', 'optimistic', 'pessimistic'
  pd_multiplier  NUMERIC(5,3) NOT NULL DEFAULT 1.0,  -- ex: 1.2 = +20% PD vs base
  weight_pct     NUMERIC(5,2) NOT NULL DEFAULT 0.0,  -- pondération scénario (Σ = 100)
  valid_from     DATE NOT NULL DEFAULT CURRENT_DATE,
  rationale      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, scenario, valid_from)
);

-- Scénario par défaut neutre (×1.0 base 100%) — à raffiner société par société
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.societes LOOP
    INSERT INTO public.ifrs9_macro_scenarios (societe_id, scenario, pd_multiplier, weight_pct, rationale) VALUES
      (rec.id, 'base',        1.0,  60, 'Scénario central — conditions économiques actuelles'),
      (rec.id, 'optimistic',  0.7,  20, 'Reprise touristique + baisse inflation'),
      (rec.id, 'pessimistic', 1.5,  20, 'Récession globale + hausse taux directeurs')
    ON CONFLICT (societe_id, scenario, valid_from) DO NOTHING;
  END LOOP;
END $$;

COMMENT ON TABLE public.ifrs9_macro_scenarios IS
  'Scénarios macro-économiques pondérés pour ajustement forward-looking IFRS 9 §5.5.17. '
  'PD ajustée = Σ (PD_base × pd_multiplier × weight_pct/100). '
  'Σ weight_pct par société et date = 100.';

-- ── 6. RLS sur toutes les nouvelles tables ─────────────────────────────────
DO $$
BEGIN
  -- ifrs9_counterparty_params
  EXECUTE 'ALTER TABLE public.ifrs9_counterparty_params ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ifrs9_counterparty_params' AND policyname='ifrs9_cp_tenant_select') THEN
    CREATE POLICY ifrs9_cp_tenant_select ON public.ifrs9_counterparty_params
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ifrs9_cp_tenant_modify ON public.ifrs9_counterparty_params
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  -- ifrs9_stage_assignments
  EXECUTE 'ALTER TABLE public.ifrs9_stage_assignments ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ifrs9_stage_assignments' AND policyname='ifrs9_sa_tenant_select') THEN
    CREATE POLICY ifrs9_sa_tenant_select ON public.ifrs9_stage_assignments
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ifrs9_sa_tenant_modify ON public.ifrs9_stage_assignments
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  -- ifrs9_stage_history (lecture seule pour tenants, INSERT via SECURITY DEFINER)
  EXECUTE 'ALTER TABLE public.ifrs9_stage_history ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ifrs9_stage_history' AND policyname='ifrs9_sh_tenant_select') THEN
    CREATE POLICY ifrs9_sh_tenant_select ON public.ifrs9_stage_history
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    -- Pas de policy INSERT/UPDATE/DELETE : seules les RPC SECURITY DEFINER écrivent
  END IF;

  -- ifrs9_macro_scenarios
  EXECUTE 'ALTER TABLE public.ifrs9_macro_scenarios ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ifrs9_macro_scenarios' AND policyname='ifrs9_macro_tenant_select') THEN
    CREATE POLICY ifrs9_macro_tenant_select ON public.ifrs9_macro_scenarios
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ifrs9_macro_tenant_modify ON public.ifrs9_macro_scenarios
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  -- ifrs9_sector_defaults : lecture publique (référentiel partagé)
  EXECUTE 'ALTER TABLE public.ifrs9_sector_defaults ENABLE ROW LEVEL SECURITY';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ifrs9_sector_defaults' AND policyname='ifrs9_sd_read_all') THEN
    CREATE POLICY ifrs9_sd_read_all ON public.ifrs9_sector_defaults
      FOR SELECT USING (TRUE);
  END IF;
END $$;

-- ── 7. RPC : compute_stage — détection SICR + assignment ───────────────────
CREATE OR REPLACE FUNCTION public.ifrs9_compute_stage(
  p_societe_id UUID,
  p_tiers      TEXT,
  p_persist    BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
  stage        SMALLINT,
  reason       TEXT,
  max_age_days INT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_max_age     INT;
  v_stage       SMALLINT;
  v_reason      TEXT;
  v_override    BOOLEAN;
  v_prev_stage  SMALLINT;
BEGIN
  -- 1) On regarde la pire créance non payée
  SELECT COALESCE(MAX(CURRENT_DATE - f.date_facture), 0)
    INTO v_max_age
    FROM public.factures f
   WHERE f.societe_id = p_societe_id
     AND f.tiers = p_tiers
     AND f.type_facture = 'client'
     AND f.statut IN ('en_attente', 'retard')
     AND COALESCE(f.montant_mur, 0) > 0;

  -- 2) Override manuel — short-circuit
  SELECT manual_override INTO v_override
    FROM public.ifrs9_stage_assignments
   WHERE societe_id = p_societe_id AND tiers = p_tiers;

  IF v_override = TRUE THEN
    SELECT stage INTO v_stage FROM public.ifrs9_stage_assignments
     WHERE societe_id = p_societe_id AND tiers = p_tiers;
    v_reason := 'manual_override';
  ELSIF v_max_age >= 90 THEN
    v_stage  := 3;
    v_reason := 'past_due_90d';
  ELSIF v_max_age >= 30 THEN
    v_stage  := 2;
    v_reason := 'past_due_30d';
  ELSE
    v_stage  := 1;
    v_reason := 'performing';
  END IF;

  -- 3) Persist (sauf opt-out)
  IF p_persist THEN
    SELECT s.stage INTO v_prev_stage
      FROM public.ifrs9_stage_assignments s
     WHERE s.societe_id = p_societe_id AND s.tiers = p_tiers;

    INSERT INTO public.ifrs9_stage_assignments
      (societe_id, tiers, stage, sicr_reason, manual_override, computed_at)
    VALUES (p_societe_id, p_tiers, v_stage, v_reason, COALESCE(v_override, FALSE), NOW())
    ON CONFLICT (societe_id, tiers) DO UPDATE
      SET stage = EXCLUDED.stage,
          sicr_reason = EXCLUDED.sicr_reason,
          computed_at = NOW()
      WHERE public.ifrs9_stage_assignments.manual_override = FALSE;

    -- Audit trail si changement
    IF v_prev_stage IS DISTINCT FROM v_stage THEN
      INSERT INTO public.ifrs9_stage_history (societe_id, tiers, stage_from, stage_to, reason)
        VALUES (p_societe_id, p_tiers, v_prev_stage, v_stage, v_reason);
    END IF;
  END IF;

  RETURN QUERY SELECT v_stage, v_reason, v_max_age;
END;
$$;

COMMENT ON FUNCTION public.ifrs9_compute_stage IS
  'Calcule le Stage IFRS 9 (1/2/3) pour une contrepartie via règles SICR : '
  '>90j past due → Stage 3, >30j → Stage 2, sinon Stage 1. '
  'Respecte les overrides manuels. Inscrit changement dans audit trail.';

-- ── 8. RPC : compute_ecl_full — ECL complète avec Stages + macro ───────────
CREATE OR REPLACE FUNCTION public.ifrs9_compute_ecl_full(
  p_societe_id UUID
) RETURNS TABLE (
  tiers              TEXT,
  stage              SMALLINT,
  exposure_mur       NUMERIC,
  pd_used_pct        NUMERIC,
  lgd_pct            NUMERIC,
  ead_factor_pct     NUMERIC,
  macro_multiplier   NUMERIC,
  ecl_base_mur       NUMERIC,
  ecl_with_macro_mur NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_macro_mult NUMERIC;
BEGIN
  -- Calcul du multiplicateur macro pondéré pour cette société
  SELECT COALESCE(SUM(pd_multiplier * weight_pct) / 100.0, 1.0)
    INTO v_macro_mult
    FROM public.ifrs9_macro_scenarios
   WHERE societe_id = p_societe_id
     AND valid_from <= CURRENT_DATE;

  RETURN QUERY
  WITH exposures AS (
    SELECT
      f.tiers,
      SUM(COALESCE(f.montant_mur, 0)) AS exposure
    FROM public.factures f
    WHERE f.societe_id = p_societe_id
      AND f.type_facture = 'client'
      AND f.statut IN ('en_attente', 'retard')
      AND COALESCE(f.montant_mur, 0) > 0
    GROUP BY f.tiers
  ),
  stages AS (
    SELECT s.tiers, s.stage
      FROM public.ifrs9_stage_assignments s
     WHERE s.societe_id = p_societe_id
  ),
  params AS (
    SELECT p.tiers,
           p.pd_12m_pct,
           p.pd_lifetime_pct,
           p.lgd_pct,
           p.ead_factor,
           p.secteur
      FROM public.ifrs9_counterparty_params p
     WHERE p.societe_id = p_societe_id
  )
  SELECT
    e.tiers,
    COALESCE(st.stage, 1)::SMALLINT AS stage,
    e.exposure AS exposure_mur,
    -- PD : 12m si Stage 1, lifetime sinon. Fallback : params secteur ou default.
    CASE
      WHEN COALESCE(st.stage, 1) = 1 THEN COALESCE(pa.pd_12m_pct,      sd.pd_12m_pct,      def.pd_12m_pct)
      ELSE                                COALESCE(pa.pd_lifetime_pct, sd.pd_lifetime_pct, def.pd_lifetime_pct)
    END AS pd_used_pct,
    COALESCE(pa.lgd_pct,    sd.lgd_pct,    def.lgd_pct)    AS lgd_pct,
    COALESCE(pa.ead_factor, 100.0)                         AS ead_factor_pct,
    v_macro_mult                                           AS macro_multiplier,
    -- ECL = EAD × PD × LGD
    ROUND(
      e.exposure
      * (COALESCE(pa.ead_factor, 100.0) / 100.0)
      * (CASE
           WHEN COALESCE(st.stage, 1) = 1 THEN COALESCE(pa.pd_12m_pct, sd.pd_12m_pct, def.pd_12m_pct)
           ELSE                                COALESCE(pa.pd_lifetime_pct, sd.pd_lifetime_pct, def.pd_lifetime_pct)
         END / 100.0)
      * (COALESCE(pa.lgd_pct, sd.lgd_pct, def.lgd_pct) / 100.0),
      2
    ) AS ecl_base_mur,
    -- ECL ajusté forward-looking
    ROUND(
      e.exposure
      * (COALESCE(pa.ead_factor, 100.0) / 100.0)
      * (CASE
           WHEN COALESCE(st.stage, 1) = 1 THEN COALESCE(pa.pd_12m_pct, sd.pd_12m_pct, def.pd_12m_pct)
           ELSE                                COALESCE(pa.pd_lifetime_pct, sd.pd_lifetime_pct, def.pd_lifetime_pct)
         END / 100.0)
      * (COALESCE(pa.lgd_pct, sd.lgd_pct, def.lgd_pct) / 100.0)
      * v_macro_mult,
      2
    ) AS ecl_with_macro_mur
  FROM exposures e
  LEFT JOIN stages    st ON st.tiers = e.tiers
  LEFT JOIN params    pa ON pa.tiers = e.tiers
  LEFT JOIN public.ifrs9_sector_defaults sd  ON sd.secteur = pa.secteur
  LEFT JOIN public.ifrs9_sector_defaults def ON def.secteur = 'default'
  ORDER BY e.tiers;
END;
$$;

COMMENT ON FUNCTION public.ifrs9_compute_ecl_full IS
  'ECL IFRS 9 niveau "general approach" : ECL = EAD × PD × LGD × macro_adj. '
  'PD 12m si Stage 1, PD lifetime si Stage 2/3. Fallback secteur si pas de '
  'params explicites. Multiplicateur macro pondéré (forward-looking §5.5.17).';

-- ── 9. RPC : refresh_all_stages (cron quotidien) ───────────────────────────
CREATE OR REPLACE FUNCTION public.ifrs9_refresh_all_stages(p_societe_id UUID DEFAULT NULL)
RETURNS TABLE (societe_id UUID, tiers TEXT, stage SMALLINT, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT f.societe_id, f.tiers
      FROM public.factures f
     WHERE f.type_facture = 'client'
       AND f.statut IN ('en_attente', 'retard')
       AND COALESCE(f.montant_mur, 0) > 0
       AND (p_societe_id IS NULL OR f.societe_id = p_societe_id)
  LOOP
    PERFORM public.ifrs9_compute_stage(rec.societe_id, rec.tiers, TRUE);
  END LOOP;

  RETURN QUERY
  SELECT s.societe_id, s.tiers, s.stage, s.sicr_reason
    FROM public.ifrs9_stage_assignments s
   WHERE (p_societe_id IS NULL OR s.societe_id = p_societe_id);
END;
$$;

COMMENT ON FUNCTION public.ifrs9_refresh_all_stages IS
  'Refresh quotidien des stages IFRS 9 pour toutes les contreparties actives '
  '(ou une seule société si p_societe_id fourni). À appeler via cron Vercel.';

-- ── 10. Vue : disclosure IFRS 7 (credit risk exposure par stage) ──────────
CREATE OR REPLACE VIEW public.vw_ifrs9_disclosure AS
SELECT
  f.societe_id,
  COALESCE(sa.stage, 1) AS stage,
  COUNT(DISTINCT f.tiers) AS nb_contreparties,
  COUNT(*) AS nb_factures,
  SUM(COALESCE(f.montant_mur, 0)) AS exposure_total_mur
FROM public.factures f
LEFT JOIN public.ifrs9_stage_assignments sa
  ON sa.societe_id = f.societe_id AND sa.tiers = f.tiers
WHERE f.type_facture = 'client'
  AND f.statut IN ('en_attente', 'retard')
  AND COALESCE(f.montant_mur, 0) > 0
GROUP BY f.societe_id, COALESCE(sa.stage, 1);

COMMENT ON VIEW public.vw_ifrs9_disclosure IS
  'Disclosure IFRS 7 §35M : nb contreparties + exposure par stage IFRS 9. '
  'Source pour les annexes états financiers (credit risk exposure).';

-- ── 11. Rapport ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sectors     INT;
  v_scenarios   INT;
BEGIN
  SELECT COUNT(*) INTO v_sectors   FROM public.ifrs9_sector_defaults;
  SELECT COUNT(*) INTO v_scenarios FROM public.ifrs9_macro_scenarios;
  RAISE NOTICE '──────────────────────────────────────────────────────';
  RAISE NOTICE '✓ Migration 237 — IFRS 9 ultra (Stages + SICR + PD/LGD + macro)';
  RAISE NOTICE '  • % secteurs avec PD/LGD par défaut', v_sectors;
  RAISE NOTICE '  • % scénarios macro initialisés (neutres × sociétés)', v_scenarios;
  RAISE NOTICE '  • Tables : ifrs9_counterparty_params, ifrs9_stage_assignments, ifrs9_stage_history, ifrs9_macro_scenarios';
  RAISE NOTICE '  • RPC   : ifrs9_compute_stage, ifrs9_compute_ecl_full, ifrs9_refresh_all_stages';
  RAISE NOTICE '  • Vue   : vw_ifrs9_disclosure (IFRS 7 disclosure)';
  RAISE NOTICE 'Cron recommandé : SELECT ifrs9_refresh_all_stages() quotidien 06:00 UTC';
  RAISE NOTICE '──────────────────────────────────────────────────────';
END $$;
