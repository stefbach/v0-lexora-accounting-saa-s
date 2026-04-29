-- ============================================================================
-- Migration 214 — generer_ecritures_paie : gérer montant_ul et montant_absence
-- ============================================================================
--
-- Contexte : avant ce patch, la RPC `generer_ecritures_paie` (dernière version
-- en migration 199) débitait `salaire_base` complet sur 6411 sans contrepartie
-- pour les retenues d'absence (`montant_absence`) et de congé sans solde
-- (`montant_ul`). Conséquence : sur tout bulletin présentant l'une de ces
-- déductions, le journal OD-PAIE était déséquilibré du montant correspondant.
--
-- Cas concret (avril 2026, Obesity Care Clinic, employé 000004) :
--   salaire_base = 31 245    salaire_brut = 31 445   salaire_net = 29 952,31
--   csg_salarie = 458   nsf_salarie = 286   paye = 0
--   montant_ul = 748,69 (0,5 jour de congé sans solde)
--   → écart débit/crédit = 748,69 MUR sur le seul ref_folio BP-<bulletin_id>.
--
-- Patch : ajouter deux INSERT en CRÉDIT sur 6411 quand `montant_ul > 0` ou
-- `montant_absence > 0`. Cela réduit la charge salaire à hauteur du brut
-- effectivement dû (le compte 6411 conserve la trace : débit base puis crédit
-- retenue, libellé explicite). Aligne la RPC avec l'équation comptable :
--
--   6411 (D)  = salaire_base - montant_ul - montant_absence
--             = salaire_brut_payé - autres_éléments
--             = 4210 (Net) + 4311 (CSG sal) + 4312 (NSF sal) + 4330 (PAYE)
--               + montant_ul + montant_absence  ⟹  équilibre au centime près.
--
-- Idempotente : la RPC fait déjà DELETE des écritures existantes pour le
-- bulletin avant de les régénérer. Pour appliquer aux bulletins déjà
-- comptabilisés et déséquilibrés, relancer la RPC sur leur id.
--
-- BACKFILL :
--   SELECT b.id, generer_ecritures_paie(b.id)
--   FROM bulletins_paie b
--   WHERE b.comptabilise = TRUE
--     AND (COALESCE(b.montant_ul, 0) > 0 OR COALESCE(b.montant_absence, 0) > 0);
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
  IF COALESCE(v_bulletin.salaire_base, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires et appointements bruts', 'Salaire base — ' || v_name, 'Salaire base — ' || v_name,
       v_bulletin.salaire_base, 0, v_exercice);
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

  IF COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6415', 'Primes et gratifications', 'Primes — ' || v_name, 'Primes — ' || v_name,
       v_bulletin.special_allowance_1, 0, v_exercice);
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

  -- ── NEW : Retenues sur 6411 (UL + absences non rémunérées) ────────────────
  -- Crédit sur 6411 : réduit la charge salaire pour les jours non travaillés
  -- non rémunérés. Conserve la traçabilité (débit base brut + crédit retenue
  -- avec libellé explicite). Sans ces deux blocs, le ref_folio BP-<id> est
  -- déséquilibré du montant ul + absence.
  IF COALESCE(v_bulletin.montant_ul, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires et appointements bruts',
       'Retenue UL (' || COALESCE(v_bulletin.jours_ul::TEXT, '?') || 'j) — ' || v_name,
       'Retenue congé sans solde — ' || v_name,
       0, v_bulletin.montant_ul, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.montant_absence, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires et appointements bruts',
       'Retenue absence (' || COALESCE(v_bulletin.jours_absence::TEXT, '?') || 'j) — ' || v_name,
       'Retenue absence non rémunérée — ' || v_name,
       0, v_bulletin.montant_absence, v_exercice);
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
  '(migration 199) + retenues UL/absence sur 6411 (migration 214). '
  'Idempotent : DELETE des écritures existantes pour le bulletin avant régénération.';
