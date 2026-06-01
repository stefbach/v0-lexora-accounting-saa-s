-- =====================================================================
-- Migration 456 — generer_ecritures_paie : comptabilisation EOY exacte
-- =====================================================================
-- Contexte : la fonction generer_ecritures_paie (mig 448/449) ne débitait
-- PAS explicitement le 13ème mois (eoy_bonus) ni les cotisations bonus
-- (csg_bonus, paye_bonus, csg_patronal_bonus). Le "filet d'équilibrage"
-- (mig 449) maintenait l'équilibre en absorbant le résidu sur le 6411,
-- mais :
--   • le 13ème mois pouvait atterrir sur le 6411 (Salaires de base) au
--     lieu du 6416 (13ème mois) selon les sociétés ;
--   • les retenues bonus (csg_bonus/paye_bonus) n'étaient pas créditées
--     sur 4311/4330 ;
--   • la CSG patronale bonus n'était pas portée sur 6451/4321.
--
-- Ce correctif rend la comptabilisation du 13ème mois EXACTE (pas juste
-- équilibrée) pour TOUTES les sociétés :
--   • DÉBIT eoy_bonus → 6416 « 13ème mois — EOY Bonus »
--   • CRÉDIT (csg_salarie + csg_bonus) → 4311
--   • CRÉDIT (paye + paye_bonus) → 4330
--   • DÉBIT (csg_patronal + csg_patronal_bonus) → 6451 / CRÉDIT → 4321
--   • Le filet d'équilibrage (mig 449) est CONSERVÉ en sécurité.
--
-- Idempotent : la fonction supprime d'abord ses propres écritures
-- (ref_folio='BP-<id>') avant de réinsérer. Réversible via re-comptabilisation.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.generer_ecritures_paie(p_bulletin_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_bulletin     RECORD;
  v_dossier_id   UUID;
  v_nb_lignes    INTEGER := 0;
  v_journal      TEXT := 'OD-PAIE';
  v_piece        TEXT;
  v_periode      DATE;
  v_name         TEXT;
  v_exercice     TEXT;
  v_primes_total NUMERIC(12,2);
  v_base_net     NUMERIC(12,2);
  v_solde        NUMERIC(12,2);
  -- Cotisations agrégées (standard + bonus 13ème mois) — mig 456
  v_csg_sal      NUMERIC(12,2);
  v_paye_sal     NUMERIC(12,2);
  v_csg_pat      NUMERIC(12,2);
BEGIN
  SELECT b.*, e.nom, e.prenom, e.code, e.societe_id
  INTO v_bulletin
  FROM public.bulletins_paie b
  JOIN public.employes e ON e.id = b.employe_id
  WHERE b.id = p_bulletin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bulletin % introuvable', p_bulletin_id;
  END IF;

  v_piece    := 'BP-' || p_bulletin_id::TEXT;
  v_periode  := v_bulletin.periode::DATE;
  v_name     := v_bulletin.prenom || ' ' || v_bulletin.nom;
  v_exercice := TO_CHAR(v_periode, 'YYYY');

  -- Cotisations agrégées (mig 456) : standard + part bonus du 13ème mois.
  v_csg_sal  := COALESCE(v_bulletin.csg_salarie, 0)   + COALESCE(v_bulletin.csg_bonus, 0);
  v_paye_sal := COALESCE(v_bulletin.paye, 0)          + COALESCE(v_bulletin.paye_bonus, 0);
  v_csg_pat  := COALESCE(v_bulletin.csg_patronal, 0)  + COALESCE(v_bulletin.csg_patronal_bonus, 0);

  SELECT d.id INTO v_dossier_id
  FROM public.dossiers d
  WHERE d.societe_id = v_bulletin.societe_id
  ORDER BY d.created_at DESC LIMIT 1;

  -- Nettoie les écritures BP-<uuid> existantes (idempotence)
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND (ref_folio = v_piece OR numero_piece = v_piece);

  -- 6411 Salaires de base — NET de l'absence (mig 448).
  v_base_net := COALESCE(v_bulletin.salaire_base, 0) - COALESCE(v_bulletin.montant_absence, 0);
  IF v_base_net <> 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires de base',
       'Salaire base — ' || v_name ||
         CASE WHEN COALESCE(v_bulletin.montant_absence, 0) > 0
              THEN ' (absence ' || TO_CHAR(v_bulletin.montant_absence, 'FM999990.00') || ' MUR déduite)'
              ELSE '' END,
       'Salaire base — ' || v_name,
       GREATEST(v_base_net, 0), GREATEST(-v_base_net, 0), v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6413 Heures supplémentaires
  IF COALESCE(v_bulletin.heures_sup_montant, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6413', 'Heures supplémentaires', 'Heures sup — ' || v_name, 'Heures sup — ' || v_name,
       v_bulletin.heures_sup_montant, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6415 Primes et indemnités (special_allowance_1 + 2 + 3)
  v_primes_total := COALESCE(v_bulletin.special_allowance_1, 0)
                  + COALESCE(v_bulletin.special_allowance_2, 0)
                  + COALESCE(v_bulletin.special_allowance_3, 0);
  IF v_primes_total > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6415', 'Primes et indemnités', 'Primes — ' || v_name, 'Primes — ' || v_name,
       v_primes_total, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  ELSIF v_primes_total < 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6415', 'Primes et indemnités', 'Régul primes — ' || v_name, 'Régul primes — ' || v_name,
       0, -v_primes_total, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6416 Indemnités de préavis et licenciement (STC)
  IF COALESCE(v_bulletin.departure_notice, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6416', 'Indemnités de préavis et licenciement',
       'Préavis STC — ' || v_name, 'Préavis STC — ' || v_name,
       v_bulletin.departure_notice, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6416 13ème mois — EOY Bonus (mig 456) : débit explicite du brut EOY.
  IF COALESCE(v_bulletin.eoy_bonus, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6416', '13ème mois — EOY Bonus',
       '13ème mois — ' || v_name, '13ème mois (EOY Bonus) — ' || v_name,
       v_bulletin.eoy_bonus, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Charges patronales (débit 6451-6454)
  -- 6451 CSG patronale = standard + bonus 13ème mois (mig 456)
  IF v_csg_pat > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronale (3%/6%)', 'CSG patronal — ' || v_name, 'CSG patronal — ' || v_name,
       v_csg_pat, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6452', 'NSF patronal (2.5%)', 'NSF patronal — ' || v_name, 'NSF patronal — ' || v_name,
       v_bulletin.nsf_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6454', 'Training Levy (1%)', 'Training Levy — ' || v_name, 'Training Levy — ' || v_name,
       v_bulletin.training_levy, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6453', 'PRGF', 'PRGF — ' || v_name, 'PRGF — ' || v_name,
       v_bulletin.prgf, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 4210 Net à payer (toujours créé, même si 0)
  INSERT INTO public.ecritures_comptables_v2
    (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
     numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
  VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
     '4210', 'Salaires nets à payer', 'Net à payer — ' || v_name, 'Net à payer — ' || v_name,
     0, COALESCE(v_bulletin.salaire_net, 0), v_exercice);
  v_nb_lignes := v_nb_lignes + 1;

  -- Cotisations salariales (crédit 4311/4312/4330) — agrégées avec bonus (mig 456)
  IF v_csg_sal > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4311', 'CSG salarié à verser', 'CSG salarié — ' || v_name, 'CSG salarié — ' || v_name,
       0, v_csg_sal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4312', 'NSF salarié à verser', 'NSF salarié — ' || v_name, 'NSF salarié — ' || v_name,
       0, v_bulletin.nsf_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF v_paye_sal > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4330', 'PAYE à reverser à la MRA', 'PAYE — ' || v_name, 'PAYE — ' || v_name,
       0, v_paye_sal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Charges patronales à verser (crédit 4321-4324)
  -- 4321 CSG patronal à verser = standard + bonus 13ème mois (mig 456)
  IF v_csg_pat > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4321', 'CSG patronal à verser', 'CSG patronal à payer — ' || v_name, 'CSG patronal à payer — ' || v_name,
       0, v_csg_pat, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4322', 'NSF patronal à verser', 'NSF patronal à payer — ' || v_name, 'NSF patronal à payer — ' || v_name,
       0, v_bulletin.nsf_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4324', 'Training Levy à verser', 'Training Levy à payer — ' || v_name, 'Training Levy à payer — ' || v_name,
       0, v_bulletin.training_levy, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4323', 'PRGF à verser', 'PRGF à payer — ' || v_name, 'PRGF à payer — ' || v_name,
       0, v_bulletin.prgf, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── ÉQUILIBRAGE GARANTI (mig 449, conservé) ───────────────────────────────
  -- Solde résiduel de la pièce (arrondi, composante non ventilée). On l'absorbe
  -- sur la ligne de charge 6411. Avec le débit EOY explicite (mig 456), ce
  -- résidu doit désormais être nul ou un simple arrondi.
  SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)
  INTO v_solde
  FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id AND journal = v_journal AND ref_folio = v_piece;

  IF v_solde IS NOT NULL AND v_solde <> 0 THEN
    UPDATE public.ecritures_comptables_v2
    SET debit_mur  = ROUND((debit_mur  + GREATEST(-v_solde, 0))::numeric, 2),
        credit_mur = ROUND((credit_mur + GREATEST( v_solde, 0))::numeric, 2),
        description = COALESCE(description, '') || ' — équilibrage auto paie'
    WHERE societe_id = v_bulletin.societe_id AND journal = v_journal
      AND ref_folio = v_piece AND numero_compte = '6411';

    IF NOT FOUND THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
         numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
      VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
         '6411', 'Salaires de base', 'Équilibrage auto paie — ' || v_name, 'Équilibrage auto paie — ' || v_name,
         GREATEST(-v_solde, 0), GREATEST(v_solde, 0), v_exercice);
      v_nb_lignes := v_nb_lignes + 1;
    END IF;
  END IF;

  UPDATE public.bulletins_paie
  SET comptabilise = TRUE, comptabilise_at = NOW()
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END;
$function$;

COMMENT ON FUNCTION public.generer_ecritures_paie(uuid) IS
  'mig 456 : comptabilisation paie + 13ème mois EXACTE (eoy_bonus → 6416, csg_bonus/paye_bonus/csg_patronal_bonus agrégés sur 4311/4330/6451/4321) + filet d''équilibrage garanti. Idempotent (DELETE BP-<id> avant insert).';

DO $$ BEGIN
  RAISE NOTICE '[456] generer_ecritures_paie : 13ème mois (EOY) débité au 6416 + cotisations bonus ventilées. Scalable toutes sociétés.';
END $$;
