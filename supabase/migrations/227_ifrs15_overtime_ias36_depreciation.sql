-- ============================================================================
-- Migration 227 — IFRS 15 revenue over-time + IAS 36 dépréciation immo
-- ============================================================================
--
-- Findings audit IFRS P1 :
--   • IFRS 15 : revenue recognition seulement à la facturation, pas à la
--     prestation. Pour services rendus sur période (abonnements, contrats),
--     IFRS 15 §35 impose recognition over time avec compte 487 (PCA).
--   • IAS 36 : aucun test de dépréciation annuel sur immobilisations
--     corporelles. Norme exige test si indice de perte de valeur.
--
-- Cette migration ajoute :
--   1. Comptes 487 (Produits constatés d'avance) et 681 (Dotation
--      dépréciation immo)
--   2. Champs sur factures : service_period_start/end, recurrence
--   3. RPC `prorata_revenus_over_time(societe_id, mois)` qui transfère du
--      487 vers 706 chaque mois selon prorata temporis
--   4. Table immobilisations_test_depreciation + RPC tester_depreciation
--
-- IDEMPOTENTE.
-- ============================================================================

-- ── 1. Comptes manquants ────────────────────────────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  ('487',  'Produits constatés d''avance (IFRS 15)',           'passif', 'C', NULL,  3),
  ('681',  'Dotations aux amortissements et provisions',        'charge', 'D', NULL,  3),
  ('6811', 'Dotation aux amortissements (IAS 16)',              'charge', 'D', '681', 4),
  ('6816', 'Dotation pour dépréciation actifs (IAS 36)',        'charge', 'D', '681', 4),
  ('6817', 'Dotation pour dépréciation créances (IFRS 9 ECL)',  'charge', 'D', '681', 4),
  ('291',  'Dépréciation immobilisations corporelles (IAS 36)', 'actif',  'C', NULL,  3)
ON CONFLICT (compte) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      type_compte = EXCLUDED.type_compte,
      sens_normal = EXCLUDED.sens_normal,
      compte_parent = EXCLUDED.compte_parent,
      niveau = EXCLUDED.niveau;

-- ── 2. Champs IFRS 15 sur factures ──────────────────────────────────────
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS service_period_start DATE,
  ADD COLUMN IF NOT EXISTS service_period_end DATE,
  ADD COLUMN IF NOT EXISTS revenue_recognition TEXT
    CHECK (revenue_recognition IN ('point_in_time', 'over_time') OR revenue_recognition IS NULL);

COMMENT ON COLUMN public.factures.service_period_start IS
  'IFRS 15 — date de début de la prestation. Si renseigné avec '
  'revenue_recognition=over_time, le revenu est reconnu prorata temporis '
  'via prorata_revenus_over_time().';

COMMENT ON COLUMN public.factures.revenue_recognition IS
  'IFRS 15 §35 — reconnaissance du revenu. point_in_time (défaut) = à la '
  'facturation. over_time = prorata sur service_period_start/end.';

-- ── 3. Table tracking prorata ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.revenue_recognition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  facture_id UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,                  -- 'YYYY-MM'
  montant_reconnu_mur NUMERIC(15, 2) NOT NULL,
  ecriture_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (facture_id, periode)
);

ALTER TABLE public.revenue_recognition_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_recognition_log'
                   AND policyname = 'revrec_tenant_select') THEN
    CREATE POLICY revrec_tenant_select ON public.revenue_recognition_log
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY revrec_tenant_modify ON public.revenue_recognition_log
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 4. RPC prorata mensuel IFRS 15 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prorata_revenus_over_time(
  p_societe_id UUID,
  p_periode TEXT             -- 'YYYY-MM' du mois à reconnaître
) RETURNS TABLE (
  facture_id UUID,
  montant_reconnu NUMERIC,
  nb_jours_periode INT,
  nb_jours_total INT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_dossier_id UUID;
  v_date_debut_mois DATE;
  v_date_fin_mois DATE;
  v_facture RECORD;
  v_jours_total INT;
  v_jours_dans_mois INT;
  v_montant_reconnu NUMERIC;
  v_ecriture_id UUID;
BEGIN
  SELECT id INTO v_dossier_id FROM public.dossiers
  WHERE societe_id = p_societe_id ORDER BY created_at DESC LIMIT 1;

  v_date_debut_mois := (p_periode || '-01')::DATE;
  v_date_fin_mois := (v_date_debut_mois + INTERVAL '1 month - 1 day')::DATE;

  -- Idempotence : delete les écritures de cette période
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND journal = 'OD-REVREC'
    AND date_ecriture BETWEEN v_date_debut_mois AND v_date_fin_mois;

  DELETE FROM public.revenue_recognition_log
  WHERE societe_id = p_societe_id AND periode = p_periode;

  FOR v_facture IN
    SELECT id, numero_facture, tiers, montant_mur, service_period_start, service_period_end
    FROM public.factures
    WHERE societe_id = p_societe_id
      AND type_facture = 'client'
      AND revenue_recognition = 'over_time'
      AND service_period_start IS NOT NULL
      AND service_period_end IS NOT NULL
      AND statut <> 'brouillon'
      -- La période du mois recoupe la période de service de la facture
      AND service_period_start <= v_date_fin_mois
      AND service_period_end >= v_date_debut_mois
      AND COALESCE(montant_mur, 0) > 0
  LOOP
    v_jours_total := (v_facture.service_period_end - v_facture.service_period_start) + 1;
    -- Jours du service présents dans le mois courant
    v_jours_dans_mois := (
      LEAST(v_facture.service_period_end, v_date_fin_mois) -
      GREATEST(v_facture.service_period_start, v_date_debut_mois)
    ) + 1;

    IF v_jours_total <= 0 OR v_jours_dans_mois <= 0 THEN CONTINUE; END IF;

    v_montant_reconnu := ROUND((v_facture.montant_mur * v_jours_dans_mois::NUMERIC / v_jours_total), 2);

    -- Génération écriture : Débit 487 (annule PCA) / Crédit 706 (CA reconnu)
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
       libelle, description, debit_mur, credit_mur, exercice)
    VALUES (p_societe_id, v_dossier_id, v_date_fin_mois, 'OD-REVREC',
            'REVREC-' || p_periode || '-' || v_facture.id::TEXT,
            '487', 'Produits constatés d''avance',
            'Reconnaissance ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
            'IFRS 15 prorata ' || v_jours_dans_mois || '/' || v_jours_total || ' jours',
            v_montant_reconnu, 0, TO_CHAR(v_date_fin_mois, 'YYYY'));

    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
       libelle, description, debit_mur, credit_mur, exercice)
    VALUES (p_societe_id, v_dossier_id, v_date_fin_mois, 'OD-REVREC',
            'REVREC-' || p_periode || '-' || v_facture.id::TEXT,
            '706', 'Prestations de services',
            'Reconnaissance ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
            'IFRS 15 prorata',
            0, v_montant_reconnu, TO_CHAR(v_date_fin_mois, 'YYYY'))
      RETURNING id INTO v_ecriture_id;

    INSERT INTO public.revenue_recognition_log
      (societe_id, facture_id, periode, montant_reconnu_mur, ecriture_id)
    VALUES (p_societe_id, v_facture.id, p_periode, v_montant_reconnu, v_ecriture_id);

    RETURN QUERY SELECT v_facture.id, v_montant_reconnu, v_jours_dans_mois, v_jours_total;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.prorata_revenus_over_time IS
  'IFRS 15 §35 — reconnaissance du revenu prorata temporis pour les '
  'factures avec revenue_recognition=over_time. À appeler chaque fin de '
  'mois. Idempotent sur la période.';

-- ── 5. Table test de dépréciation immo IAS 36 ───────────────────────────
CREATE TABLE IF NOT EXISTS public.immobilisations_test_depreciation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  immobilisation_id UUID NOT NULL REFERENCES public.immobilisations(id) ON DELETE CASCADE,
  date_test DATE NOT NULL,
  valeur_nette_comptable NUMERIC(15, 2) NOT NULL,
  valeur_recouvrable NUMERIC(15, 2) NOT NULL,   -- saisie par utilisateur (juste valeur ou valeur d'usage)
  perte_valeur NUMERIC(15, 2) GENERATED ALWAYS AS
    (GREATEST(valeur_nette_comptable - valeur_recouvrable, 0)) STORED,
  ecriture_id UUID,                                -- FK vers écriture 6816/291
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (immobilisation_id, date_test)
);

ALTER TABLE public.immobilisations_test_depreciation ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'immobilisations_test_depreciation'
                   AND policyname = 'imm_test_dep_tenant_select') THEN
    CREATE POLICY imm_test_dep_tenant_select ON public.immobilisations_test_depreciation
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY imm_test_dep_tenant_modify ON public.immobilisations_test_depreciation
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 6. RPC : enregistre un test + génère écriture si perte ──────────────
CREATE OR REPLACE FUNCTION public.enregistrer_test_depreciation_immo(
  p_societe_id UUID,
  p_immobilisation_id UUID,
  p_date_test DATE,
  p_valeur_recouvrable NUMERIC,
  p_notes TEXT DEFAULT NULL
) RETURNS public.immobilisations_test_depreciation
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_dossier_id UUID;
  v_immo RECORD;
  v_vnc NUMERIC;
  v_perte NUMERIC;
  v_ecriture_id UUID;
  v_result public.immobilisations_test_depreciation;
BEGIN
  SELECT id INTO v_dossier_id FROM public.dossiers
  WHERE societe_id = p_societe_id ORDER BY created_at DESC LIMIT 1;

  -- Récupérer VNC actuelle de l'immobilisation
  SELECT * INTO v_immo FROM public.immobilisations WHERE id = p_immobilisation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Immobilisation % introuvable', p_immobilisation_id;
  END IF;

  v_vnc := COALESCE(v_immo.valeur_nette_comptable, v_immo.valeur_acquisition - COALESCE(v_immo.amortissements_cumules, 0));
  v_perte := GREATEST(v_vnc - p_valeur_recouvrable, 0);

  -- Si perte > 0 : générer écriture 6816 (charge) / 291 (dépréciation)
  IF v_perte > 0.01 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
       libelle, description, debit_mur, credit_mur, exercice)
    VALUES (p_societe_id, v_dossier_id, p_date_test, 'OD-DEPREC',
            'DEPREC-' || p_immobilisation_id::TEXT || '-' || TO_CHAR(p_date_test, 'YYYYMMDD'),
            '6816', 'Dotation pour dépréciation actifs (IAS 36)',
            'Dépréciation immo ' || COALESCE(v_immo.libelle, 'sans libellé'),
            'IAS 36 — VNC ' || v_vnc || ' > Valeur recouvrable ' || p_valeur_recouvrable,
            v_perte, 0, TO_CHAR(p_date_test, 'YYYY'))
      RETURNING id INTO v_ecriture_id;

    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
       libelle, description, debit_mur, credit_mur, exercice)
    VALUES (p_societe_id, v_dossier_id, p_date_test, 'OD-DEPREC',
            'DEPREC-' || p_immobilisation_id::TEXT || '-' || TO_CHAR(p_date_test, 'YYYYMMDD'),
            '291', 'Dépréciation immobilisations corporelles (IAS 36)',
            'Dépréciation immo ' || COALESCE(v_immo.libelle, 'sans libellé'),
            'IAS 36',
            0, v_perte, TO_CHAR(p_date_test, 'YYYY'));
  END IF;

  INSERT INTO public.immobilisations_test_depreciation
    (societe_id, immobilisation_id, date_test, valeur_nette_comptable, valeur_recouvrable, ecriture_id, notes)
  VALUES
    (p_societe_id, p_immobilisation_id, p_date_test, v_vnc, p_valeur_recouvrable, v_ecriture_id, p_notes)
  ON CONFLICT (immobilisation_id, date_test) DO UPDATE
    SET valeur_nette_comptable = EXCLUDED.valeur_nette_comptable,
        valeur_recouvrable = EXCLUDED.valeur_recouvrable,
        ecriture_id = EXCLUDED.ecriture_id,
        notes = EXCLUDED.notes
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.enregistrer_test_depreciation_immo IS
  'IAS 36 — enregistre un test de dépréciation. Si valeur_recouvrable < '
  'VNC, génère écriture 6816 (charge) / 291 (dépréciation cumulée).';

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 227 — Comptes 487, 681x, 291 ajoutés';
  RAISE NOTICE '✓ IFRS 15 — RPC prorata_revenus_over_time() pour reconnaissance prorata mensuel';
  RAISE NOTICE '✓ IAS 36 — RPC enregistrer_test_depreciation_immo() pour test de valeur';
END $$;
