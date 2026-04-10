-- ═══════════════════════════════════════════════════════════════
-- Migration 120: Unify ecritures_comptables (v1) + ecritures_comptables_v2
--                into a single source of truth (v2)
--
-- Problem: the app had two tables:
--   - ecritures_comptables (v1): columns (dossier_id, compte, debit, credit, numero_piece, libelle)
--   - ecritures_comptables_v2: columns (societe_id, numero_compte, debit_mur, credit_mur,
--                                        ref_folio, description, nom_compte, journal, exercice)
-- Depending on the route, ecritures could be written to either or both, causing missing data.
--
-- Solution:
--   1. Copy all v1 entries to v2 (if not already there)
--   2. Drop the v1 table
--   3. Recreate `ecritures_comptables` as a VIEW over v2 with v1 column names
--   4. Add INSTEAD OF triggers on the view so existing INSERT/UPDATE/DELETE still work
--
-- After this migration: all code sees a unified view. The physical storage is v2 only.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Copy missing v1 entries to v2
-- Match by (dossier → societe, date, journal, compte, debit, credit, piece)
DO $$
DECLARE
  v_copied INTEGER := 0;
BEGIN
  -- Only run if the old table still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ecritures_comptables'
      AND table_type = 'BASE TABLE'
  ) THEN
    INSERT INTO public.ecritures_comptables_v2 (
      id, societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
      numero_compte, nom_compte, libelle, description, debit_mur, credit_mur,
      exercice, created_at
    )
    SELECT
      ec.id,
      d.societe_id,
      ec.dossier_id,
      ec.date_ecriture,
      ec.journal,
      ec.numero_piece AS ref_folio,
      ec.numero_piece,
      ec.compte AS numero_compte,
      COALESCE(
        CASE WHEN ec.compte LIKE '6%' THEN 'Charge'
             WHEN ec.compte LIKE '7%' THEN 'Produit'
             WHEN ec.compte LIKE '4%' THEN 'Tiers'
             WHEN ec.compte LIKE '5%' THEN 'Tresorerie'
             ELSE NULL END,
        NULL
      ) AS nom_compte,
      ec.libelle,
      ec.libelle AS description,
      COALESCE(ec.debit, 0),
      COALESCE(ec.credit, 0),
      TO_CHAR(ec.date_ecriture, 'YYYY'),
      COALESCE(ec.created_at, NOW())
    FROM public.ecritures_comptables ec
    LEFT JOIN public.dossiers d ON d.id = ec.dossier_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ecritures_comptables_v2 v2
      WHERE v2.id = ec.id
         OR (
           v2.societe_id = d.societe_id
           AND v2.date_ecriture = ec.date_ecriture
           AND COALESCE(v2.journal, '') = COALESCE(ec.journal, '')
           AND v2.numero_compte = ec.compte
           AND COALESCE(v2.debit_mur, 0) = COALESCE(ec.debit, 0)
           AND COALESCE(v2.credit_mur, 0) = COALESCE(ec.credit, 0)
           AND COALESCE(v2.numero_piece, '') = COALESCE(ec.numero_piece, '')
         )
    );
    GET DIAGNOSTICS v_copied = ROW_COUNT;
    RAISE NOTICE 'Migration 120: copied % v1 entries to v2', v_copied;

    -- Step 2: Drop the v1 table (cascades to its FK references)
    DROP TABLE public.ecritures_comptables CASCADE;
    RAISE NOTICE 'Migration 120: dropped old ecritures_comptables table';
  ELSE
    RAISE NOTICE 'Migration 120: ecritures_comptables is not a table, skipping copy+drop';
  END IF;
END $$;

-- Step 3: Create a VIEW that exposes v2 with v1 column names
-- (only if the view doesn't already exist)
CREATE OR REPLACE VIEW public.ecritures_comptables AS
SELECT
  v2.id,
  v2.dossier_id,
  v2.date_ecriture,
  v2.journal,
  v2.numero_piece,
  v2.numero_compte AS compte,
  v2.libelle,
  COALESCE(v2.debit_mur, 0) AS debit,
  COALESCE(v2.credit_mur, 0) AS credit,
  v2.ref_folio AS piece_justificative,
  v2.created_at,
  v2.societe_id,
  v2.nom_compte,
  v2.description,
  v2.document_id,
  v2.exercice
FROM public.ecritures_comptables_v2 v2;

-- Step 4: INSTEAD OF triggers on the view so INSERT / UPDATE / DELETE work transparently

-- INSERT trigger: maps v1 columns to v2 columns
CREATE OR REPLACE FUNCTION public.ecritures_comptables_insert_v1_compat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_societe_id UUID;
BEGIN
  -- Resolve societe_id from dossier_id if not provided
  IF NEW.societe_id IS NULL AND NEW.dossier_id IS NOT NULL THEN
    SELECT societe_id INTO v_societe_id FROM public.dossiers WHERE id = NEW.dossier_id;
  ELSE
    v_societe_id := NEW.societe_id;
  END IF;

  INSERT INTO public.ecritures_comptables_v2 (
    id, societe_id, dossier_id, date_ecriture, journal,
    ref_folio, numero_piece, numero_compte, nom_compte, libelle, description,
    debit_mur, credit_mur, document_id, exercice, created_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    v_societe_id,
    NEW.dossier_id,
    NEW.date_ecriture,
    NEW.journal,
    COALESCE(NEW.ref_folio, NEW.piece_justificative, NEW.numero_piece),
    NEW.numero_piece,
    NEW.compte,
    COALESCE(NEW.nom_compte,
      CASE WHEN NEW.compte LIKE '6%' THEN 'Charge'
           WHEN NEW.compte LIKE '7%' THEN 'Produit'
           WHEN NEW.compte LIKE '4%' THEN 'Tiers'
           WHEN NEW.compte LIKE '5%' THEN 'Tresorerie'
           ELSE NULL END
    ),
    NEW.libelle,
    COALESCE(NEW.description, NEW.libelle),
    COALESCE(NEW.debit, 0),
    COALESCE(NEW.credit, 0),
    NEW.document_id,
    COALESCE(NEW.exercice, TO_CHAR(NEW.date_ecriture, 'YYYY')),
    COALESCE(NEW.created_at, NOW())
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_insert_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_insert_trigger
INSTEAD OF INSERT ON public.ecritures_comptables
FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_insert_v1_compat();

-- UPDATE trigger
CREATE OR REPLACE FUNCTION public.ecritures_comptables_update_v1_compat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ecritures_comptables_v2
  SET
    dossier_id = NEW.dossier_id,
    date_ecriture = NEW.date_ecriture,
    journal = NEW.journal,
    numero_piece = NEW.numero_piece,
    numero_compte = NEW.compte,
    libelle = NEW.libelle,
    debit_mur = COALESCE(NEW.debit, 0),
    credit_mur = COALESCE(NEW.credit, 0),
    ref_folio = COALESCE(NEW.ref_folio, NEW.piece_justificative, NEW.numero_piece)
  WHERE id = OLD.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_update_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_update_trigger
INSTEAD OF UPDATE ON public.ecritures_comptables
FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_update_v1_compat();

-- DELETE trigger
CREATE OR REPLACE FUNCTION public.ecritures_comptables_delete_v1_compat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.ecritures_comptables_v2 WHERE id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_delete_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_delete_trigger
INSTEAD OF DELETE ON public.ecritures_comptables
FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_delete_v1_compat();

-- ═══════════════════════════════════════════════════════════════
-- Step 5: Update generer_ecritures_paie to write ONLY to v2
-- ═══════════════════════════════════════════════════════════════
-- The existing function writes to both tables. Now that v1 is a view,
-- writing to v1 would re-insert into v2 (double). We must only write to v2.
-- Rewrite the function in migration 029's image but targeting v2 only.

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

  v_piece  := 'BP-' || p_bulletin_id::TEXT;
  v_periode := v_bulletin.periode::DATE;
  v_name    := v_bulletin.prenom || ' ' || v_bulletin.nom;
  v_exercice := TO_CHAR(v_periode, 'YYYY');

  SELECT d.id INTO v_dossier_id
  FROM public.dossiers d
  WHERE d.societe_id = v_bulletin.societe_id
  ORDER BY d.created_at DESC LIMIT 1;

  -- Delete existing entries for this bulletin
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND (ref_folio = v_piece OR numero_piece = v_piece);

  -- === DEBITS (charges) ===
  IF COALESCE(v_bulletin.salaire_base, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6411', 'Rémunérations du personnel', 'Salaire base — ' || v_name, 'Salaire base — ' || v_name, v_bulletin.salaire_base, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.transport_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6412', 'Transport allowance', 'Transport — ' || v_name, 'Transport — ' || v_name, v_bulletin.transport_allowance, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.petrol_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6413', 'Petrol allowance', 'Petrol — ' || v_name, 'Petrol — ' || v_name, v_bulletin.petrol_allowance, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.heures_sup_montant, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6414', 'Heures supplementaires', 'Heures sup — ' || v_name, 'Heures sup — ' || v_name, v_bulletin.heures_sup_montant, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.special_allowance_1, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6415', 'Primes et indemnites', 'Primes — ' || v_name, 'Primes — ' || v_name, v_bulletin.special_allowance_1, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.eoy_bonus, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6416', '13eme mois', '13eme mois — ' || v_name, '13eme mois — ' || v_name, v_bulletin.eoy_bonus, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Charges patronales
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6451', 'CSG patronal', 'CSG patronal — ' || v_name, 'CSG patronal — ' || v_name, v_bulletin.csg_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6452', 'NSF patronal', 'NSF patronal — ' || v_name, 'NSF patronal — ' || v_name, v_bulletin.nsf_patronal, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6454', 'Training Levy', 'Training Levy — ' || v_name, 'Training Levy — ' || v_name, v_bulletin.training_levy, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '6453', 'PRGF', 'PRGF — ' || v_name, 'PRGF — ' || v_name, v_bulletin.prgf, 0, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- === CREDITS (tiers) ===
  IF COALESCE(v_bulletin.salaire_net, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '421', 'Personnel — rémunérations dues', 'Net a payer — ' || v_name, 'Net a payer — ' || v_name, 0, v_bulletin.salaire_net, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.csg_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '431', 'Securite sociale (CSG/NSF)', 'CSG salarie — ' || v_name, 'CSG salarie — ' || v_name, 0, v_bulletin.csg_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.nsf_salarie, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '431', 'Securite sociale (CSG/NSF)', 'NSF salarie — ' || v_name, 'NSF salarie — ' || v_name, 0, v_bulletin.nsf_salarie, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.paye, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '444', 'Etat — impots sur le revenu (PAYE)', 'PAYE — ' || v_name, 'PAYE — ' || v_name, 0, v_bulletin.paye, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Credits for employer charges
  IF COALESCE(v_bulletin.csg_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '431', 'Securite sociale (CSG/NSF)', 'CSG patronal a payer — ' || v_name, 'CSG patronal a payer — ' || v_name, 0, v_bulletin.csg_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '431', 'Securite sociale (CSG/NSF)', 'NSF patronal a payer — ' || v_name, 'NSF patronal a payer — ' || v_name, 0, v_bulletin.nsf_patronal, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '432', 'Autres organismes sociaux', 'Training Levy a payer — ' || v_name, 'Training Levy a payer — ' || v_name, 0, v_bulletin.training_levy, v_exercice);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
       numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES (v_bulletin.societe_id, v_dossier_id, v_periode, v_journal, v_piece, v_piece,
       '432', 'Autres organismes sociaux', 'PRGF a payer — ' || v_name, 'PRGF a payer — ' || v_name, 0, v_bulletin.prgf, v_exercice);
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

COMMENT ON FUNCTION public.generer_ecritures_paie IS 'Generate accounting entries for a payslip — writes to ecritures_comptables_v2 only (migration 120)';
