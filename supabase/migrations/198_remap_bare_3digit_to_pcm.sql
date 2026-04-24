-- ============================================================================
-- Migration 163 — Remap bare 3-digit (421/431/432/444) vers PCM 4-digits
--                 par analyse du libellé
-- ============================================================================
--
-- Contexte : la fonction SQL `generer_ecritures_paie` (migrations 029 + 120)
-- écrit les dettes paie sur des comptes 3-digits bare :
--   • 421  pour salaires nets     → doit être 4210
--   • 431  pour CSG sal / NSF sal / CSG pat / NSF pat → 4311 / 4312 / 4321 / 4322
--   • 432  pour Training Levy / PRGF → 4324 / 4323
--   • 444  pour PAYE              → 4330
--
-- Ces codes 3-digits ne sont pas dans la table `compte_remap_pcm` (qui ne couvre
-- que les legacy 6-digits), donc le trigger `tr_ecritures_remap_pcm` les laisse
-- passer intacts. Résultat sur la capture Grand Livre : compte 421 avec 9 lignes
-- crédit isolées, sans contrepartie ; compte 433 visible au lieu de 4330.
--
-- Cette migration ventile les lignes existantes en analysant le libellé,
-- qui a une forme déterministe issue de `generer_ecritures_paie` :
--   • "Net a payer — <nom>"       → 4210
--   • "CSG salarie — <nom>"       → 4311
--   • "NSF salarie — <nom>"       → 4312
--   • "CSG patronal a payer — …"  → 4321
--   • "NSF patronal a payer — …"  → 4322
--   • "Training Levy a payer — …" → 4324
--   • "PRGF a payer — …"          → 4323
--   • "PAYE — <nom>"              → 4330
--
-- Idempotente : le filtre WHERE exclut les comptes déjà 4-digits.
-- ============================================================================

-- ── 1. Compte 421 bare → 4210 (Salaires nets à payer) ─────────────────────
UPDATE public.ecritures_comptables_v2
SET numero_compte = '4210',
    nom_compte = 'Salaires nets à payer'
WHERE numero_compte = '421'
  AND (
    libelle ILIKE '%Net a payer%'
    OR libelle ILIKE '%Salaire net%'
    OR libelle ILIKE '%Salaires nets%'
    OR libelle ILIKE '%Net à payer%'
  );

-- ── 2. Compte 4211 → 4210 (primes mal routées par R03_SALARY_BULK) ────────
-- Les débits 4211 (12 lignes, 3,4M) proviennent de R03_SALARY_BULK (migration 135)
-- qui écrivait '421100' remappé en 4211 par migration 144. Ce sont en réalité
-- des paiements de salaires nets → doivent être sur 4210 pour matcher les
-- crédits SAL. NE PAS toucher aux vraies lignes 4211 "Primes et gratifications"
-- (libellé contient "Prime").
UPDATE public.ecritures_comptables_v2
SET numero_compte = '4210',
    nom_compte = 'Salaires nets à payer'
WHERE numero_compte = '4211'
  AND journal = 'BNQ'
  AND libelle NOT ILIKE '%Prime%'
  AND libelle NOT ILIKE '%Gratification%';

-- ── 3. Compte 431 bare → 4311 / 4312 / 4321 / 4322 par libellé ────────────
-- ORDRE IMPORTANT : on teste d'abord les patterns "patronal" (plus spécifiques),
-- puis "salarie"/"salarié". Le libellé produit par generer_ecritures_paie est
-- déterministe donc chaque ligne matchera exactement un pattern.
UPDATE public.ecritures_comptables_v2
SET numero_compte = '4321',
    nom_compte = 'CSG patronal à verser'
WHERE numero_compte = '431'
  AND libelle ILIKE '%CSG patronal%';

UPDATE public.ecritures_comptables_v2
SET numero_compte = '4322',
    nom_compte = 'NSF patronal à verser'
WHERE numero_compte = '431'
  AND libelle ILIKE '%NSF patronal%';

UPDATE public.ecritures_comptables_v2
SET numero_compte = '4311',
    nom_compte = 'CSG salarié à verser'
WHERE numero_compte = '431'
  AND (libelle ILIKE '%CSG salarie%' OR libelle ILIKE '%CSG salarié%');

UPDATE public.ecritures_comptables_v2
SET numero_compte = '4312',
    nom_compte = 'NSF salarié à verser'
WHERE numero_compte = '431'
  AND (libelle ILIKE '%NSF salarie%' OR libelle ILIKE '%NSF salarié%');

-- Fallback : 431 restantes (libellés génériques "Charges sociales") → 4312.
-- Avertissement : ces écritures auront `nom_compte` distinct pour qu'on puisse
-- les retrouver manuellement si besoin.
UPDATE public.ecritures_comptables_v2
SET numero_compte = '4312',
    nom_compte = 'NSF salarié à verser (remap fallback mig 198)'
WHERE numero_compte = '431';

-- ── 4. Compte 432 bare → 4323 (PRGF) / 4324 (Training Levy) ───────────────
UPDATE public.ecritures_comptables_v2
SET numero_compte = '4323',
    nom_compte = 'PRGF à verser'
WHERE numero_compte = '432'
  AND libelle ILIKE '%PRGF%';

UPDATE public.ecritures_comptables_v2
SET numero_compte = '4324',
    nom_compte = 'Training Levy HRDC à verser'
WHERE numero_compte = '432'
  AND (libelle ILIKE '%Training%' OR libelle ILIKE '%Levy%' OR libelle ILIKE '%HRDC%');

-- ── 5. Compte 444 bare → 4330 (PAYE) ──────────────────────────────────────
UPDATE public.ecritures_comptables_v2
SET numero_compte = '4330',
    nom_compte = 'PAYE à reverser à la MRA'
WHERE numero_compte = '444';

-- ── 6. Compte 433 bare → 4330 (écrit par un chemin legacy vu en prod) ─────
-- Le plan comptable PCM n'a pas '433' comme compte direct — c'est un parent.
-- Si vu dans v2, c'est une régression de génération.
UPDATE public.ecritures_comptables_v2
SET numero_compte = '4330',
    nom_compte = 'PAYE à reverser à la MRA'
WHERE numero_compte = '433'
  AND (libelle ILIKE '%PAYE%' OR libelle IS NULL);

-- ── 7. Garantir `generer_ecritures_paie` écrit du PCM 4-digits à l'avenir ─
-- La version actuelle (migration 120) utilise '421', '431', '432', '444'. On
-- la remplace ici par une version 4-digits canonique. Ventilation fine :
--   csg_salarie  → 4311    csg_patronal  → 4321
--   nsf_salarie  → 4312    nsf_patronal  → 4322
--   training_levy → 4324   prgf          → 4323
--   salaire_net  → 4210    paye          → 4330
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

  v_piece   := 'BP-' || p_bulletin_id::TEXT;
  v_periode := v_bulletin.periode::DATE;
  v_name    := v_bulletin.prenom || ' ' || v_bulletin.nom;
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

  -- Charges patronales
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

  -- === CRÉDITS (dettes 43xx / 42xx / 4330) === PCM 4-digits
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
  '(migration 198). Accounts : 4210 net, 4311 CSG sal, 4312 NSF sal, 4321 CSG pat, '
  '4322 NSF pat, 4323 PRGF, 4324 Levy, 4330 PAYE. 641x débit pour les charges.';

-- ── 8. Rapport ────────────────────────────────────────────────────────────
DO $$
DECLARE v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.ecritures_comptables_v2
  WHERE numero_compte IN ('421', '431', '432', '433', '444');
  IF v_remaining > 0 THEN
    RAISE WARNING 'Migration 163: % écritures restent en codes 3-digits bare (libellés non reconnus) — à inspecter manuellement', v_remaining;
  ELSE
    RAISE NOTICE 'Migration 163 terminée — tous les codes 3-digits bare ont été remappés en PCM 4-digits';
  END IF;
END $$;
