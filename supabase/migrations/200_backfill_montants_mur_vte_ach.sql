-- ============================================================================
-- Migration 164 — Backfill montants MUR pour les écritures VTE/ACH multi-devises
-- ============================================================================
--
-- Contexte : migration 158+160 ont corrigé le plan comptable, mais les
-- écritures VTE/ACH existantes en devise étrangère (USD/EUR/…) ont été
-- écrites avec `debit_mur = facture.montant_ttc` en devise d'origine (bug
-- dans lib/accounting/ecritures-factures.ts — corrigé séparément côté TS).
--
-- Symptôme observé (capture Grand Livre) : client SKYCALL sur compte 411 avec
--   • VTE débit 19 018 MUR  (= 420 USD non convertis)
--   • BNQ crédit 1 038 119 MUR (= correctement converti en MUR)
--   → solde 411 faux de ~55×
--
-- Cette migration corrige en PLACE le montant MUR de chaque ligne VTE/ACH
-- liée à une facture multi-devise, SANS toucher au lettrage (`lettre`,
-- `date_lettrage`), au compte (`numero_compte`), ni à l'id. Seul
-- `debit_mur` / `credit_mur` / `nom_compte` bougent.
--
-- Pour chaque ecriture_v2 avec facture_id lié et journal in (VTE,ACH) :
--   • ligne 411 ou 401 (TTC) : debit/credit_mur ← facture.montant_mur
--   • ligne 706 ou 607 (HT)  : ← montant_ht × (montant_mur / montant_ttc)
--   • ligne 4457 ou 4456     : ← ttc_mur - ht_mur (équilibre garanti)
--
-- Fallback : si facture.montant_mur est NULL ou 0, on calcule via
-- montant_ttc × taux_change. Si taux_change = 1 (MUR natif), rien à faire.
--
-- Idempotente : ne change que les lignes dont le montant actuel diffère du
-- montant attendu (filtre ABS(diff) > 0.01).
-- ============================================================================

-- ─── CTE : calcul des montants MUR attendus par écriture ──────────────────
WITH expected AS (
  SELECT
    e.id,
    e.numero_compte,
    e.debit_mur  AS current_debit,
    e.credit_mur AS current_credit,
    f.devise,
    COALESCE(NULLIF(f.taux_change, 0), 1) AS taux,
    f.montant_ttc,
    f.montant_ht,
    f.montant_tva,
    CASE
      WHEN f.montant_mur IS NOT NULL AND f.montant_mur > 0 THEN f.montant_mur
      ELSE f.montant_ttc * COALESCE(NULLIF(f.taux_change, 0), 1)
    END AS ttc_mur,
    CASE
      WHEN f.montant_ttc > 0 THEN
        f.montant_ht * (
          CASE
            WHEN f.montant_mur IS NOT NULL AND f.montant_mur > 0 THEN f.montant_mur
            ELSE f.montant_ttc * COALESCE(NULLIF(f.taux_change, 0), 1)
          END / f.montant_ttc
        )
      ELSE 0
    END AS ht_mur
  FROM public.ecritures_comptables_v2 e
  JOIN public.factures f ON f.id = e.facture_id
  WHERE e.facture_id IS NOT NULL
    AND e.journal IN ('VTE', 'ACH')
    AND COALESCE(f.devise, 'MUR') != 'MUR'
    -- On NE touche PAS si devise = MUR (rien à convertir)
),
target AS (
  SELECT
    id,
    numero_compte,
    current_debit,
    current_credit,
    devise,
    CASE
      -- Client 411 : debit TTC MUR
      WHEN numero_compte = '411' THEN ttc_mur
      -- Achats 607 : debit HT MUR
      WHEN numero_compte = '607' THEN ROUND(ht_mur::numeric, 2)
      -- TVA deductible 4456 : debit TVA MUR = ttc_mur - ht_mur
      WHEN numero_compte = '4456' THEN ROUND((ttc_mur - ht_mur)::numeric, 2)
      ELSE current_debit
    END AS new_debit,
    CASE
      -- Fournisseur 401 : credit TTC MUR
      WHEN numero_compte = '401' THEN ttc_mur
      -- Prestations 706 : credit HT MUR
      WHEN numero_compte = '706' THEN ROUND(ht_mur::numeric, 2)
      -- TVA collectee 4457 : credit TVA MUR = ttc_mur - ht_mur
      WHEN numero_compte = '4457' THEN ROUND((ttc_mur - ht_mur)::numeric, 2)
      ELSE current_credit
    END AS new_credit
  FROM expected
)
UPDATE public.ecritures_comptables_v2 e
SET
  debit_mur  = t.new_debit,
  credit_mur = t.new_credit
FROM target t
WHERE e.id = t.id
  AND (
    ABS(COALESCE(e.debit_mur, 0)  - COALESCE(t.new_debit, 0))  > 0.01 OR
    ABS(COALESCE(e.credit_mur, 0) - COALESCE(t.new_credit, 0)) > 0.01
  );

-- ─── Rapport ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_still_wrong INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_still_wrong
  FROM public.ecritures_comptables_v2 e
  JOIN public.factures f ON f.id = e.facture_id
  WHERE e.journal IN ('VTE', 'ACH')
    AND COALESCE(f.devise, 'MUR') != 'MUR'
    AND e.numero_compte IN ('411', '401')
    AND ABS(COALESCE(e.debit_mur, 0) + COALESCE(e.credit_mur, 0)
            - COALESCE(f.montant_mur, f.montant_ttc * COALESCE(NULLIF(f.taux_change, 0), 1))) > 1.0;

  IF v_still_wrong > 0 THEN
    RAISE WARNING 'Migration 164: % écritures VTE/ACH multi-devises ont encore un écart > 1 MUR après backfill — vérifier manuellement', v_still_wrong;
  ELSE
    RAISE NOTICE 'Migration 164 terminée — toutes les écritures VTE/ACH multi-devises sont alignées sur le montant MUR de la facture';
  END IF;
END $$;
