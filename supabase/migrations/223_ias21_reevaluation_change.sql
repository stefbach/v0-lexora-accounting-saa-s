-- ============================================================================
-- Migration 223 — IAS 21 : réévaluation 411/401 au taux de clôture
-- ============================================================================
--
-- Findings audit :
--   • Pas de fonction reevaluation_change EOY — IAS 21 §28-30 bafoué
--   • Soldes 411 (créances clients) et 401 (dettes fournisseurs) en devise
--     étrangère restent figés au taux historique de la facture, jamais
--     réévalués au taux de clôture → bilan EOY incorrect
--
-- Cette migration crée une RPC `reevaluer_creances_dettes_change` qui :
--   1. Identifie les écritures non lettrées sur 411/401 en devise ≠ MUR
--   2. Calcule pour chacune : montant_devise × taux_cloture - montant_mur_origine
--   3. Génère écritures OD :
--        Si gain : Débit 411/401 / Crédit 766N (gain change non réalisé)
--        Si perte : Débit 666N (perte change non réalisée) / Crédit 411/401
--   4. Stocke le résultat dans `cloture_reevaluation_log` pour audit
--
-- Usage :
--   SELECT reevaluer_creances_dettes_change(
--     p_societe_id := '<uuid>',
--     p_date_cloture := '2026-06-30',
--     p_taux_par_devise := jsonb_build_object('EUR', 54.50, 'USD', 45.20)
--   );
--
-- IDEMPOTENTE : la fonction efface les écritures REEVAL-<date> existantes
-- avant de réinsérer (cas re-run après ajustement).
-- ============================================================================

-- ── 1. Table de log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cloture_reevaluation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  date_cloture DATE NOT NULL,
  devise TEXT NOT NULL,
  taux_cloture NUMERIC(12, 6) NOT NULL,
  numero_compte TEXT NOT NULL,
  facture_id UUID,
  montant_devise NUMERIC(15, 2),
  montant_mur_origine NUMERIC(15, 2),
  montant_mur_recalcule NUMERIC(15, 2),
  ecart NUMERIC(15, 2),
  ecart_type TEXT,                    -- 'gain' / 'perte'
  ecriture_id UUID,                   -- FK vers ecritures_comptables_v2 créée
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, date_cloture, numero_compte, facture_id, devise)
);

ALTER TABLE public.cloture_reevaluation_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cloture_reevaluation_log'
      AND policyname = 'cloture_reeval_tenant_select'
  ) THEN
    CREATE POLICY cloture_reeval_tenant_select ON public.cloture_reevaluation_log
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY cloture_reeval_tenant_modify ON public.cloture_reevaluation_log
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 2. RPC réévaluation ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reevaluer_creances_dettes_change(
  p_societe_id UUID,
  p_date_cloture DATE,
  p_taux_par_devise JSONB        -- {"EUR": 54.50, "USD": 45.20, "GBP": 65.10}
) RETURNS TABLE (
  total_factures_evaluees INT,
  total_gain NUMERIC,
  total_perte NUMERIC,
  total_ecritures_creees INT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_dossier_id UUID;
  v_facture RECORD;
  v_taux_cloture NUMERIC;
  v_montant_mur_recalcule NUMERIC;
  v_ecart NUMERIC;
  v_compte TEXT;
  v_ref_folio TEXT;
  v_ecriture_id UUID;
  v_nb_evals INT := 0;
  v_total_gain NUMERIC := 0;
  v_total_perte NUMERIC := 0;
  v_nb_ecritures INT := 0;
BEGIN
  SELECT id INTO v_dossier_id FROM public.dossiers
  WHERE societe_id = p_societe_id ORDER BY created_at DESC LIMIT 1;

  -- Purge réévaluations précédentes pour cette date (idempotence)
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND journal = 'OD-REEVAL'
    AND date_ecriture = p_date_cloture;

  DELETE FROM public.cloture_reevaluation_log
  WHERE societe_id = p_societe_id AND date_cloture = p_date_cloture;

  -- Parcourir les factures non payées en devise étrangère
  FOR v_facture IN
    SELECT f.id, f.tiers, f.numero_facture, f.devise, f.taux_change,
           f.montant_ttc, f.montant_mur, f.type_facture, f.date_facture,
           CASE WHEN f.type_facture = 'fournisseur' THEN '401' ELSE '411' END AS compte
    FROM public.factures f
    WHERE f.societe_id = p_societe_id
      AND f.devise IS NOT NULL
      AND f.devise <> 'MUR'
      AND f.statut IN ('en_attente', 'retard')
      AND f.date_facture <= p_date_cloture
      AND COALESCE(f.montant_mur, 0) > 0
  LOOP
    v_taux_cloture := COALESCE((p_taux_par_devise ->> v_facture.devise)::NUMERIC, 0);
    IF v_taux_cloture <= 0 THEN
      CONTINUE; -- Devise sans taux fourni, skip silencieusement
    END IF;

    v_compte := v_facture.compte;
    v_montant_mur_recalcule := ROUND(v_facture.montant_ttc * v_taux_cloture, 2);
    v_ecart := v_montant_mur_recalcule - COALESCE(v_facture.montant_mur, 0);

    IF ABS(v_ecart) < 0.01 THEN
      v_nb_evals := v_nb_evals + 1;
      CONTINUE; -- Pas d'écart matériel, skip
    END IF;

    v_ref_folio := 'REEVAL-' || TO_CHAR(p_date_cloture, 'YYYYMMDD') || '-' || v_facture.id::TEXT;

    -- Génération écritures selon sens (gain ou perte)
    IF v_ecart > 0 THEN
      -- Cas 1 : 411 (créance) — augmente → gain de change non réalisé (766N)
      -- Cas 2 : 401 (dette) — augmente → perte de change non réalisée (666N)
      IF v_facture.type_facture = 'client' THEN
        -- Débit 411 (augmente créance), Crédit 766N
        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                v_compte, 'Clients (réévaluation IAS 21)',
                'Réévaluation ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Réévaluation IAS 21 (' || v_facture.devise || ' @' || v_taux_cloture || ')',
                ABS(v_ecart), 0, TO_CHAR(p_date_cloture, 'YYYY'))
          RETURNING id INTO v_ecriture_id;

        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                '766N', 'Gains de change non réalisés (IAS 21)',
                'Gain change ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Gain réévaluation IAS 21',
                0, ABS(v_ecart), TO_CHAR(p_date_cloture, 'YYYY'));

        v_total_gain := v_total_gain + ABS(v_ecart);
        v_nb_ecritures := v_nb_ecritures + 2;
      ELSE
        -- Fournisseur : 401 augmente, perte
        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                '666N', 'Pertes de change non réalisées (IAS 21)',
                'Perte change ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Perte réévaluation IAS 21',
                ABS(v_ecart), 0, TO_CHAR(p_date_cloture, 'YYYY'))
          RETURNING id INTO v_ecriture_id;

        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                v_compte, 'Fournisseurs (réévaluation IAS 21)',
                'Réévaluation ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Réévaluation IAS 21 (' || v_facture.devise || ' @' || v_taux_cloture || ')',
                0, ABS(v_ecart), TO_CHAR(p_date_cloture, 'YYYY'));

        v_total_perte := v_total_perte + ABS(v_ecart);
        v_nb_ecritures := v_nb_ecritures + 2;
      END IF;
    ELSE
      -- Écart négatif (créance baisse / dette baisse)
      IF v_facture.type_facture = 'client' THEN
        -- 411 baisse → perte
        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                '666N', 'Pertes de change non réalisées (IAS 21)',
                'Perte change ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Perte réévaluation IAS 21',
                ABS(v_ecart), 0, TO_CHAR(p_date_cloture, 'YYYY'))
          RETURNING id INTO v_ecriture_id;

        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                v_compte, 'Clients (réévaluation IAS 21)',
                'Réévaluation ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Réévaluation IAS 21',
                0, ABS(v_ecart), TO_CHAR(p_date_cloture, 'YYYY'));

        v_total_perte := v_total_perte + ABS(v_ecart);
      ELSE
        -- 401 baisse → gain
        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                v_compte, 'Fournisseurs (réévaluation IAS 21)',
                'Réévaluation ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Réévaluation IAS 21',
                ABS(v_ecart), 0, TO_CHAR(p_date_cloture, 'YYYY'))
          RETURNING id INTO v_ecriture_id;

        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
           libelle, description, debit_mur, credit_mur, exercice)
        VALUES (p_societe_id, v_dossier_id, p_date_cloture, 'OD-REEVAL', v_ref_folio,
                '766N', 'Gains de change non réalisés (IAS 21)',
                'Gain change ' || v_facture.numero_facture || ' — ' || v_facture.tiers,
                'Gain réévaluation IAS 21',
                0, ABS(v_ecart), TO_CHAR(p_date_cloture, 'YYYY'));

        v_total_gain := v_total_gain + ABS(v_ecart);
      END IF;
      v_nb_ecritures := v_nb_ecritures + 2;
    END IF;

    -- Log
    INSERT INTO public.cloture_reevaluation_log
      (societe_id, date_cloture, devise, taux_cloture, numero_compte, facture_id,
       montant_devise, montant_mur_origine, montant_mur_recalcule, ecart,
       ecart_type, ecriture_id)
    VALUES
      (p_societe_id, p_date_cloture, v_facture.devise, v_taux_cloture, v_compte, v_facture.id,
       v_facture.montant_ttc, v_facture.montant_mur, v_montant_mur_recalcule, v_ecart,
       CASE WHEN v_ecart > 0 THEN 'gain' ELSE 'perte' END,
       v_ecriture_id);

    v_nb_evals := v_nb_evals + 1;
  END LOOP;

  RETURN QUERY SELECT v_nb_evals, v_total_gain, v_total_perte, v_nb_ecritures;
END;
$$;

COMMENT ON FUNCTION public.reevaluer_creances_dettes_change IS
  'Réévaluation IAS 21 des créances 411 et dettes 401 en devise étrangère '
  'au taux de clôture. Génère écritures OD-REEVAL équilibrées 666N/766N. '
  'Idempotente. À appeler en clôture mensuelle ou annuelle.';

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 223 — RPC reevaluer_creances_dettes_change créée';
  RAISE NOTICE '✓ Table cloture_reevaluation_log + RLS en place';
END $$;
