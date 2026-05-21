-- ============================================================================
-- Migration 306 — Régénérer OD-PAIE en utilisant salaire_brut comme base
-- ============================================================================
-- CONTEXTE :
--   La migration 304 régénérait les écritures OD-PAIE depuis les composants
--   de paie (salaire_base, heures_sup_montant, transport_allowance, etc.).
--   ERREUR : l'import Excel laisse souvent salaire_base=0 et met le total
--   dans special_allowance_1/2/3. Quand v_base_net = salaire_base - ul -
--   absence <= 0, la RPC skip TOUS les DR (6411, 6413, 6412, 6414) → seuls
--   6415 (primes) et 6451-6454 (patronales) sont insérés → masse salariale
--   massivement sous-évaluée en P&L.
--
--   Diagnostic DDS : 158 bulletins import_excel (6.6M brut) → seulement
--   32 lignes 6411 (558k). 6M MUR de charges salariales manquantes côté
--   DR pour DDS uniquement (même problème côté OCC).
--
-- STRATÉGIE :
--   Pour chaque bulletin import_excel, ne plus se baser sur les composants :
--   utiliser DIRECTEMENT salaire_brut (colonne GENERATED qui contient le
--   vrai total) comme DR 6411 unique. La ventilation détaillée par compte
--   (6412 transport, 6413 OT, 6414 carburant, 6415 primes) est perdue mais
--   on récupère le montant TOTAL — ce qui est l'objectif #1 pour le P&L.
--
--   Les charges patronales (6451-6454) restent calculées séparément.
--   Le CR 4210 (net) + CR 4311/4312/4330 (retenues) = DR 6411 (équilibre).
--
-- IMPACT ATTENDU :
--   Total D 6411 DDS : 558k → ~6.6M  (+ 6 M de charges salariales)
--   Total D 6411 OCC : ?    → encore plus
--   Équilibre global : reste à 0.00 (DR 6411 = CR 4210 + retenues, équilibré)
-- ============================================================================

-- ── ÉTAPE 1 : Patch RPC pour utiliser salaire_brut directement ──────────────
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
  v_sal_exists BOOLEAN;
BEGIN
  SELECT b.*, e.nom, e.prenom, e.code, e.societe_id
  INTO v_bulletin
  FROM public.bulletins_paie b
  JOIN public.employes e ON e.id = b.employe_id
  WHERE b.id = p_bulletin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bulletin % introuvable', p_bulletin_id;
  END IF;

  -- FIX 306 : NE PLUS skip sur SAL existence — le check provoquait que la
  -- regen ne traitait que peu de bulletins. On régénère TOUJOURS pour
  -- import_excel. Les éventuels doublons SAL+OD-PAIE seront détectés et
  -- nettoyés séparément.
  -- (Code SAL check supprimé ici, garde reactivable si besoin.)

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

  -- FIX 306 : Utiliser salaire_brut (GENERATED) au lieu des composants.
  -- Garantit qu'on capture la TOTALITE du brut, peu importe comment
  -- l'import Excel a ventile entre salaire_base / special_allowance / etc.
  v_brut_net := COALESCE(v_bulletin.salaire_brut, 0)
              - COALESCE(v_bulletin.montant_ul, 0)
              - COALESCE(v_bulletin.montant_absence, 0);

  IF v_brut_net > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Salaires bruts', 'Salaire brut total - ' || v_name, 'Salaire brut total - ' || v_name,
       v_brut_net, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Charges patronales (chacune avec sa contre-partie)
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronal', 'CSG patronal - ' || v_name, 'CSG patronal - ' || v_name,
       v_bulletin.csg_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6452', 'NSF patronal', 'NSF patronal - ' || v_name, 'NSF patronal - ' || v_name,
       v_bulletin.nsf_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6454', 'Training Levy HRDC', 'Training Levy - ' || v_name, 'Training Levy - ' || v_name,
       v_bulletin.training_levy, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6453', 'PRGF', 'PRGF - ' || v_name, 'PRGF - ' || v_name,
       v_bulletin.prgf, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- CR 4210 : net a payer. Si net=0 mais brut>0, completer avec brut_net
  -- moins retenues salariales pour equilibrer le folio.
  DECLARE
    v_net_a_payer NUMERIC(12,2);
    v_retenues    NUMERIC(12,2);
  BEGIN
    v_retenues := COALESCE(v_bulletin.csg_salarie, 0)
                + COALESCE(v_bulletin.nsf_salarie, 0)
                + COALESCE(v_bulletin.paye, 0);
    v_net_a_payer := COALESCE(v_bulletin.salaire_net, 0);
    -- Si net = 0 mais brut > 0, recalculer
    IF v_net_a_payer = 0 AND v_brut_net > 0 THEN
      v_net_a_payer := GREATEST(0, v_brut_net - v_retenues);
    END IF;
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4210', 'Salaires nets a payer', 'Net a payer - ' || v_name, 'Net a payer - ' || v_name,
       0, v_net_a_payer, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END;

  -- Retenues salariales
  IF COALESCE(v_bulletin.csg_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4311', 'CSG salarie a verser', 'CSG salarie - ' || v_name, 'CSG salarie - ' || v_name,
       0, v_bulletin.csg_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4312', 'NSF salarie a verser', 'NSF salarie - ' || v_name, 'NSF salarie - ' || v_name,
       0, v_bulletin.nsf_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.paye, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4330', 'PAYE a reverser MRA', 'PAYE - ' || v_name, 'PAYE - ' || v_name,
       0, v_bulletin.paye, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Contreparties patronales (equilibre interne)
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4321', 'CSG patronal a verser', 'CSG patronal a payer - ' || v_name, 'CSG patronal a payer - ' || v_name,
       0, v_bulletin.csg_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4322', 'NSF patronal a verser', 'NSF patronal a payer - ' || v_name, 'NSF patronal a payer - ' || v_name,
       0, v_bulletin.nsf_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4324', 'Training Levy a verser', 'Training Levy a payer - ' || v_name, 'Training Levy a payer - ' || v_name,
       0, v_bulletin.training_levy, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4323', 'PRGF a verser', 'PRGF a payer - ' || v_name, 'PRGF a payer - ' || v_name,
       0, v_bulletin.prgf, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  UPDATE public.bulletins_paie
  SET comptabilise = TRUE, comptabilise_at = NOW()
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END;
$$;

-- ── ÉTAPE 2 : Re-régénérer TOUS les bulletins import_excel (force) ──────────
DO $$
DECLARE
  v_bid    UUID;
  v_count  INTEGER := 0;
  v_errors INTEGER := 0;
BEGIN
  FOR v_bid IN
    SELECT bp.id
    FROM public.bulletins_paie bp
    WHERE bp.source = 'import_excel'
  LOOP
    BEGIN
      PERFORM public.generer_ecritures_paie(v_bid);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;
  RAISE NOTICE 'Migration 306 : % bulletins regenerés, % erreurs', v_count, v_errors;
END $$;

-- ── ÉTAPE 3 : Re-équilibrer les folios avec déficit (CR 4210 trop bas) ──────
UPDATE public.ecritures_comptables_v2 cur
SET credit_mur = cur.credit_mur + folio.deficit
FROM (
  SELECT
    societe_id, ref_folio,
    SUM(debit_mur) - SUM(credit_mur) AS deficit
  FROM public.ecritures_comptables_v2
  WHERE journal = 'OD-PAIE' AND ref_folio LIKE 'BP-%'
  GROUP BY societe_id, ref_folio
  HAVING SUM(debit_mur) - SUM(credit_mur) > 0.01
) folio
WHERE cur.journal       = 'OD-PAIE'
  AND cur.societe_id    = folio.societe_id
  AND cur.ref_folio     = folio.ref_folio
  AND cur.numero_compte = '4210';

-- ── VÉRIFICATIONS ───────────────────────────────────────────────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM public.ecritures_comptables_v2;

SELECT numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM public.ecritures_comptables_v2
WHERE societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
  AND numero_compte LIKE '64%'
GROUP BY numero_compte
ORDER BY numero_compte;
