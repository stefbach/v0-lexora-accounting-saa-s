-- ============================================================================
-- Migration 222 — Comptes manquants (TDS, APS, IFRS 9, IAS 21) + helpers
-- ============================================================================
--
-- Findings audit IFRS + Maurice tax :
--   • Compte 491 (Provision créances douteuses IFRS 9) absent
--   • Compte 4421 (APS payé d'avance) absent
--   • Comptes 4471 (TDS retenu), 6356 (TDS sur loyer), 6357 (TDS sur services) absents
--   • Comptes 666/766 (gain/perte de change) déjà présents (cf. mig 202) — vérifié, OK
--
-- Ajoute aussi :
--   • Table `ifrs9_ecl_buckets` pour aging buckets (ECL simplifié IFRS 9)
--   • Vue `vw_creances_aging` pour analyse créances par âge
--
-- IDEMPOTENTE.
-- ============================================================================

-- ── 1. Comptes manquants au plan comptable ───────────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  -- IFRS 9 — Provision créances douteuses (contre-actif)
  ('491',  'Provisions sur créances clients (IFRS 9 — ECL)',   'actif',  'C', '49',  3),
  -- Maurice tax — APS et acomptes IS
  ('4421', 'État, acomptes IS (APS)',                          'actif',  'D', '442', 4),
  ('4422', 'État, acomptes CSR',                               'actif',  'D', '442', 4),
  -- Maurice tax — TDS (Tax Deducted at Source, ITA Section 111A)
  ('4471', 'TDS retenu à reverser à la MRA',                   'passif', 'C', '447', 4),
  ('6356', 'TDS sur loyer (charge)',                           'charge', 'D', '635', 4),
  ('6357', 'TDS sur services professionnels (charge)',         'charge', 'D', '635', 4),
  -- IAS 19 — Provision PRGF actuarielle
  ('1581', 'Provision pour engagements PRGF (IAS 19)',         'passif', 'C', '158', 4),
  ('1582', 'Provision pour indemnités de fin de contrat',      'passif', 'C', '158', 4),
  -- Provision congés payés (passif courant si <12 mois)
  ('4282', 'Provision congés payés à liquider',                'passif', 'C', '428', 4),
  -- Stock variations (manquant dans seed mig 202)
  ('603',  'Variation des stocks',                             'charge', 'D', NULL, 3)
ON CONFLICT (compte) DO UPDATE
  SET libelle       = EXCLUDED.libelle,
      type_compte   = EXCLUDED.type_compte,
      sens_normal   = EXCLUDED.sens_normal,
      compte_parent = EXCLUDED.compte_parent,
      niveau        = EXCLUDED.niveau;

-- ── 2. Vérifier 666/766 présents (gain/perte de change) ──────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  ('666', 'Pertes de change',                                  'charge',  'D', NULL, 3),
  ('666N', 'Pertes de change non réalisées (IAS 21)',          'charge',  'D', '666', 4),
  ('766', 'Gains de change',                                   'produit', 'C', NULL, 3),
  ('766N', 'Gains de change non réalisés (IAS 21)',            'produit', 'C', '766', 4)
ON CONFLICT (compte) DO UPDATE
  SET libelle       = EXCLUDED.libelle,
      type_compte   = EXCLUDED.type_compte,
      sens_normal   = EXCLUDED.sens_normal,
      compte_parent = EXCLUDED.compte_parent,
      niveau        = EXCLUDED.niveau;

-- ── 3. Table aging buckets IFRS 9 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ifrs9_ecl_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  bucket_label TEXT NOT NULL,        -- '0-30j', '31-60j', '61-90j', '>90j'
  age_min_days INT NOT NULL,
  age_max_days INT,                  -- NULL = pas de plafond
  ecl_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,  -- taux de provision (ex: 5.0 pour 5%)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, bucket_label)
);

-- Buckets par défaut (taux conservateurs Maurice / IFRS 9 simplified approach)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.societes
  LOOP
    INSERT INTO public.ifrs9_ecl_buckets (societe_id, bucket_label, age_min_days, age_max_days, ecl_rate_pct) VALUES
      (rec.id, '0-30j',   0,  30,  0.5),
      (rec.id, '31-60j',  31, 60,  2.0),
      (rec.id, '61-90j',  61, 90,  5.0),
      (rec.id, '91-180j', 91, 180, 25.0),
      (rec.id, '>180j',   181, NULL, 50.0)
    ON CONFLICT (societe_id, bucket_label) DO NOTHING;
  END LOOP;
END $$;

ALTER TABLE public.ifrs9_ecl_buckets ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ifrs9_ecl_buckets'
      AND policyname = 'ifrs9_ecl_buckets_tenant_select'
  ) THEN
    CREATE POLICY ifrs9_ecl_buckets_tenant_select ON public.ifrs9_ecl_buckets
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ifrs9_ecl_buckets_tenant_modify ON public.ifrs9_ecl_buckets
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 4. Vue creances_aging ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_creances_aging AS
WITH unpaid_factures AS (
  SELECT
    f.id, f.societe_id, f.tiers, f.numero_facture, f.date_facture,
    f.date_echeance, f.montant_mur, f.statut,
    CURRENT_DATE - f.date_facture AS age_jours
  FROM public.factures f
  WHERE f.type_facture = 'client'
    AND f.statut IN ('en_attente', 'retard')
    AND COALESCE(f.montant_mur, 0) > 0
)
SELECT
  uf.societe_id,
  uf.tiers,
  uf.id AS facture_id,
  uf.numero_facture,
  uf.date_facture,
  uf.date_echeance,
  uf.montant_mur,
  uf.age_jours,
  CASE
    WHEN uf.age_jours <= 30 THEN '0-30j'
    WHEN uf.age_jours <= 60 THEN '31-60j'
    WHEN uf.age_jours <= 90 THEN '61-90j'
    WHEN uf.age_jours <= 180 THEN '91-180j'
    ELSE '>180j'
  END AS bucket
FROM unpaid_factures uf;

COMMENT ON VIEW public.vw_creances_aging IS
  'Aging des créances clients par bucket (0-30j, 31-60j, 61-90j, 91-180j, >180j). '
  'Base pour le calcul ECL IFRS 9 simplifié.';

-- ── 5. RPC : calculer ECL provision IFRS 9 ───────────────────────────────
CREATE OR REPLACE FUNCTION public.calculer_ecl_clients(
  p_societe_id UUID,
  p_date_calcul DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  bucket TEXT,
  nb_factures INT,
  total_creances NUMERIC,
  ecl_rate_pct NUMERIC,
  provision_calculee NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.bucket,
    COUNT(*)::INT AS nb_factures,
    SUM(a.montant_mur)::NUMERIC AS total_creances,
    COALESCE(b.ecl_rate_pct, 0)::NUMERIC AS ecl_rate_pct,
    ROUND(SUM(a.montant_mur) * COALESCE(b.ecl_rate_pct, 0) / 100, 2) AS provision_calculee
  FROM public.vw_creances_aging a
  LEFT JOIN public.ifrs9_ecl_buckets b
    ON b.societe_id = a.societe_id AND b.bucket_label = a.bucket
  WHERE a.societe_id = p_societe_id
  GROUP BY a.bucket, b.ecl_rate_pct
  ORDER BY a.bucket;
END;
$$;

COMMENT ON FUNCTION public.calculer_ecl_clients IS
  'Calcule la provision ECL IFRS 9 sur créances clients par bucket d''âge. '
  'À appeler en clôture mensuelle pour générer écriture 6817 / 491.';

-- ── 6. Rapport ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count_comptes INT;
  v_count_buckets INT;
BEGIN
  SELECT COUNT(*) INTO v_count_comptes FROM public.plan_comptable
    WHERE compte IN ('491','4421','4422','4471','6356','6357','1581','1582','4282','603','666N','766N');
  SELECT COUNT(*) INTO v_count_buckets FROM public.ifrs9_ecl_buckets;

  RAISE NOTICE '✓ Migration 222 — % comptes manquants ajoutés au plan comptable', v_count_comptes;
  RAISE NOTICE '✓ Migration 222 — % buckets ECL initialisés', v_count_buckets;
  RAISE NOTICE '✓ Migration 222 — vue vw_creances_aging + RPC calculer_ecl_clients en place';
END $$;
