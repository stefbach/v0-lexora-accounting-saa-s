-- =============================================================================
-- Migration 029 — Fix generer_ecritures_paie : écriture dans ecritures_comptables (v1) ET ecritures_comptables_v2
-- Journal OD-PAIE (cohérent avec usage existant)
-- Ajoute colonnes date_comptabilisation + nb_ecritures_generees sur bulletins_paie
-- =============================================================================

-- Ajouter colonnes manquantes sur bulletins_paie si absentes
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS date_comptabilisation TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nb_ecritures_generees INTEGER DEFAULT 0;

-- =============================================================================
-- Fonction complète : écrit dans ecritures_comptables (v1) ET ecritures_comptables_v2
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generer_ecritures_paie(
  p_bulletin_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_bulletin  RECORD;
  v_employe   RECORD;
  v_dossier_id UUID;
  v_nb_lignes  INTEGER := 0;
  v_journal    TEXT := 'OD-PAIE';
  v_piece      TEXT;
  v_periode    DATE;
  v_libelle_base TEXT;
BEGIN
  -- ── 1. Récupérer le bulletin avec infos employé ──
  SELECT b.*, e.nom, e.prenom, e.code, e.societe_id
  INTO v_bulletin
  FROM public.bulletins_paie b
  JOIN public.employes e ON e.id = b.employe_id
  WHERE b.id = p_bulletin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bulletin % introuvable', p_bulletin_id;
  END IF;

  v_piece  := 'BP-' || p_bulletin_id::TEXT;
  v_periode := v_bulletin.periode::DATE;

  -- ── 2. Trouver le dossier comptable de la société ──
  SELECT d.id INTO v_dossier_id
  FROM public.dossiers d
  WHERE d.societe_id = v_bulletin.societe_id
  ORDER BY d.created_at DESC
  LIMIT 1;
  -- Si pas de dossier : on écrit quand même dans v2 (societe_id suffit)
  -- v_dossier_id peut être NULL pour v2

  -- ── 3. Supprimer les anciennes écritures (v1 + v2) pour ce bulletin ──
  IF v_dossier_id IS NOT NULL THEN
    DELETE FROM public.ecritures_comptables
    WHERE dossier_id = v_dossier_id
      AND journal = v_journal
      AND numero_piece = v_piece;
  END IF;

  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND (ref_folio = v_piece OR numero_piece = v_piece);

  -- ── Helper macro : INSERT dans v1 et v2 ──
  -- On utilise un bloc répété ci-dessous pour chaque ligne

  -- ════════════════════════════════════════════════
  -- DÉBITS (Charges 6xx)
  -- ════════════════════════════════════════════════

  -- ── 6411 : Salaire de base ──
  IF COALESCE(v_bulletin.salaire_base, 0) > 0 THEN
    v_libelle_base := 'Salaire base — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6411', v_libelle_base, v_bulletin.salaire_base, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6411', 'Rémunérations du personnel', v_libelle_base, v_libelle_base, v_bulletin.salaire_base, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6412 : Transport allowance ──
  IF COALESCE(v_bulletin.transport_allowance, 0) > 0 THEN
    v_libelle_base := 'Transport — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6412', v_libelle_base, v_bulletin.transport_allowance, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6412', 'Transport allowance', v_libelle_base, v_libelle_base, v_bulletin.transport_allowance, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6413 : Petrol allowance ──
  IF COALESCE(v_bulletin.petrol_allowance, 0) > 0 THEN
    v_libelle_base := 'Petrol — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6413', v_libelle_base, v_bulletin.petrol_allowance, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6413', 'Petrol allowance', v_libelle_base, v_libelle_base, v_bulletin.petrol_allowance, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6414 : Heures supplémentaires ──
  IF COALESCE(v_bulletin.heures_sup_montant, 0) > 0 THEN
    v_libelle_base := 'Heures sup — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6414', v_libelle_base, v_bulletin.heures_sup_montant, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6414', 'Heures supplémentaires', v_libelle_base, v_libelle_base, v_bulletin.heures_sup_montant, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6416 : EOY Bonus (13ème mois) ──
  IF COALESCE(v_bulletin.eoy_bonus, 0) > 0 THEN
    v_libelle_base := '13ème mois — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6416', v_libelle_base, v_bulletin.eoy_bonus, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6416', '13ème mois EOY Bonus', v_libelle_base, v_libelle_base, v_bulletin.eoy_bonus, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6451 : CSG patronal (charge débit) ──
  IF COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0) > 0 THEN
    v_libelle_base := 'CSG patronal — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6451', v_libelle_base,
        COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0), 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6451', 'CSG patronal', v_libelle_base, v_libelle_base,
      COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0), 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6452 : NSF patronal (charge débit) ──
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    v_libelle_base := 'NSF patronal — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6452', v_libelle_base, v_bulletin.nsf_patronal, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6452', 'NSF patronal', v_libelle_base, v_libelle_base, v_bulletin.nsf_patronal, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6453 : PRGF (charge débit) ──
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    v_libelle_base := 'PRGF — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6453', v_libelle_base, v_bulletin.prgf, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6453', 'PRGF', v_libelle_base, v_libelle_base, v_bulletin.prgf, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 6454 : Training Levy (charge débit) ──
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    v_libelle_base := 'Training Levy — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '6454', v_libelle_base, v_bulletin.training_levy, 0);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '6454', 'Training Levy HRDC', v_libelle_base, v_libelle_base, v_bulletin.training_levy, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ════════════════════════════════════════════════
  -- CRÉDITS (Passifs 4xx)
  -- ════════════════════════════════════════════════

  -- ── 421 : Net à payer ──
  IF COALESCE(v_bulletin.salaire_net, 0) > 0 THEN
    v_libelle_base := 'Net à payer — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '421', v_libelle_base, 0, v_bulletin.salaire_net);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '421', 'Personnel — rémunérations dues', v_libelle_base, v_libelle_base, 0, v_bulletin.salaire_net);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 431 : CSG/NSF salarié retenu ──
  IF COALESCE(v_bulletin.csg_salarie, 0) + COALESCE(v_bulletin.csg_bonus, 0) > 0 THEN
    v_libelle_base := 'CSG salarié — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '431', v_libelle_base,
        0, COALESCE(v_bulletin.csg_salarie, 0) + COALESCE(v_bulletin.csg_bonus, 0));
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '431', 'CSG/NSF — cotisations salarié', v_libelle_base, v_libelle_base,
      0, COALESCE(v_bulletin.csg_salarie, 0) + COALESCE(v_bulletin.csg_bonus, 0));
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 431 : CSG patronal à verser MRA ──
  IF COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0) > 0 THEN
    v_libelle_base := 'CSG patronal MRA — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '431', v_libelle_base,
        0, COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0));
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '431', 'CSG/NSF — cotisations patronales', v_libelle_base, v_libelle_base,
      0, COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0));
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 431 : NSF patronal à verser MRA ──
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    v_libelle_base := 'NSF patronal MRA — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '431', v_libelle_base, 0, v_bulletin.nsf_patronal);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '431', 'NSF patronal à verser MRA', v_libelle_base, v_libelle_base, 0, v_bulletin.nsf_patronal);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 432 : Training Levy HRDC à verser ──
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    v_libelle_base := 'Training Levy HRDC — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '432', v_libelle_base, 0, v_bulletin.training_levy);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '432', 'Training Levy HRDC à verser', v_libelle_base, v_libelle_base, 0, v_bulletin.training_levy);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 444 : PAYE retenu salarié ──
  IF COALESCE(v_bulletin.paye, 0) > 0 THEN
    v_libelle_base := 'PAYE retenu — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '444', v_libelle_base, 0, v_bulletin.paye);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '444', 'PAYE à verser — MRA', v_libelle_base, v_libelle_base, 0, v_bulletin.paye);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── 432 : PRGF à verser ──
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    v_libelle_base := 'PRGF à verser — ' || v_bulletin.prenom || ' ' || v_bulletin.nom;
    IF v_dossier_id IS NOT NULL THEN
      INSERT INTO public.ecritures_comptables
        (dossier_id, date_ecriture, journal, numero_piece, compte, libelle, debit, credit)
      VALUES (v_dossier_id, v_periode, v_journal, v_piece,
        '432', v_libelle_base, 0, v_bulletin.prgf);
    END IF;
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
      '432', 'PRGF à verser', v_libelle_base, v_libelle_base, 0, v_bulletin.prgf);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── Marquer le bulletin comme comptabilisé ──
  UPDATE public.bulletins_paie
  SET
    comptabilise            = TRUE,
    date_comptabilisation   = NOW(),
    nb_ecritures_generees   = v_nb_lignes
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END;
$$;

-- =============================================================================
-- Recréer le trigger en s'assurant qu'il utilise le journal OD-PAIE
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_ecritures_paie()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.statut = 'valide' AND (OLD.statut IS DISTINCT FROM 'valide') THEN
    PERFORM public.generer_ecritures_paie(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_ecritures_paie ON public.bulletins_paie;
CREATE TRIGGER trig_ecritures_paie
  AFTER UPDATE ON public.bulletins_paie
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ecritures_paie();

COMMENT ON FUNCTION public.generer_ecritures_paie(UUID) IS
  'Migration 029 — écrit dans ecritures_comptables (v1, compat) ET ecritures_comptables_v2 (Grand Livre). '
  'Journal OD-PAIE. Couvre : 6411 sal, 6412 transport, 6413 petrol, 6414 OT, 6416 EOY, '
  '6451 CSG-pat, 6452 NSF-pat, 6453 PRGF, 6454 Training Levy, '
  '421 net-à-payer, 431 CSG/NSF, 432 Training/PRGF, 444 PAYE.';
