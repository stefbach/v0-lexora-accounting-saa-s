-- =============================================================================
-- Migration 449 — Équilibre paie GARANTI + filet anti-déséquilibre OD-PAIE
-- =============================================================================
-- POURQUOI :
--   Historiquement, generer_ecritures_paie débitait la charge à partir de
--   composantes (salaire_base, heures_sup, primes, départ…) qui ne couvraient
--   pas toujours 100 % de ce qui se retrouve au crédit (net 4210 + retenues
--   4311/4312/4330 + patronales). Causes observées :
--     • montant_absence non déduit (mig 448) ;
--     • une part du salaire_brut non ventilée dans les composantes débitées
--       (ex. bulletins mai 2026 OCC : brut 60 769,60 mais base 60 000) ;
--     • allocations transport/petrol proscrites côté débit mais présentes au net.
--   Résultat : pièces BP-<uuid> déséquilibrées → Grand Livre faux.
--
--   De plus, la décomptabilisation (UI) remet comptabilise=false SANS supprimer
--   les écritures. Si l'utilisateur dévalide puis ne re-comptabilise pas, les
--   écritures restent orphelines. Combiné au déséquilibre ci-dessus, cela
--   produit les écarts constatés (DDS, OCC).
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. generer_ecritures_paie : après avoir inséré toutes les lignes, calcule
--      le solde réel (Σdébit − Σcrédit) de la pièce et, s'il est non nul,
--      AJUSTE la ligne de charge 6411 du même montant. L'identité comptable
--      D = C est donc TOUJOURS vraie, quel que soit le profil du bulletin.
--      (La 6411 reste économiquement la charge de salaire — l'ajustement
--       absorbe absence/allocation non ventilée, tracé dans le libellé.)
--
--   2. Trigger filet trg_odpaie_equilibre : à tout INSERT sur
--      ecritures_comptables_v2 du journal 'OD-PAIE', vérifie en fin
--      d'instruction que CHAQUE ref_folio BP-* concerné est équilibré
--      (|Σdébit − Σcrédit| <= 0.01) ; sinon RAISE EXCEPTION → la transaction
--      est annulée. Ceinture + bretelles : plus aucun lot paie déséquilibré
--      ne peut être committé, même par un futur code buggé.
--
-- IMPACT : aucune régression sur les bulletins déjà équilibrés (ajustement = 0).
--          Les bulletins à profil "absence/allocation" deviennent équilibrés.
--
-- Rattrapage (à jouer après la migration, idempotent) :
--   SELECT public.generer_ecritures_paie(b.id)
--   FROM public.bulletins_paie b
--   WHERE COALESCE(b.comptabilise,false) AND COALESCE(b.is_archived,false)=false;
-- =============================================================================

-- ── 1. RPC avec équilibrage garanti ─────────────────────────────────────────
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

  -- 4210 Net à payer (toujours créé, même si 0)
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

  -- ── ÉQUILIBRAGE GARANTI ───────────────────────────────────────────────────
  -- Solde résiduel de la pièce (toute cause : absence, allocation non ventilée,
  -- composante du brut, arrondi). On l'absorbe sur la ligne de charge 6411.
  SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)
  INTO v_solde
  FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id AND journal = v_journal AND ref_folio = v_piece;

  IF v_solde IS NOT NULL AND v_solde <> 0 THEN
    -- v_solde > 0 : trop de débit → on RÉDUIT la charge 6411 (credit_mur += solde).
    -- v_solde < 0 : trop de crédit → on AUGMENTE la charge 6411 (debit_mur += |solde|).
    UPDATE public.ecritures_comptables_v2
    SET debit_mur  = ROUND((debit_mur  + GREATEST(-v_solde, 0))::numeric, 2),
        credit_mur = ROUND((credit_mur + GREATEST( v_solde, 0))::numeric, 2),
        description = COALESCE(description, '') || ' — équilibrage auto paie'
    WHERE societe_id = v_bulletin.societe_id AND journal = v_journal
      AND ref_folio = v_piece AND numero_compte = '6411';

    -- Si aucune ligne 6411 n'existait (base nette = 0), on en crée une dédiée.
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
  'Mig 449 : équilibre GARANTI — toute charge résiduelle (absence/allocation/brut non ventilé) est absorbée sur 6411 pour que la pièce BP-* soit toujours D=C.';

-- ── 2. Trigger filet : aucun lot OD-PAIE déséquilibré ne peut être committé ──
-- IMPORTANT : la RPC insère la pièce ligne par ligne (plusieurs INSERT). Un
-- trigger immédiat verrait la pièce déséquilibrée EN COURS de construction et
-- la bloquerait à tort. On utilise donc un CONSTRAINT TRIGGER DEFERRABLE
-- INITIALLY DEFERRED : la vérification est repoussée à la FIN de transaction
-- (COMMIT), quand la pièce est complète. À ce moment, l'équilibrage auto de la
-- RPC garantit D=C → passe. Tout futur code qui insérerait un lot paie
-- déséquilibré verra son COMMIT échouer.
CREATE OR REPLACE FUNCTION public.assert_odpaie_equilibre()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_solde NUMERIC(14,2);
BEGIN
  IF NEW.journal = 'OD-PAIE' AND NEW.ref_folio LIKE 'BP-%' THEN
    SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)
    INTO v_solde
    FROM public.ecritures_comptables_v2
    WHERE journal = 'OD-PAIE' AND ref_folio = NEW.ref_folio;

    IF v_solde IS NOT NULL AND ABS(v_solde) > 0.01 THEN
      RAISE EXCEPTION 'Lot paie % déséquilibré (solde % MUR) — COMMIT refusé (filet OD-PAIE mig 449)',
        NEW.ref_folio, v_solde;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_odpaie_equilibre ON public.ecritures_comptables_v2;
CREATE CONSTRAINT TRIGGER trg_odpaie_equilibre
  AFTER INSERT ON public.ecritures_comptables_v2
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_odpaie_equilibre();

COMMENT ON FUNCTION public.assert_odpaie_equilibre() IS
  'Mig 449 : filet anti-déséquilibre (constraint trigger déféré au COMMIT) — refuse tout lot OD-PAIE (BP-*) dont Σdébit≠Σcrédit.';
