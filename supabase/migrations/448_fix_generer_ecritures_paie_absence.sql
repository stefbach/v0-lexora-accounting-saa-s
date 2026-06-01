-- =============================================================================
-- Migration 448 — Fix generer_ecritures_paie : déduire montant_absence du 6411
-- =============================================================================
-- CONTEXTE / RÉGRESSION :
--   La version live de la RPC (mig 442) débite `6411 = salaire_base` SANS
--   soustraire `montant_absence`. Or la colonne GENERATED `salaire_net`
--   déduit l'absence :
--       salaire_net = salaire_brut - montant_absence - retenues_salariales
--   Donc pour TOUT bulletin avec une absence, l'écriture OD-PAIE ressort
--   déséquilibrée de `montant_absence` :
--       D 6411 (base)  >  C 4210 (net) + C retenues   d'exactement l'absence.
--
--   Diagnostic DDS (1826dde7-…) : 16 bulletins « positifs » cumulant
--   l'absence non comptabilisée (le reste des écarts venait de vieux
--   bulletins avec transport/petrol allowance, désormais proscrits côté
--   import et corrigés en données).
--
-- CORRECTIF :
--   Débiter le 6411 NET de l'absence :  6411 = salaire_base - montant_absence.
--   L'absence reste tracée dans le libellé. L'identité
--       D salaire = C net + C retenues
--   est restaurée pour les bulletins standards (sans allocations proscrites).
--   Le cas rare absence > base est géré (bascule en crédit).
--
--   ⚠️ Les composantes proscrites (transport_allowance, petrol_allowance)
--   ne sont volontairement PAS débitées (cf. mig 442 / 298). Si un import
--   legacy en contient, le bulletin peut rester déséquilibré : le passage
--   de régularisation data le traite séparément.
--
-- IMPACT :
--   • Bulletins sans absence : 6411 inchangé (base - 0 = base).
--   • Bulletins avec absence : 6411 diminue de montant_absence → équilibre.
--   • Patronales / retenues : inchangées.
--
-- À jouer après la migration pour rattraper l'historique :
--   SELECT public.generer_ecritures_paie(b.id)
--   FROM public.bulletins_paie b
--   WHERE COALESCE(b.montant_absence,0) > 0 AND COALESCE(b.comptabilise,false);
-- =============================================================================

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
  v_base_net     NUMERIC(12,2);   -- FIX 448 : salaire_base - montant_absence
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

  -- Nettoie les écritures BP-<uuid> existantes (idempotence)
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND (ref_folio = v_piece OR numero_piece = v_piece);

  -- 6411 Salaires de base — NET de l'absence (FIX 448).
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

  -- 6415 Primes et indemnités (special_allowance_1 + 2 + 3 uniquement)
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
$function$;

COMMENT ON FUNCTION public.generer_ecritures_paie(uuid) IS
  'Mig 448 : 6411 = salaire_base - montant_absence (corrige la régression mig 442 qui ignorait l absence et déséquilibrait OD-PAIE).';
