-- ============================================================================
-- Migration 234 — Backfill compte_comptable des comptes_bancaires existants
-- ============================================================================
--
-- Contexte (2026-05-03) :
-- Avant cette migration, le champ compte_comptable de la table
-- comptes_bancaires était souvent NULL parce qu'aucun chemin de création
-- (OCR upload, création manuelle) ne le remplissait automatiquement.
--
-- Conséquence : les écritures BNQ tombaient sur le compte générique '512'
-- (fallback dans createEcrituresForPayment) au lieu de comptes spécifiques
-- 512<BB><D> distinguant chaque banque + devise. Impossible de produire un
-- grand-livre 512xxx propre par banque.
--
-- Cette migration :
--   1. Backfille TOUS les comptes_bancaires existants qui ont compte_comptable
--      IS NULL en utilisant la même logique que le helper TS
--      lib/accounting/comptes-bancaires.ts (getCompteComptable)
--   2. Convention : 512<BB><D>
--      BB = code banque (10=MCB, 20=SBM, 30=ABSA, 40=BANKONE, 50=AFRASIA,
--           60=MAUBANK, 70=SCB, 80=HSBC, 90=SBI, 91=BOB, 92=ABC, 93=BNP,
--           94=CITI, 95=HABIB, 96=INVESTEC, 97=BCP, 99=Autre)
--      D  = code devise (0=MUR, 1=EUR, 2=USD, 3=GBP, 4=AUD, 5=CAD, 6=CHF,
--           7=ZAR, 8=INR, 9=Autre)
-- 3. NE TOUCHE PAS aux comptes_bancaires qui ont déjà un compte_comptable
--    rempli (préservation des choix manuels du comptable).
--
-- IDEMPOTENT : peut être relancée plusieurs fois sans effet sur les comptes
-- déjà backfillés.
-- ============================================================================

-- Helper SQL inline qui réplique la logique de getCompteComptable() côté TS
CREATE OR REPLACE FUNCTION public.fn_get_compte_comptable_banque(
  p_banque TEXT,
  p_devise TEXT
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $func$
DECLARE
  v_norm_banque TEXT;
  v_norm_devise TEXT;
  v_bank_code TEXT;
  v_devise_code TEXT;
BEGIN
  -- Normaliser : uppercase + alphanumeric only
  v_norm_banque := UPPER(REGEXP_REPLACE(COALESCE(p_banque, ''), '[^A-Za-z0-9]', '', 'g'));
  v_norm_devise := UPPER(REGEXP_REPLACE(COALESCE(p_devise, ''), '[^A-Za-z]', '', 'g'));

  -- Détecter le code banque (priorité aux patterns spécifiques)
  v_bank_code :=
    CASE
      WHEN v_norm_banque LIKE '%MAURITIUSCOMMERCIALBANK%' OR v_norm_banque LIKE '%MCB%' THEN '10'
      WHEN v_norm_banque LIKE '%STATEBANKOFMAURITIUS%' OR v_norm_banque LIKE '%SBM%' THEN '20'
      WHEN v_norm_banque LIKE '%ABSABANK%' OR v_norm_banque LIKE '%BARCLAYS%' OR v_norm_banque LIKE '%ABSA%' THEN '30'
      WHEN v_norm_banque LIKE '%BANKONE%' OR v_norm_banque LIKE '%BANK1%' THEN '40'
      WHEN v_norm_banque LIKE '%AFRASIA%' THEN '50'
      WHEN v_norm_banque LIKE '%MAUBANK%' THEN '60'
      WHEN v_norm_banque LIKE '%STANDARDCHARTERED%' OR v_norm_banque LIKE '%STANCHART%' OR v_norm_banque LIKE '%SCB%' THEN '70'
      WHEN v_norm_banque LIKE '%HSBC%' THEN '80'
      WHEN v_norm_banque LIKE '%STATEBANKOFINDIA%' OR v_norm_banque LIKE '%SBIMAURITIUS%' OR v_norm_banque LIKE '%SBI%' THEN '90'
      WHEN v_norm_banque LIKE '%BANKOFBARODA%' OR v_norm_banque LIKE '%BOB%' THEN '91'
      WHEN v_norm_banque LIKE '%ABCBANKING%' OR v_norm_banque LIKE '%ABCBANK%' OR v_norm_banque LIKE '%ABC%' THEN '92'
      WHEN v_norm_banque LIKE '%BNPPARIBAS%' OR v_norm_banque LIKE '%BNP%' THEN '93'
      WHEN v_norm_banque LIKE '%CITIBANK%' OR v_norm_banque LIKE '%CITI%' THEN '94'
      WHEN v_norm_banque LIKE '%HABIBBANK%' OR v_norm_banque LIKE '%HABIB%' THEN '95'
      WHEN v_norm_banque LIKE '%INVESTEC%' THEN '96'
      WHEN v_norm_banque LIKE '%BCP%' OR v_norm_banque LIKE '%BANQUEDECOMMERCE%' THEN '97'
      ELSE '99'  -- Autre / inconnue
    END;

  -- Détecter le code devise
  v_devise_code :=
    CASE v_norm_devise
      WHEN 'MUR' THEN '0'
      WHEN 'EUR' THEN '1'
      WHEN 'USD' THEN '2'
      WHEN 'GBP' THEN '3'
      WHEN 'AUD' THEN '4'
      WHEN 'CAD' THEN '5'
      WHEN 'CHF' THEN '6'
      WHEN 'ZAR' THEN '7'
      WHEN 'INR' THEN '8'
      WHEN '' THEN '0'  -- NULL/vide → MUR par défaut (fallback raisonnable)
      ELSE '9'           -- Autre / inconnue
    END;

  RETURN '512' || v_bank_code || v_devise_code;
END;
$func$;

COMMENT ON FUNCTION public.fn_get_compte_comptable_banque IS
  'Génère le compte comptable PCM (512xxx) selon banque + devise. '
  'Mirroir SQL de lib/accounting/comptes-bancaires.ts:getCompteComptable. '
  'Convention 512<BB><D> — voir migration 234 pour le mapping.';

-- ── Backfill des comptes_bancaires NULL ────────────────────────────────────
DO $$
DECLARE
  v_total_avant   INTEGER;
  v_total_backfill INTEGER;
  v_total_apres   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_avant FROM public.comptes_bancaires WHERE compte_comptable IS NULL;

  UPDATE public.comptes_bancaires
  SET compte_comptable = public.fn_get_compte_comptable_banque(banque, devise)
  WHERE compte_comptable IS NULL;

  GET DIAGNOSTICS v_total_backfill = ROW_COUNT;

  SELECT COUNT(*) INTO v_total_apres FROM public.comptes_bancaires WHERE compte_comptable IS NULL;

  RAISE NOTICE '═════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 234 — Backfill compte_comptable terminé';
  RAISE NOTICE '   Comptes NULL avant : %', v_total_avant;
  RAISE NOTICE '   Comptes backfillés : %', v_total_backfill;
  RAISE NOTICE '   Comptes NULL après : % (devrait être 0)', v_total_apres;
  RAISE NOTICE '═════════════════════════════════════════════════════════';
END $$;

-- ── Trigger BEFORE INSERT/UPDATE (filet de sécurité) ────────────────────────
-- Si le code applicatif oublie de remplir compte_comptable lors d'un INSERT
-- ou si un UPDATE remet à NULL, le trigger remplit automatiquement.
-- C'est un garde-fou : la source de vérité reste le code TS dans
-- lib/accounting/comptes-bancaires.ts, mais on protège la DB d'un INSERT
-- partiel.

CREATE OR REPLACE FUNCTION public.trg_auto_fill_compte_comptable_banque()
RETURNS TRIGGER LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.compte_comptable IS NULL THEN
    NEW.compte_comptable := public.fn_get_compte_comptable_banque(NEW.banque, NEW.devise);
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_auto_fill_compte_comptable_banque ON public.comptes_bancaires;
CREATE TRIGGER trg_auto_fill_compte_comptable_banque
  BEFORE INSERT OR UPDATE ON public.comptes_bancaires
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_fill_compte_comptable_banque();

COMMENT ON TRIGGER trg_auto_fill_compte_comptable_banque ON public.comptes_bancaires IS
  'Garde-fou : remplit automatiquement compte_comptable si NULL lors INSERT/UPDATE. '
  'Source de vérité = lib/accounting/comptes-bancaires.ts (helper TS). Ce trigger '
  'protège la DB des oublis applicatifs.';
