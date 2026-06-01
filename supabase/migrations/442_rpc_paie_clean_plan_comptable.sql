-- =============================================================================
-- Migration 442 — Réécriture generer_ecritures_paie (plan comptable propre)
-- =============================================================================
-- CONTEXTE :
--   Plan comptable réel Lexora pour les comptes de personnel :
--     6411 Salaires de base
--     6413 Heures supplémentaires
--     6415 Primes et indemnités
--     6416 Indemnités de préavis et licenciement (STC)
--     6451 CSG patronale (3%/6%)
--     6452 NSF patronal (2.5%)
--     6453 PRGF
--     6454 Training Levy (1%)
--     Contreparties : 4210 (net), 4311 CSG sal, 4312 NSF sal, 4330 PAYE,
--                     4321 CSG pat, 4322 NSF pat, 4323 PRGF, 4324 Levy
--
--   Comptes 6412 (Transport) et 6414 (Carburant) PROSCRITS : ne correspondent
--   à AUCUNE charge réelle dans Lexora (DDS/OCC). Les colonnes
--   transport_allowance et petrol_allowance des bulletins ne représentent pas
--   du transport/carburant — elles ont reçu par erreur des montants
--   d'electricity et prime_production via l'import Excel.
--
-- CORRECTIONS :
--   • RPC ne crée plus de lignes 6412 ni 6414.
--   • RPC crée une ligne 6416 si departure_notice > 0 (STC).
--   • RPC met 6411 = salaire_base SANS soustraire UL/absence (cohérent avec
--     la définition de salaire_net qui ne déduit pas UL).
--   • 6415 = special_allowance_1 + 2 + 3 uniquement (PAS transport ni petrol).
--   • RPC traite désormais TOUS les bulletins (suppression du skip
--     import_excel) puisque l'import a été corrigé pour ne plus utiliser
--     transport_allowance / petrol_allowance.
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
  v_primes_total NUMERIC(12,2);
BEGIN
  SELECT b.*, e.nom, e.prenom, e.code, e.societe_id
  INTO v_bulletin
  FROM public.bulletins_paie b
  JOIN public.employes e ON e.id = b.employe_id
  WHERE b.id = p_bulletin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bulletin % introuvable', p_bulletin_id;
  END IF;

  -- NOTE 442 : suppression du skip import_excel (mig 298). L'import Excel
  -- a été corrigé pour ne plus utiliser transport_allowance/petrol_allowance
  -- et la RPC fait maintenant les bonnes ventilations.

  v_piece    := 'BP-' || p_bulletin_id::TEXT;
  v_periode  := v_bulletin.periode::DATE;
  v_name     := v_bulletin.prenom || ' ' || v_bulletin.nom;
  v_exercice := TO_CHAR(v_periode, 'YYYY');

  SELECT d.id INTO v_dossier_id
  FROM public.dossiers d
  WHERE d.societe_id = v_bulletin.societe_id
  ORDER BY d.created_at DESC LIMIT 1;

  -- Nettoie les écritures BP-<uuid> existantes (idempotence)
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND (ref_folio = v_piece OR numero_piece = v_piece);

  -- 6411 Salaires de base (salaire_base brut, sans soustraction)
  IF COALESCE(v_bulletin.salaire_base, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires de base', 'Salaire base — ' || v_name, 'Salaire base — ' || v_name,
       v_bulletin.salaire_base, 0, v_exercice);
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

  -- 6415 Primes et indemnités (special_allowance_1 + 2 + 3 uniquement —
  -- PAS transport_allowance ni petrol_allowance qui sont proscrits)
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
    -- Régularisation négative (cas STC avec retenues) : on met en CRÉDIT 6415
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

  -- Charges patronales (débit 6451-6454)
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronale (3%/6%)', 'CSG patronal — ' || v_name, 'CSG patronal — ' || v_name,
       v_bulletin.csg_patronal, 0, v_exercice);
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

  -- 4210 Net à payer (toujours créé, même si 0, pour garantir l'équilibre)
  INSERT INTO public.ecritures_comptables_v2
    (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
     numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
  VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
     '4210', 'Salaires nets à payer', 'Net à payer — ' || v_name, 'Net à payer — ' || v_name,
     0, COALESCE(v_bulletin.salaire_net, 0), v_exercice);
  v_nb_lignes := v_nb_lignes + 1;

  -- Cotisations salariales (crédit 4311/4312/4330)
  IF COALESCE(v_bulletin.csg_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4311', 'CSG salarié à verser', 'CSG salarié — ' || v_name, 'CSG salarié — ' || v_name,
       0, v_bulletin.csg_salarie, v_exercice);
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
  IF COALESCE(v_bulletin.paye, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4330', 'PAYE à reverser à la MRA', 'PAYE — ' || v_name, 'PAYE — ' || v_name,
       0, v_bulletin.paye, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Charges patronales à verser (crédit 4321-4324)
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4321', 'CSG patronal à verser', 'CSG patronal à payer — ' || v_name, 'CSG patronal à payer — ' || v_name,
       0, v_bulletin.csg_patronal, v_exercice);
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

  UPDATE public.bulletins_paie
  SET comptabilise = TRUE, comptabilise_at = NOW()
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END;
$$;

COMMENT ON FUNCTION public.generer_ecritures_paie(UUID) IS
'Génère les écritures comptables OD-PAIE pour un bulletin. Plan comptable strict : 6411/6413/6415/6416/6451-54 en débit, 4210/4311/4312/4321-24/4330 en crédit. PAS de 6412 (transport) ni 6414 (carburant) — ces comptes ne représentent aucune charge réelle.';
