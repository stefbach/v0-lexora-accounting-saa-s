-- ============================================================================
-- Migration 216 — generer_ecritures_paie : agrège special_allowance_1/2/3
-- ============================================================================
--
-- Contexte : la migration 215 traite uniquement `special_allowance_1` sur 6415
-- mais ignore `special_allowance_2` et `special_allowance_3`. Ces deux
-- colonnes sont incluses dans `salaire_brut` (générée) et donc dans
-- `salaire_net` côté crédit (4210), mais sans contrepartie débit elles
-- créent un écart sur ref_folio = montant des allowances 2+3.
--
-- Cas concret DDS avril 2026 :
--   • Bulletin 000083 : special_allowance_2 = 200 → ignoré
--   • Bulletin 000339 : special_allowance_2 = 200 → ignoré
--   → Écart total OD-PAIE DDS avril 2026 = -400,00 MUR (crédit > débit)
--
-- Solution : agréger les trois colonnes en une seule écriture débit 6415.
-- À cause de la contrainte ux_ecritures_v2_ref_folio (societe_id, ref_folio,
-- numero_compte) on ne peut pas créer plusieurs lignes 6415 — l'agrégation
-- est obligatoire. Le libellé indique le détail si plusieurs allowances :
--   "Primes — <Nom>"                              (cas 1 seule allowance)
--   "Primes — <Nom> (a1 13820 + a2 200)"          (multi-allowances)
--
-- Idempotente : DELETE des écritures existantes pour le bulletin avant
-- régénération (logique déjà présente). Pour appliquer aux bulletins déjà
-- comptabilisés présentant un special_allowance_2/3, relancer la RPC :
--
--   SELECT b.id, generer_ecritures_paie(b.id)
--   FROM bulletins_paie b
--   WHERE b.comptabilise = TRUE
--     AND (COALESCE(b.special_allowance_2, 0) > 0
--       OR COALESCE(b.special_allowance_3, 0) > 0);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generer_ecritures_paie(
  p_bulletin_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_bulletin   RECORD;
  v_dossier_id UUID;
  v_nb_lignes  INTEGER := 0;
  v_journal    TEXT := 'OD-PAIE';
  v_piece      TEXT;
  v_periode    DATE;
  v_name       TEXT;
  v_exercice   TEXT;
  v_base_net   NUMERIC(12,2);
  v_base_lib   TEXT;
  v_primes_total NUMERIC(12,2);
  v_primes_lib   TEXT;
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

  SELECT d.id INTO v_dossier_id
  FROM public.dossiers d
  WHERE d.societe_id = v_bulletin.societe_id
  ORDER BY d.created_at DESC LIMIT 1;

  -- Idempotence
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND (ref_folio = v_piece OR numero_piece = v_piece);

  -- === DÉBITS (charges 6xxx) ===
  -- 6411 : salaire de base NET des retenues UL et absence (single-line par
  -- contrainte ux_ecritures_v2_ref_folio). Le libellé conserve la trace.
  v_base_net := COALESCE(v_bulletin.salaire_base, 0)
              - COALESCE(v_bulletin.montant_ul, 0)
              - COALESCE(v_bulletin.montant_absence, 0);

  IF v_base_net > 0 THEN
    v_base_lib := 'Salaire base — ' || v_name;
    IF COALESCE(v_bulletin.montant_ul, 0) > 0 THEN
      v_base_lib := v_base_lib
        || ' (net UL ' || COALESCE(v_bulletin.jours_ul::TEXT, '?') || 'j '
        || TO_CHAR(v_bulletin.montant_ul, 'FM999990.00') || ')';
    END IF;
    IF COALESCE(v_bulletin.montant_absence, 0) > 0 THEN
      v_base_lib := v_base_lib
        || ' (net absence ' || COALESCE(v_bulletin.jours_absence::TEXT, '?') || 'j '
        || TO_CHAR(v_bulletin.montant_absence, 'FM999990.00') || ')';
    END IF;

    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires et appointements bruts',
       v_base_lib, v_base_lib,
       v_base_net, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.transport_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6412', 'Transport allowance', 'Transport — ' || v_name, 'Transport — ' || v_name,
       v_bulletin.transport_allowance, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.petrol_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6413', 'Petrol allowance', 'Petrol — ' || v_name, 'Petrol — ' || v_name,
       v_bulletin.petrol_allowance, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.heures_sup_montant, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6414', 'Heures supplémentaires', 'Heures sup — ' || v_name, 'Heures sup — ' || v_name,
       v_bulletin.heures_sup_montant, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6415 : agrégation des trois special_allowance (contrainte d'unicité par
  -- compte/folio impose un seul INSERT). Libellé enrichi si > 1 allowance.
  v_primes_total := COALESCE(v_bulletin.special_allowance_1, 0)
                  + COALESCE(v_bulletin.special_allowance_2, 0)
                  + COALESCE(v_bulletin.special_allowance_3, 0);

  IF v_primes_total > 0 THEN
    v_primes_lib := 'Primes — ' || v_name;
    -- Si plusieurs allowances non-nulles, on liste le détail
    IF (CASE WHEN COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(v_bulletin.special_allowance_2, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(v_bulletin.special_allowance_3, 0) > 0 THEN 1 ELSE 0 END) > 1 THEN
      v_primes_lib := v_primes_lib || ' (';
      IF COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN
        v_primes_lib := v_primes_lib || 'a1 ' || TO_CHAR(v_bulletin.special_allowance_1, 'FM999990.00');
      END IF;
      IF COALESCE(v_bulletin.special_allowance_2, 0) > 0 THEN
        IF COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN
          v_primes_lib := v_primes_lib || ' + ';
        END IF;
        v_primes_lib := v_primes_lib || 'a2 ' || TO_CHAR(v_bulletin.special_allowance_2, 'FM999990.00');
      END IF;
      IF COALESCE(v_bulletin.special_allowance_3, 0) > 0 THEN
        IF COALESCE(v_bulletin.special_allowance_1, 0) > 0
          OR COALESCE(v_bulletin.special_allowance_2, 0) > 0 THEN
          v_primes_lib := v_primes_lib || ' + ';
        END IF;
        v_primes_lib := v_primes_lib || 'a3 ' || TO_CHAR(v_bulletin.special_allowance_3, 'FM999990.00');
      END IF;
      v_primes_lib := v_primes_lib || ')';
    END IF;

    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6415', 'Primes et gratifications',
       v_primes_lib, v_primes_lib,
       v_primes_total, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.eoy_bonus, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6416', '13e mois — EOY Bonus (provision)', '13eme mois — ' || v_name, '13eme mois — ' || v_name,
       v_bulletin.eoy_bonus, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── Charges patronales ─────────────────────────────────────────────────────
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronale', 'CSG patronal — ' || v_name, 'CSG patronal — ' || v_name,
       v_bulletin.csg_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6452', 'NSF patronal', 'NSF patronal — ' || v_name, 'NSF patronal — ' || v_name,
       v_bulletin.nsf_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6454', 'Training Levy HRDC (1%)', 'Training Levy — ' || v_name, 'Training Levy — ' || v_name,
       v_bulletin.training_levy, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6453', 'PRGF (Portable Retirement Gratuity Fund)', 'PRGF — ' || v_name, 'PRGF — ' || v_name,
       v_bulletin.prgf, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- === CRÉDITS (dettes 43xx / 42xx / 4330) — PCM 4-digits ===
  IF COALESCE(v_bulletin.salaire_net, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4210', 'Salaires nets à payer', 'Net a payer — ' || v_name, 'Net a payer — ' || v_name,
       0, v_bulletin.salaire_net, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.csg_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4311', 'CSG salarié à verser', 'CSG salarie — ' || v_name, 'CSG salarie — ' || v_name,
       0, v_bulletin.csg_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.nsf_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4312', 'NSF salarié à verser', 'NSF salarie — ' || v_name, 'NSF salarie — ' || v_name,
       0, v_bulletin.nsf_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.paye, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4330', 'PAYE à reverser à la MRA', 'PAYE — ' || v_name, 'PAYE — ' || v_name,
       0, v_bulletin.paye, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4321', 'CSG patronal à verser', 'CSG patronal a payer — ' || v_name, 'CSG patronal a payer — ' || v_name,
       0, v_bulletin.csg_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4322', 'NSF patronal à verser', 'NSF patronal a payer — ' || v_name, 'NSF patronal a payer — ' || v_name,
       0, v_bulletin.nsf_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4324', 'Training Levy HRDC à verser', 'Training Levy a payer — ' || v_name, 'Training Levy a payer — ' || v_name,
       0, v_bulletin.training_levy, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4323', 'PRGF à verser', 'PRGF a payer — ' || v_name, 'PRGF a payer — ' || v_name,
       0, v_bulletin.prgf, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Mark bulletin as comptabilise
  UPDATE public.bulletins_paie
  SET comptabilise = TRUE,
      date_comptabilisation = NOW(),
      nb_ecritures_generees = v_nb_lignes
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END $$;

COMMENT ON FUNCTION public.generer_ecritures_paie IS
  'Generate payroll journal entries for a bulletin — PCM 4-digits canonique '
  '(migration 199) + netting UL/absence sur 6411 (migration 215) '
  '+ agrégation special_allowance_1/2/3 sur 6415 (migration 216). '
  'Idempotent : DELETE des écritures existantes pour le bulletin avant régénération.';
