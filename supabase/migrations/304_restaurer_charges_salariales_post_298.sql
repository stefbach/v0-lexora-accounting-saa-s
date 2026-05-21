-- ============================================================================
-- Migration 304 — Restaurer les charges salariales perdues par la 298
-- ============================================================================
-- CONTEXTE :
--   La migration 298 a supprimé aveuglément TOUS les BP-xxx OD-PAIE des
--   bulletins source='import_excel', au motif que l'import crée déjà des
--   écritures SAL agrégées. ERREUR : la SAL n'est créée que par l'API
--   /api/rh/import-paie au moment de l'import. Pour les bulletins importés
--   via un autre flux ou avant que ce code SAL existe, il n'y a plus rien.
--
--   Diagnostic DDS : 144 bulletins import_excel, total brut 6.13M MUR,
--   mais charges 64xx visibles = 600k seulement → ~12M de charges salariales
--   perdues entre DDS + OCC.
--
-- STRATÉGIE :
--   1. Patch RPC : skip 'import_excel' SEULEMENT si une SAL existe déjà
--      pour la même (societe_id, période). Sinon on génère normalement.
--   2. Régénérer pour tous les bulletins import_excel actuellement sans
--      contre-partie comptable (ni SAL ni OD-PAIE BP-xxx).
--   3. Re-équilibrer les folios où salaire_net=0 → insert CR 4210 = somme
--      des DRs (comme la mig 297 avait fait).
-- ============================================================================

-- ── ÉTAPE 1 : Patcher la RPC ────────────────────────────────────────────────
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

  -- FIX 304 : Skip import_excel SEULEMENT si SAL existe pour cette période.
  -- Sinon le bulletin n'aurait aucune contre-partie comptable et les
  -- charges salariales disparaîtraient du P&L (cf bug post-mig 298).
  IF COALESCE(v_bulletin.source, 'calcul') = 'import_excel' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ecritures_comptables_v2
      WHERE societe_id = v_bulletin.societe_id
        AND journal    = 'SAL'
        AND TO_CHAR(date_ecriture, 'YYYY-MM') = TO_CHAR(v_bulletin.periode::DATE, 'YYYY-MM')
    ) INTO v_sal_exists;
    IF v_sal_exists THEN
      RETURN 0;
    END IF;
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
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6415', 'Primes et indemnités', v_primes_lib, v_primes_lib,
       v_primes_total, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Charges patronales (équilibrées en interne avec 4321-4324)
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronal', 'CSG patronal — ' || v_name, 'CSG patronal — ' || v_name,
       v_bulletin.csg_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6452', 'NSF patronal', 'NSF patronal — ' || v_name, 'NSF patronal — ' || v_name,
       v_bulletin.nsf_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6454', 'Training Levy HRDC (1%)', 'Training Levy — ' || v_name, 'Training Levy — ' || v_name,
       v_bulletin.training_levy, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6453', 'PRGF', 'PRGF — ' || v_name, 'PRGF — ' || v_name,
       v_bulletin.prgf, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- CR 4210 toujours émis (équilibre garanti même si salaire_net=0)
  INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
  VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
     '4210', 'Salaires nets à payer', 'Net a payer — ' || v_name, 'Net a payer — ' || v_name,
     0, COALESCE(v_bulletin.salaire_net, 0), v_exercice);
  v_nb_lignes := v_nb_lignes + 1;

  IF COALESCE(v_bulletin.csg_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4311', 'CSG salarié à verser', 'CSG salarie — ' || v_name, 'CSG salarie — ' || v_name,
       0, v_bulletin.csg_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4312', 'NSF salarié à verser', 'NSF salarie — ' || v_name, 'NSF salarie — ' || v_name,
       0, v_bulletin.nsf_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.paye, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4330', 'PAYE à reverser à la MRA', 'PAYE — ' || v_name, 'PAYE — ' || v_name,
       0, v_bulletin.paye, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4321', 'CSG patronal à verser', 'CSG patronal a payer — ' || v_name, 'CSG patronal a payer — ' || v_name,
       0, v_bulletin.csg_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4322', 'NSF patronal à verser', 'NSF patronal a payer — ' || v_name, 'NSF patronal a payer — ' || v_name,
       0, v_bulletin.nsf_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '4324', 'Training Levy HRDC à verser', 'Training Levy a payer — ' || v_name, 'Training Levy a payer — ' || v_name,
       0, v_bulletin.training_levy, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2 (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
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
'Genere les ecritures OD-PAIE pour un bulletin. Skip si source=import_excel ET une SAL agregee existe deja pour la meme periode (evite double compta sans perdre historique).';

-- ── ÉTAPE 2 : Régénérer pour les bulletins import_excel sans SAL ────────────
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
      AND NOT EXISTS (
        SELECT 1 FROM public.ecritures_comptables_v2 e
        WHERE e.societe_id = bp.societe_id
          AND e.journal    = 'SAL'
          AND TO_CHAR(e.date_ecriture, 'YYYY-MM') = TO_CHAR(bp.periode::DATE, 'YYYY-MM')
      )
  LOOP
    BEGIN
      PERFORM public.generer_ecritures_paie(v_bid);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'Bulletin % erreur: %', v_bid, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Migration 304 : % bulletins régénérés, % erreurs', v_count, v_errors;
END $$;

-- ── ÉTAPE 3 : Re-équilibrer les folios où salaire_net=0 (CR 4210 manquant) ──
-- Pour les folios où le CR 4210 = 0 mais les DRs sont > 0, ajouter une ligne
-- de rééquilibrage comme la mig 297. Approche : UPDATE le CR 4210 existant
-- à la valeur du déséquilibre (somme DR - somme CR autres que 4210).
-- Vu la contrainte unique sur (societe_id, ref_folio, numero_compte), on
-- UPDATE plutôt que d'insérer.

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

SELECT journal,
  ROUND(SUM(debit_mur)::numeric, 2)  total_D,
  ROUND(SUM(credit_mur)::numeric, 2) total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) desequilibre
FROM public.ecritures_comptables_v2
GROUP BY journal
ORDER BY journal;

-- Détail charges 64xx DDS (= ce qui apparaîtra dans P&L charges_perso)
SELECT numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM public.ecritures_comptables_v2
WHERE societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
  AND numero_compte LIKE '64%'
GROUP BY numero_compte
ORDER BY numero_compte;
