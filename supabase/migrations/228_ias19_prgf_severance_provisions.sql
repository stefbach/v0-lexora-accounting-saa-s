-- ============================================================================
-- Migration 228 — IAS 19 : Provision PRGF actuarielle + Severance approximée
-- ============================================================================
--
-- Findings audit IFRS P0/P1 :
--   • Provision PRGF actuarielle (DBO/PBO IAS 19) absente
--   • Provision Severance (indemnités fin contrat) non comptabilisée en
--     continu — uniquement à la rupture
--
-- Cette migration crée des RPCs simplifiées qui ne font pas du calcul
-- actuariel complet (DBO avec hypothèses démographiques + financières +
-- évaluation indépendante) — ce qui demanderait un actuaire — mais une
-- approximation conservative :
--
--   PRGF (IAS 19 §70+) :
--     DBO_simple = Σ employés (salaire_mensuel × ancienneté_années × 0.5)
--     × facteur_actualisation (par défaut 0.85)
--
--   Severance (S.70 Mauritius Workers' Rights Act) :
--     Severance_max = 3 mois de salaire par année d'ancienneté
--     Provision_estim = Σ (severance_max × probabilité_départ_annuelle)
--     probabilité_départ_annuelle par défaut : 8% (industrie standard)
--
-- Snapshots mensuels stockés pour audit IFRS et roll-forward.
--
-- IDEMPOTENTE.
-- ============================================================================

-- ── 1. Tables snapshots IAS 19 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ias19_provisions_prgf_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  date_snapshot DATE NOT NULL,
  total_dbo NUMERIC(15, 2) NOT NULL,             -- Defined Benefit Obligation
  facteur_actualisation NUMERIC(5, 4) DEFAULT 0.85,
  nb_employes INT,
  detail JSONB,                                   -- per-employé breakdown
  ecriture_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, date_snapshot)
);

CREATE TABLE IF NOT EXISTS public.ias19_provisions_severance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  date_snapshot DATE NOT NULL,
  total_provision NUMERIC(15, 2) NOT NULL,
  proba_depart_annuelle_pct NUMERIC(5, 2) DEFAULT 8.0,
  nb_employes INT,
  detail JSONB,
  ecriture_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, date_snapshot)
);

ALTER TABLE public.ias19_provisions_prgf_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ias19_provisions_severance_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ias19_provisions_prgf_snapshots'
                   AND policyname = 'ias19_prgf_tenant_select') THEN
    CREATE POLICY ias19_prgf_tenant_select ON public.ias19_provisions_prgf_snapshots
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ias19_prgf_tenant_modify ON public.ias19_provisions_prgf_snapshots
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ias19_provisions_severance_snapshots'
                   AND policyname = 'ias19_sev_tenant_select') THEN
    CREATE POLICY ias19_sev_tenant_select ON public.ias19_provisions_severance_snapshots
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ias19_sev_tenant_modify ON public.ias19_provisions_severance_snapshots
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 2. RPC PRGF ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provisionner_prgf_mensuel(
  p_societe_id UUID,
  p_date_snapshot DATE,
  p_facteur_actualisation NUMERIC DEFAULT 0.85
) RETURNS public.ias19_provisions_prgf_snapshots
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_dossier_id UUID;
  v_total_dbo NUMERIC := 0;
  v_nb_employes INT := 0;
  v_detail JSONB := '[]'::jsonb;
  v_employe RECORD;
  v_dbo NUMERIC;
  v_anciennete_ans NUMERIC;
  v_ecriture_id UUID;
  v_provision_existante NUMERIC := 0;
  v_delta NUMERIC;
  v_result public.ias19_provisions_prgf_snapshots;
BEGIN
  SELECT id INTO v_dossier_id FROM public.dossiers
  WHERE societe_id = p_societe_id ORDER BY created_at DESC LIMIT 1;

  -- Calculer DBO simple par employé
  FOR v_employe IN
    SELECT id, code_employe, nom, prenom, salaire_base, date_arrivee
    FROM public.employes
    WHERE societe_id = p_societe_id
      AND COALESCE(date_depart, '9999-12-31'::DATE) > p_date_snapshot
      AND COALESCE(salaire_base, 0) > 0
      AND date_arrivee IS NOT NULL
      AND date_arrivee <= p_date_snapshot
  LOOP
    v_anciennete_ans := EXTRACT(EPOCH FROM (p_date_snapshot - v_employe.date_arrivee)) / (365.25 * 86400);
    v_dbo := ROUND(
      v_employe.salaire_base * v_anciennete_ans * 0.5 * p_facteur_actualisation,
      2
    );
    v_total_dbo := v_total_dbo + v_dbo;
    v_nb_employes := v_nb_employes + 1;
    v_detail := v_detail || jsonb_build_object(
      'employe_id', v_employe.id,
      'code', v_employe.code_employe,
      'nom', v_employe.nom || ' ' || v_employe.prenom,
      'anciennete_ans', ROUND(v_anciennete_ans, 2),
      'salaire_base', v_employe.salaire_base,
      'dbo', v_dbo
    );
  END LOOP;

  -- Récupérer la dernière provision pour calculer le delta
  SELECT COALESCE(SUM(credit_mur) - SUM(debit_mur), 0) INTO v_provision_existante
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND numero_compte = '1581'
    AND date_ecriture < p_date_snapshot;

  v_delta := v_total_dbo - v_provision_existante;

  -- Idempotence : delete écritures existantes pour cette date
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND journal = 'OD-IAS19-PRGF'
    AND date_ecriture = p_date_snapshot;

  -- Génération écriture : 64175 / 1581 (delta)
  IF ABS(v_delta) > 0.01 THEN
    IF v_delta > 0 THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-PRGF',
              'PRGF-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '64175', 'Cotisations IAS 19 (provisions retraites)',
              'Provision PRGF IAS 19',
              'Augmentation provision PRGF (' || v_nb_employes || ' employés)',
              v_delta, 0, TO_CHAR(p_date_snapshot, 'YYYY'))
        RETURNING id INTO v_ecriture_id;
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-PRGF',
              'PRGF-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '1581', 'Provision pour engagements PRGF (IAS 19)',
              'Provision PRGF IAS 19', 'Augmentation provision', 0, v_delta,
              TO_CHAR(p_date_snapshot, 'YYYY'));
    ELSE
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-PRGF',
              'PRGF-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '1581', 'Provision pour engagements PRGF (IAS 19)',
              'Provision PRGF IAS 19', 'Reprise provision', ABS(v_delta), 0,
              TO_CHAR(p_date_snapshot, 'YYYY'))
        RETURNING id INTO v_ecriture_id;
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-PRGF',
              'PRGF-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '64175', 'Cotisations IAS 19', 'Provision PRGF IAS 19',
              'Reprise provision', 0, ABS(v_delta), TO_CHAR(p_date_snapshot, 'YYYY'));
    END IF;
  END IF;

  -- Snapshot
  INSERT INTO public.ias19_provisions_prgf_snapshots
    (societe_id, date_snapshot, total_dbo, facteur_actualisation, nb_employes, detail, ecriture_id)
  VALUES
    (p_societe_id, p_date_snapshot, v_total_dbo, p_facteur_actualisation,
     v_nb_employes, v_detail, v_ecriture_id)
  ON CONFLICT (societe_id, date_snapshot) DO UPDATE
    SET total_dbo = EXCLUDED.total_dbo,
        facteur_actualisation = EXCLUDED.facteur_actualisation,
        nb_employes = EXCLUDED.nb_employes,
        detail = EXCLUDED.detail,
        ecriture_id = EXCLUDED.ecriture_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.provisionner_prgf_mensuel IS
  'IAS 19 — Provision PRGF approximation conservative (sans calcul '
  'actuariel complet). Génère snapshot + écriture delta 64175/1581. '
  'Idempotent. À appeler chaque fin de mois OU en clôture annuelle.';

-- ── 3. RPC Severance ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provisionner_severance_mensuel(
  p_societe_id UUID,
  p_date_snapshot DATE,
  p_proba_depart_pct NUMERIC DEFAULT 8.0
) RETURNS public.ias19_provisions_severance_snapshots
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_dossier_id UUID;
  v_total NUMERIC := 0;
  v_nb INT := 0;
  v_detail JSONB := '[]'::jsonb;
  v_employe RECORD;
  v_anciennete_ans NUMERIC;
  v_severance_max NUMERIC;
  v_provision_emp NUMERIC;
  v_existante NUMERIC := 0;
  v_delta NUMERIC;
  v_ecriture_id UUID;
  v_result public.ias19_provisions_severance_snapshots;
BEGIN
  SELECT id INTO v_dossier_id FROM public.dossiers
  WHERE societe_id = p_societe_id ORDER BY created_at DESC LIMIT 1;

  FOR v_employe IN
    SELECT id, code_employe, nom, prenom, salaire_base, date_arrivee
    FROM public.employes
    WHERE societe_id = p_societe_id
      AND COALESCE(date_depart, '9999-12-31'::DATE) > p_date_snapshot
      AND COALESCE(salaire_base, 0) > 0
      AND date_arrivee IS NOT NULL
      AND date_arrivee <= p_date_snapshot
  LOOP
    v_anciennete_ans := EXTRACT(EPOCH FROM (p_date_snapshot - v_employe.date_arrivee)) / (365.25 * 86400);
    -- Workers' Rights Act Maurice S.70 : 3 mois de salaire par année d'ancienneté
    v_severance_max := v_employe.salaire_base * 3 * v_anciennete_ans;
    v_provision_emp := ROUND(v_severance_max * (p_proba_depart_pct / 100.0), 2);
    v_total := v_total + v_provision_emp;
    v_nb := v_nb + 1;
    v_detail := v_detail || jsonb_build_object(
      'employe_id', v_employe.id,
      'code', v_employe.code_employe,
      'anciennete_ans', ROUND(v_anciennete_ans, 2),
      'severance_max', v_severance_max,
      'provision', v_provision_emp
    );
  END LOOP;

  SELECT COALESCE(SUM(credit_mur) - SUM(debit_mur), 0) INTO v_existante
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id AND numero_compte = '1582'
    AND date_ecriture < p_date_snapshot;

  v_delta := v_total - v_existante;

  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND journal = 'OD-IAS19-SEV'
    AND date_ecriture = p_date_snapshot;

  IF ABS(v_delta) > 0.01 THEN
    IF v_delta > 0 THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-SEV',
              'SEV-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '6418', 'Indemnités compensatrices et de départ',
              'Provision Severance IAS 19',
              'Provision indemnités fin contrat (' || v_nb || ' employés, proba ' || p_proba_depart_pct || '%)',
              v_delta, 0, TO_CHAR(p_date_snapshot, 'YYYY'))
        RETURNING id INTO v_ecriture_id;
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-SEV',
              'SEV-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '1582', 'Provision pour indemnités de fin de contrat',
              'Provision Severance IAS 19', 'Augmentation provision', 0, v_delta,
              TO_CHAR(p_date_snapshot, 'YYYY'));
    ELSE
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-SEV',
              'SEV-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '1582', 'Provision pour indemnités de fin de contrat',
              'Provision Severance IAS 19', 'Reprise provision', ABS(v_delta), 0,
              TO_CHAR(p_date_snapshot, 'YYYY'))
        RETURNING id INTO v_ecriture_id;
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, p_date_snapshot, 'OD-IAS19-SEV',
              'SEV-' || TO_CHAR(p_date_snapshot, 'YYYYMM'),
              '6418', 'Indemnités compensatrices et de départ',
              'Provision Severance IAS 19', 'Reprise provision', 0, ABS(v_delta),
              TO_CHAR(p_date_snapshot, 'YYYY'));
    END IF;
  END IF;

  INSERT INTO public.ias19_provisions_severance_snapshots
    (societe_id, date_snapshot, total_provision, proba_depart_annuelle_pct,
     nb_employes, detail, ecriture_id)
  VALUES
    (p_societe_id, p_date_snapshot, v_total, p_proba_depart_pct,
     v_nb, v_detail, v_ecriture_id)
  ON CONFLICT (societe_id, date_snapshot) DO UPDATE
    SET total_provision = EXCLUDED.total_provision,
        proba_depart_annuelle_pct = EXCLUDED.proba_depart_annuelle_pct,
        nb_employes = EXCLUDED.nb_employes,
        detail = EXCLUDED.detail,
        ecriture_id = EXCLUDED.ecriture_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.provisionner_severance_mensuel IS
  'IAS 19 + Workers'' Rights Act S.70 — provision severance approximée. '
  'Severance théorique = 3 mois salaire × ancienneté. Provision = '
  'severance × proba_depart annuelle (default 8%). Génère snapshot + '
  'écriture delta 6418/1582.';

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 228 — provisionner_prgf_mensuel() — IAS 19 PRGF';
  RAISE NOTICE '✓ Migration 228 — provisionner_severance_mensuel() — IAS 19 + WRA S.70';
END $$;
