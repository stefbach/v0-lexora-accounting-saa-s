-- =====================================================================
-- Migration 459 — MRA Hub : ajout PRGF + Training Levy (HRDC)
-- =====================================================================
-- Le dashboard MRA (mig 457) couvrait PAYE/CSG/NSF/TDS/TVA mais PAS le
-- PRGF (Portable Retirement Gratuity Fund) ni le Training Levy (HRDC 1%),
-- pourtant deux remises MRA mensuelles distinctes (comptes 4323 et 4324).
--
-- Cette migration :
--   1. Étend la contrainte CHECK type → + 'PRGF', 'LEVY'
--   2. Échéance : fin du mois suivant (comme CSG/NSF)
--   3. mra_compute_period calcule PRGF (crédit 4323) et LEVY (crédit 4324)
-- =====================================================================

-- ── 1. Contrainte CHECK élargie ──────────────────────────────────────
ALTER TABLE public.mra_declarations DROP CONSTRAINT IF EXISTS mra_declarations_type_check;
ALTER TABLE public.mra_declarations ADD CONSTRAINT mra_declarations_type_check
  CHECK (type IN ('PAYE','CSG','NSF','PRGF','LEVY','TDS','TVA','CIT','APS','IT_FORM3'));

-- ── 2. Échéance : PRGF/LEVY = fin du mois suivant (fonction mise à jour) ─
-- mra_echeance traite déjà tout type non (PAYE/TDS/TVA/annuel) comme
-- "fin du mois suivant" → PRGF et LEVY tombent automatiquement dans cette
-- branche. Pas de changement nécessaire à mra_echeance.

-- ── 3. mra_compute_period : ajoute PRGF (4323) + LEVY (4324) ──────────
CREATE OR REPLACE FUNCTION public.mra_compute_period(p_societe_id UUID, p_periode TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_start DATE; v_end DATE; v_count INT := 0;
  v_paye NUMERIC; v_csg_sal NUMERIC; v_csg_pat NUMERIC;
  v_nsf_sal NUMERIC; v_nsf_pat NUMERIC;
  v_prgf NUMERIC; v_levy NUMERIC;
  v_tds NUMERIC; v_tds_nb INT;
  v_tva NUMERIC;
BEGIN
  v_start := (p_periode || '-01')::DATE;
  v_end   := (v_start + INTERVAL '1 month - 1 day')::DATE;

  SELECT
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4330'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4311'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4321'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4312'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4322'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4323'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4324'), 0)
  INTO v_paye, v_csg_sal, v_csg_pat, v_nsf_sal, v_nsf_pat, v_prgf, v_levy
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND journal = 'OD-PAIE'
    AND date_ecriture BETWEEN v_start AND v_end;

  -- TDS depuis les factures fournisseurs
  SELECT COALESCE(SUM(tds_amount_mur), 0), COUNT(*) FILTER (WHERE COALESCE(tds_amount_mur,0) > 0)
  INTO v_tds, v_tds_nb
  FROM public.factures
  WHERE societe_id = p_societe_id
    AND COALESCE(tds_period, TO_CHAR(date_facture, 'YYYY-MM')) = p_periode
    AND COALESCE(tds_amount_mur, 0) > 0;

  -- TVA (best-effort si table présente)
  v_tva := 0;
  BEGIN
    EXECUTE 'SELECT COALESCE(SUM(tva_nette), 0) FROM public.tva_mensuelle WHERE societe_id = $1 AND periode = $2'
      INTO v_tva USING p_societe_id, p_periode;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_tva := 0;
  END;

  PERFORM public._mra_upsert(p_societe_id, 'PAYE', p_periode, v_paye,
    jsonb_build_object('source','OD-PAIE'));
  PERFORM public._mra_upsert(p_societe_id, 'CSG', p_periode, v_csg_sal + v_csg_pat,
    jsonb_build_object('csg_salarie', v_csg_sal, 'csg_patronal', v_csg_pat));
  PERFORM public._mra_upsert(p_societe_id, 'NSF', p_periode, v_nsf_sal + v_nsf_pat,
    jsonb_build_object('nsf_salarie', v_nsf_sal, 'nsf_patronal', v_nsf_pat));
  PERFORM public._mra_upsert(p_societe_id, 'PRGF', p_periode, v_prgf,
    jsonb_build_object('source','OD-PAIE','compte','4323'));
  PERFORM public._mra_upsert(p_societe_id, 'LEVY', p_periode, v_levy,
    jsonb_build_object('source','OD-PAIE','compte','4324','libelle','Training Levy HRDC 1%'));
  PERFORM public._mra_upsert(p_societe_id, 'TDS', p_periode, v_tds,
    jsonb_build_object('nb_factures', v_tds_nb));
  IF v_tva <> 0 THEN
    PERFORM public._mra_upsert(p_societe_id, 'TVA', p_periode, v_tva,
      jsonb_build_object('source','tva_mensuelle'));
  END IF;

  v_count := 7;
  RETURN v_count;
END;
$$;

DO $$ BEGIN
  RAISE NOTICE '[459] MRA Hub : PRGF (4323) + Training Levy (4324) ajoutés au calcul mensuel.';
END $$;
