-- ============================================================================
-- Migration 225 — RPC clôture exercice (RAN auto + affectation résultat)
-- ============================================================================
--
-- Findings audit états financiers P0 :
--   • RAN (Report À Nouveau) jamais généré comme écriture comptable.
--     Il est calculé en mémoire par le grand-livre à chaque requête, mais
--     aucune écriture journal='AN' n'est persistée. Si l'exercice
--     précédent est ré-ouvert/modifié, le solde "en mémoire" change
--     rétroactivement.
--   • Compte 1200 (Résultat de l'exercice) cumule indéfiniment sans
--     affectation 1200 → 11x/119 à l'ouverture du nouvel exercice.
--
-- Cette migration crée RPC `cloture_exercice(societe_id, exercice)` qui :
--   1. Calcule le résultat de l'exercice = Σ classe 7 − Σ classe 6
--   2. Insère écritures de clôture sur la dernière date de l'exercice :
--        Pour chaque compte de classe 6 avec solde D > 0 : Crédit pour
--          ramener à 0, Débit 1200
--        Pour chaque compte de classe 7 avec solde C > 0 : Débit pour
--          ramener à 0, Crédit 1200
--   3. Insère écritures d'à-nouveau (AN) au 1er jour du nouvel exercice :
--        Pour chaque compte de classe 1-5 avec solde non-nul : reprend
--          le solde dans le bon sens
--   4. Affecte le résultat 1200 vers 119 (Report à nouveau) au 1er jour
--      du nouvel exercice : Débit 1200 / Crédit 119 si bénéfice
--   5. Marque l'exercice comme cloture
--
-- IDEMPOTENTE : delete des AN/CL existants pour cet exercice avant
-- ré-INSERT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloture_exercice(
  p_societe_id UUID,
  p_exercice TEXT             -- ex: '2024-2025' ou '2024' selon convention
) RETURNS TABLE (
  resultat_exercice NUMERIC,
  nb_lignes_cloture INT,
  nb_lignes_an INT,
  total_actif_an NUMERIC,
  total_passif_an NUMERIC,
  equilibre BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_dossier_id UUID;
  v_date_debut DATE;
  v_date_fin DATE;
  v_date_open DATE;
  v_match TEXT[];
  v_match_year INT;
  v_resultat NUMERIC := 0;
  v_compte RECORD;
  v_solde NUMERIC;
  v_nb_cl INT := 0;
  v_nb_an INT := 0;
  v_total_actif NUMERIC := 0;
  v_total_passif NUMERIC := 0;
  v_exercice_an TEXT;
BEGIN
  SELECT id INTO v_dossier_id FROM public.dossiers
  WHERE societe_id = p_societe_id ORDER BY created_at DESC LIMIT 1;

  -- Parse exercice (format: 'YYYY-YYYY' Maurice juil-juin OU 'YYYY' calendaire)
  v_match := REGEXP_MATCHES(p_exercice, '^(\d{4})-(\d{4})$');
  IF v_match IS NOT NULL THEN
    v_date_debut := (v_match[1] || '-07-01')::DATE;
    v_date_fin   := (v_match[2] || '-06-30')::DATE;
    v_date_open  := (v_match[2] || '-07-01')::DATE;
    v_exercice_an := v_match[2] || '-' || (v_match[2]::INT + 1)::TEXT;
  ELSE
    v_match := REGEXP_MATCHES(p_exercice, '^(\d{4})$');
    IF v_match IS NULL THEN
      RAISE EXCEPTION 'Format exercice invalide: %. Attendu YYYY-YYYY ou YYYY', p_exercice;
    END IF;
    v_match_year := v_match[1]::INT;
    v_date_debut := (v_match_year || '-01-01')::DATE;
    v_date_fin   := (v_match_year || '-12-31')::DATE;
    v_date_open  := ((v_match_year + 1) || '-01-01')::DATE;
    v_exercice_an := (v_match_year + 1)::TEXT;
  END IF;

  -- Idempotence : purge écritures CL et AN existantes pour cet exercice
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND journal IN ('CL', 'AN')
    AND date_ecriture IN (v_date_fin, v_date_open);

  -- ────────────────────────────────────────────────────────────
  -- Étape 1 : Soldes des classes 6 et 7 → calcul résultat
  -- ────────────────────────────────────────────────────────────
  FOR v_compte IN
    SELECT numero_compte,
           COALESCE(MAX(nom_compte), 'Compte ' || numero_compte) AS nom_compte,
           SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0)) AS solde
    FROM public.ecritures_comptables_v2
    WHERE societe_id = p_societe_id
      AND date_ecriture BETWEEN v_date_debut AND v_date_fin
      AND (numero_compte LIKE '6%' OR numero_compte LIKE '7%')
    GROUP BY numero_compte
    HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
  LOOP
    v_solde := v_compte.solde;

    -- Classe 6 (charges, sens normal D) : Crédit pour ramener à 0
    IF v_compte.numero_compte LIKE '6%' THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_fin, 'CL',
              'CL-' || p_exercice, v_compte.numero_compte, v_compte.nom_compte,
              'Clôture exercice ' || p_exercice,
              'Soldé pour clôture',
              0, v_solde, p_exercice);
      v_resultat := v_resultat - v_solde;  -- Charges réduisent le résultat
      v_nb_cl := v_nb_cl + 1;

    -- Classe 7 (produits, sens normal C, donc solde négatif) : Débit pour ramener à 0
    ELSIF v_compte.numero_compte LIKE '7%' THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_fin, 'CL',
              'CL-' || p_exercice, v_compte.numero_compte, v_compte.nom_compte,
              'Clôture exercice ' || p_exercice,
              'Soldé pour clôture',
              ABS(v_solde), 0, p_exercice);
      v_resultat := v_resultat + ABS(v_solde);  -- Produits augmentent le résultat
      v_nb_cl := v_nb_cl + 1;
    END IF;
  END LOOP;

  -- Inscription du résultat sur 1200
  IF ABS(v_resultat) > 0.01 THEN
    IF v_resultat > 0 THEN
      -- Bénéfice : Crédit 1200
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_fin, 'CL',
              'CL-' || p_exercice, '1200', 'Résultat de l''exercice',
              'Bénéfice ' || p_exercice, 'Bénéfice net affecté',
              0, v_resultat, p_exercice);
    ELSE
      -- Perte : Débit 1200
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_fin, 'CL',
              'CL-' || p_exercice, '1200', 'Résultat de l''exercice',
              'Perte ' || p_exercice, 'Perte nette affectée',
              ABS(v_resultat), 0, p_exercice);
    END IF;
    v_nb_cl := v_nb_cl + 1;
  END IF;

  -- ────────────────────────────────────────────────────────────
  -- Étape 2 : À-nouveau (AN) sur classes 1-5 au 1er jour exercice N+1
  -- ────────────────────────────────────────────────────────────
  FOR v_compte IN
    SELECT numero_compte,
           COALESCE(MAX(nom_compte), 'Compte ' || numero_compte) AS nom_compte,
           SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0)) AS solde
    FROM public.ecritures_comptables_v2
    WHERE societe_id = p_societe_id
      AND date_ecriture <= v_date_fin
      AND (numero_compte ~ '^[1-5]')  -- Classes 1 à 5 (bilan)
      AND numero_compte <> '1200'      -- Exclure 1200 qui sera affecté ensuite
    GROUP BY numero_compte
    HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
  LOOP
    v_solde := v_compte.solde;

    IF v_solde > 0 THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_open, 'AN',
              'AN-' || v_exercice_an, v_compte.numero_compte, v_compte.nom_compte,
              'À nouveau ' || v_exercice_an, 'Report à nouveau (solde débiteur)',
              v_solde, 0, v_exercice_an);
      v_total_actif := v_total_actif + v_solde;
    ELSIF v_solde < 0 THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_open, 'AN',
              'AN-' || v_exercice_an, v_compte.numero_compte, v_compte.nom_compte,
              'À nouveau ' || v_exercice_an, 'Report à nouveau (solde créditeur)',
              0, ABS(v_solde), v_exercice_an);
      v_total_passif := v_total_passif + ABS(v_solde);
    END IF;
    v_nb_an := v_nb_an + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────
  -- Étape 3 : Affectation 1200 → 119 (Report à nouveau)
  -- ────────────────────────────────────────────────────────────
  IF ABS(v_resultat) > 0.01 THEN
    IF v_resultat > 0 THEN
      -- Affecte bénéfice : Débit 1200, Crédit 119
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_open, 'AN',
              'AN-' || v_exercice_an, '1200', 'Résultat de l''exercice',
              'Affectation résultat ' || p_exercice, 'Bénéfice → 119 RAN',
              v_resultat, 0, v_exercice_an);
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_open, 'AN',
              'AN-' || v_exercice_an, '1190', 'Report à nouveau',
              'Affectation résultat ' || p_exercice, 'Bénéfice net en RAN',
              0, v_resultat, v_exercice_an);
      v_total_passif := v_total_passif + v_resultat;
    ELSE
      -- Affecte perte : Débit 119, Crédit 1200
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_open, 'AN',
              'AN-' || v_exercice_an, '1190', 'Report à nouveau',
              'Affectation résultat ' || p_exercice, 'Perte nette en RAN',
              ABS(v_resultat), 0, v_exercice_an);
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
         libelle, description, debit_mur, credit_mur, exercice)
      VALUES (p_societe_id, v_dossier_id, v_date_open, 'AN',
              'AN-' || v_exercice_an, '1200', 'Résultat de l''exercice',
              'Affectation résultat ' || p_exercice, 'Perte → 119 RAN',
              0, ABS(v_resultat), v_exercice_an);
      v_total_actif := v_total_actif + ABS(v_resultat);
    END IF;
    v_nb_an := v_nb_an + 2;
  END IF;

  RETURN QUERY SELECT v_resultat, v_nb_cl, v_nb_an, v_total_actif, v_total_passif,
                      ABS(v_total_actif - v_total_passif) < 1;
END;
$$;

COMMENT ON FUNCTION public.cloture_exercice IS
  'Clôture un exercice fiscal : (1) génère écritures CL pour solder classes '
  '6/7 sur 1200, (2) génère écritures AN pour reporter classes 1-5 au 1er '
  'jour du nouvel exercice, (3) affecte 1200 → 119 (Report à nouveau). '
  'Idempotente. Format exercice : YYYY-YYYY (Maurice juil-juin) ou YYYY '
  '(année civile).';

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 225 — RPC cloture_exercice() en place';
END $$;
