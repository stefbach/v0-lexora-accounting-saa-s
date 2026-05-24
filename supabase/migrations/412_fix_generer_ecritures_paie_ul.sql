-- =============================================================================
-- Migration 412 — Corriger v_brut_net dans generer_ecritures_paie (UL non déduit)
-- =============================================================================
-- CONTEXTE :
--   La mig 306 calcule
--     v_brut_net := salaire_brut - montant_ul - montant_absence
--   et insère ce montant en débit du 6411.
--
--   Or la colonne GENERATED bulletins_paie.salaire_net est définie comme
--     net = brut - absence - retenues_salariales      (UL non déduit)
--
--   Donc l'identité comptable
--     D 6411 = C 4210 (net) + C retenues (4311/4312/4330)
--   est violée à hauteur exacte de montant_ul. Le journal OD-PAIE
--   ressort déséquilibré pour CHAQUE bulletin ayant montant_ul > 0.
--
--   Diagnostic Obesity Care Clinic : 4 bulletins fautifs (Sheetal SEKELY,
--   Marie Alicia DESIRE x2, Marie PIERRE) cumulant -10 361.89 MUR d'écart.
--
-- STRATÉGIE :
--   Retirer le `- montant_ul` du calcul de v_brut_net. Le montant UL et
--   l'absence restent tracés dans le libellé pour audit. L'identité
--   D 6411 = C net + C retenues est restaurée.
--
-- IMPACT :
--   • Pour les bulletins sans UL : aucun changement (v_brut_net inchangé).
--   • Pour les bulletins avec UL : v_brut_net augmente de montant_ul,
--     le journal OD-PAIE redevient équilibré.
--   • Patronales (6451-6454 / 4321-4324) inchangées (équilibrées en interne).
--
-- À jouer après la migration : re-régénérer les bulletins concernés via
--   SELECT public.generer_ecritures_paie(b.id) FROM bulletins_paie b
--   WHERE montant_ul > 0;
-- =============================================================================

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
  v_brut_net   NUMERIC(12,2);
  v_base_lib   TEXT;
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

  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND (ref_folio = v_piece OR numero_piece = v_piece);

  -- FIX 412 : NE PLUS soustraire montant_ul. La colonne salaire_net du
  -- bulletin ne déduit pas UL → la déduire ici cassait l'identité
  -- D 6411 = C 4210 + C retenues. On garde l'absence (cohérent avec net).
  v_brut_net := COALESCE(v_bulletin.salaire_brut, 0)
              - COALESCE(v_bulletin.montant_absence, 0);

  v_base_lib := 'Salaire brut total - ' || v_name;
  IF COALESCE(v_bulletin.montant_ul, 0) > 0 THEN
    v_base_lib := v_base_lib || ' (UL ' || COALESCE(v_bulletin.jours_ul::TEXT, '?') || 'j '
                             || TO_CHAR(v_bulletin.montant_ul, 'FM999990.00') || ' MUR — non déduit)';
  END IF;
  IF COALESCE(v_bulletin.montant_absence, 0) > 0 THEN
    v_base_lib := v_base_lib || ' (absence ' || COALESCE(v_bulletin.jours_absence::TEXT, '?') || 'j '
                             || TO_CHAR(v_bulletin.montant_absence, 'FM999990.00') || ' MUR)';
  END IF;

  IF v_brut_net > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires bruts', v_base_lib, v_base_lib,
       v_brut_net, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Charges patronales (équilibrées intrinsèquement : D 6451-54 = C 4321-24)
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronal', 'CSG patronal - ' || v_name, 'CSG patronal - ' || v_name,
       v_bulletin.csg_patronal, 0, v_exercice),
      (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4321', 'CSG patronal a payer', 'CSG patronal a payer - ' || v_name, 'CSG patronal a payer - ' || v_name,
       0, v_bulletin.csg_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 2;
  END IF;

  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6452', 'NSF patronal', 'NSF patronal - ' || v_name, 'NSF patronal - ' || v_name,
       v_bulletin.nsf_patronal, 0, v_exercice),
      (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4322', 'NSF patronal a payer', 'NSF patronal a payer - ' || v_name, 'NSF patronal a payer - ' || v_name,
       0, v_bulletin.nsf_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 2;
  END IF;

  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6453', 'PRGF', 'PRGF - ' || v_name, 'PRGF - ' || v_name,
       v_bulletin.prgf, 0, v_exercice),
      (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4323', 'PRGF a payer', 'PRGF a payer - ' || v_name, 'PRGF a payer - ' || v_name,
       0, v_bulletin.prgf, v_exercice);
    v_nb_lignes := v_nb_lignes + 2;
  END IF;

  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6454', 'Training Levy', 'Training Levy - ' || v_name, 'Training Levy - ' || v_name,
       v_bulletin.training_levy, 0, v_exercice),
      (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4324', 'Training Levy a payer', 'Training Levy a payer - ' || v_name, 'Training Levy a payer - ' || v_name,
       0, v_bulletin.training_levy, v_exercice);
    v_nb_lignes := v_nb_lignes + 2;
  END IF;

  -- Retenues salariales (côté crédit)
  IF COALESCE(v_bulletin.csg_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4311', 'CSG salarie', 'CSG salarie - ' || v_name, 'CSG salarie - ' || v_name,
       0, v_bulletin.csg_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.nsf_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4312', 'NSF salarie', 'NSF salarie - ' || v_name, 'NSF salarie - ' || v_name,
       0, v_bulletin.nsf_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.paye, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4330', 'PAYE', 'PAYE - ' || v_name, 'PAYE - ' || v_name,
       0, v_bulletin.paye, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Net à payer (côté crédit) — utilise la colonne GENERATED salaire_net
  IF COALESCE(v_bulletin.salaire_net, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4210', 'Net a payer', 'Net a payer - ' || v_name, 'Net a payer - ' || v_name,
       0, v_bulletin.salaire_net, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Marqueur de comptabilisation
  UPDATE public.bulletins_paie
  SET comptabilise = TRUE, comptabilise_at = NOW()
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END;
$$;

COMMENT ON FUNCTION public.generer_ecritures_paie(UUID) IS
  'Mig 412 : D 6411 = brut - absence (UL n est PAS deduit pour respecter l identite D = C 4210 + retenues).';
