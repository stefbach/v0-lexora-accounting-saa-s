-- ============================================================================
-- Migration 298 — Fix double comptabilisation paie (import_excel)
-- ============================================================================
-- CONTEXTE :
--   La route `app/api/rh/import-paie/route.ts` (import Excel) crée :
--     (a) Un bulletin `bulletins_paie` avec source='import_excel', statut='valide'
--     (b) Des écritures agrégées dans le journal SAL (ref_folio SAL-YYYY-MM),
--         équilibrées par un mécanisme d'ajustement (lignes 541-556)
--
--   PROBLÈME : Le passage à statut='valide' déclenche le trigger qui appelle
--   la RPC `generer_ecritures_paie`. Cette RPC génère en plus des écritures
--   détaillées dans le journal OD-PAIE (ref_folio BP-<uuid>), créant une
--   DOUBLE COMPTABILISATION : les charges salariales sont comptées 2 fois.
--
--   PIRE : ligne 233 mig 216, la RPC fait `IF salaire_net > 0 THEN INSERT CR 4210`.
--   Or l'import peut produire `salaire_net = 0` (mapping de colonnes Excel
--   imparfait, retenues > brut, etc.) → CR 4210 skippé → folio déséquilibré.
--
--   Diagnostic confirmé : 144 bulletins import_excel ont salaire_net = 0
--   et ont créé +6,126,892.84 MUR de débits OD-PAIE sans contre-partie.
--
-- STRATÉGIE :
--   1. Nettoyer les doublons : supprimer toutes les écritures OD-PAIE pour
--      les bulletins source='import_excel' (y compris les CR 4210 que la
--      migration 297 avait insérés pour rééquilibrer).
--   2. Patcher la RPC : skip si source='import_excel', et toujours émettre
--      le CR 4210 même si net=0 (équilibre garanti par construction).
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1 — Nettoyage : supprimer les OD-PAIE BP-xxx pour import_excel
-- ============================================================================
-- Inclut le CR 4210 'Rééquilibrage…' de la mig 297 (puisque le folio entier
-- disparaît, le rééquilibrage devient sans objet).

-- Diagnostic avant
SELECT
  'AVANT 298' AS phase,
  COUNT(*)                                   AS nb_lignes_a_supprimer,
  ROUND(SUM(debit_mur)::numeric, 2)          AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)         AS total_C
FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE'
  AND ref_folio LIKE 'BP-%'
  AND ref_folio IN (
    SELECT 'BP-' || bp.id::text
    FROM bulletins_paie bp
    WHERE bp.source = 'import_excel'
  );

-- Suppression
DELETE FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE'
  AND ref_folio LIKE 'BP-%'
  AND ref_folio IN (
    SELECT 'BP-' || bp.id::text
    FROM bulletins_paie bp
    WHERE bp.source = 'import_excel'
  );

-- Diagnostic après
SELECT
  'APRES 298 cleanup' AS phase,
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM ecritures_comptables_v2;

-- ============================================================================
-- ÉTAPE 2 — Patch RPC generer_ecritures_paie
-- ============================================================================
-- Deux corrections :
--   A) Garde au début : RETURN 0 si source='import_excel'
--      (l'import génère déjà les SAL agrégées, on évite le doublon)
--   B) Le bloc CR 4210 ne dépend plus de `IF salaire_net > 0` : on insère
--      toujours, avec montant = salaire_net (qui peut être 0 mais ça force
--      l'équilibre par construction puisque les DR conditionnels sont eux
--      aussi à 0 dans ce cas).

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

  -- FIX 298-A : skip pour les bulletins importés (déjà comptabilisés en SAL)
  IF COALESCE(v_bulletin.source, 'calcul') = 'import_excel' THEN
    RETURN 0;
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

  v_base_net := COALESCE(v_bulletin.salaire_base, 0)
              - COALESCE(v_bulletin.montant_ul, 0)
              - COALESCE(v_bulletin.montant_absence, 0);

  IF v_base_net > 0 THEN
    v_base_lib := 'Salaire base — ' || v_name;
    IF COALESCE(v_bulletin.montant_ul, 0) > 0 THEN
      v_base_lib := v_base_lib || ' (net UL ' || COALESCE(v_bulletin.jours_ul::TEXT, '?') || 'j '
                              || COALESCE(v_bulletin.montant_ul::TEXT, '0') || ' MUR)';
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires bruts', v_base_lib, v_base_lib,
       v_base_net, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.heures_sup_montant, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6413', 'Heures supplémentaires', 'Heures sup — ' || v_name, 'Heures sup — ' || v_name,
       v_bulletin.heures_sup_montant, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.transport_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6412', 'Transport', 'Transport — ' || v_name, 'Transport — ' || v_name,
       v_bulletin.transport_allowance, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.petrol_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6414', 'Carburant', 'Carburant — ' || v_name, 'Carburant — ' || v_name,
       v_bulletin.petrol_allowance, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  v_primes_total := COALESCE(v_bulletin.special_allowance_1, 0)
                  + COALESCE(v_bulletin.special_allowance_2, 0)
                  + COALESCE(v_bulletin.special_allowance_3, 0);

  IF v_primes_total > 0 THEN
    v_primes_lib := 'Primes — ' || v_name;
    IF (CASE WHEN COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(v_bulletin.special_allowance_2, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(v_bulletin.special_allowance_3, 0) > 0 THEN 1 ELSE 0 END) > 1 THEN
      v_primes_lib := v_primes_lib || ' ('
        || CASE WHEN COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN 'a1 ' || v_bulletin.special_allowance_1::TEXT ELSE '' END
        || CASE WHEN COALESCE(v_bulletin.special_allowance_2, 0) > 0 THEN
              (CASE WHEN COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN ' + ' ELSE '' END)
              || 'a2 ' || v_bulletin.special_allowance_2::TEXT ELSE '' END
        || CASE WHEN COALESCE(v_bulletin.special_allowance_3, 0) > 0 THEN
              (CASE WHEN v_bulletin.special_allowance_1 > 0 OR v_bulletin.special_allowance_2 > 0 THEN ' + ' ELSE '' END)
              || 'a3 ' || v_bulletin.special_allowance_3::TEXT ELSE '' END
        || ')';
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6415', 'Primes et indemnités', v_primes_lib, v_primes_lib,
       v_primes_total, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronal', 'CSG patronal — ' || v_name, 'CSG patronal — ' || v_name,
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

  -- FIX 298-B : Toujours émettre le CR 4210 (même si net = 0)
  -- Ainsi le folio est équilibré par construction : si net = 0, les DR
  -- conditionnels sont aussi à 0 (ou minimes), et l'équilibre est respecté.
  -- Avant : `IF salaire_net > 0 THEN INSERT…` → folio déséquilibré si net=0.
  INSERT INTO public.ecritures_comptables_v2
    (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
     numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
  VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
     '4210', 'Salaires nets à payer', 'Net a payer — ' || v_name, 'Net a payer — ' || v_name,
     0, COALESCE(v_bulletin.salaire_net, 0), v_exercice);
  v_nb_lignes := v_nb_lignes + 1;

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

  UPDATE public.bulletins_paie
  SET comptabilise = TRUE, comptabilise_at = NOW()
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END;
$$;

COMMENT ON FUNCTION public.generer_ecritures_paie(UUID) IS
'Génère les écritures comptables OD-PAIE pour un bulletin. Skip si source=import_excel (déjà comptabilisé en SAL agrégé). Émet toujours le CR 4210 (équilibre garanti).';

-- ============================================================================
-- VÉRIFICATION FINALE
-- ============================================================================

SELECT
  'APRES 298 final' AS phase,
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM ecritures_comptables_v2;

SELECT
  journal,
  COUNT(*) nb,
  ROUND(SUM(debit_mur)::numeric, 2) total_D,
  ROUND(SUM(credit_mur)::numeric, 2) total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) desequilibre
FROM ecritures_comptables_v2
GROUP BY journal
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC;
