-- ============================================================================
-- Migration 168 — Fix trigger balance-check (séparation INSERT / UPDATE)
-- ============================================================================
--
-- Bug critique introduit par migration 166 : la fonction
-- `trg_check_balance_ref_folio` référence `old_table` (transition table
-- disponible uniquement pour UPDATE) mais elle est appelée depuis un
-- trigger INSERT aussi → erreur 42P01 "relation 'old_table' does not exist"
-- à chaque INSERT sur ecritures_comptables_v2. Bloque :
--   • création d'écritures via le rapprochement bancaire
--   • classification auto des transactions
--   • génération de bulletins paie
--   • toute INSERT manuelle
--
-- Symptôme utilisateur : toast rouge "Erreur insertion écritures: relation
-- 'old_table' does not exist" au clic "Auto-classer" dans /client/rapprochement.
--
-- Fix : séparer en DEUX fonctions distinctes. Celle du INSERT ne référence
-- que new_table. Celle du UPDATE référence new_table + old_table.
-- ============================================================================

-- ── 1. Supprimer les triggers existants (cassés) ─────────────────────────
DROP TRIGGER IF EXISTS tr_balance_check_insert ON public.ecritures_comptables_v2;
DROP TRIGGER IF EXISTS tr_balance_check_update ON public.ecritures_comptables_v2;

-- ── 2. Fonction pour INSERT (new_table seulement) ────────────────────────
CREATE OR REPLACE FUNCTION public.trg_check_balance_ref_folio_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_warnings TEXT := '';
BEGIN
  FOR r IN
    SELECT
      societe_id,
      ref_folio,
      journal,
      SUM(COALESCE(debit_mur, 0))  AS sum_debit,
      SUM(COALESCE(credit_mur, 0)) AS sum_credit
    FROM public.ecritures_comptables_v2
    WHERE ref_folio IS NOT NULL
      AND ref_folio NOT LIKE 'BANK-%'
      AND journal NOT IN ('CLS', 'BNQ')
      AND ref_folio IN (
        SELECT DISTINCT ref_folio FROM new_table WHERE ref_folio IS NOT NULL
      )
    GROUP BY societe_id, ref_folio, journal
    HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
  LOOP
    v_warnings := v_warnings
      || format(E'\n  • societe=%s ref_folio=%s journal=%s : écart = %s MUR',
                r.societe_id, r.ref_folio, r.journal,
                TO_CHAR(r.sum_debit - r.sum_credit, 'FM999999990.00'));
  END LOOP;

  IF v_warnings <> '' THEN
    RAISE WARNING E'[balance-check] ref_folio(s) déséquilibré(s) après INSERT :%', v_warnings;
  END IF;

  RETURN NULL;
END
$$;

-- ── 3. Fonction pour UPDATE (new_table + old_table) ──────────────────────
CREATE OR REPLACE FUNCTION public.trg_check_balance_ref_folio_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_warnings TEXT := '';
BEGIN
  FOR r IN
    SELECT
      societe_id,
      ref_folio,
      journal,
      SUM(COALESCE(debit_mur, 0))  AS sum_debit,
      SUM(COALESCE(credit_mur, 0)) AS sum_credit
    FROM public.ecritures_comptables_v2
    WHERE ref_folio IS NOT NULL
      AND ref_folio NOT LIKE 'BANK-%'
      AND journal NOT IN ('CLS', 'BNQ')
      AND ref_folio IN (
        SELECT ref_folio FROM new_table WHERE ref_folio IS NOT NULL
        UNION
        SELECT ref_folio FROM old_table WHERE ref_folio IS NOT NULL
      )
    GROUP BY societe_id, ref_folio, journal
    HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
  LOOP
    v_warnings := v_warnings
      || format(E'\n  • societe=%s ref_folio=%s journal=%s : écart = %s MUR',
                r.societe_id, r.ref_folio, r.journal,
                TO_CHAR(r.sum_debit - r.sum_credit, 'FM999999990.00'));
  END LOOP;

  IF v_warnings <> '' THEN
    RAISE WARNING E'[balance-check] ref_folio(s) déséquilibré(s) après UPDATE :%', v_warnings;
  END IF;

  RETURN NULL;
END
$$;

-- ── 4. Recréer les triggers avec les BONNES fonctions ────────────────────
CREATE TRIGGER tr_balance_check_insert
  AFTER INSERT ON public.ecritures_comptables_v2
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_balance_ref_folio_insert();

CREATE TRIGGER tr_balance_check_update
  AFTER UPDATE ON public.ecritures_comptables_v2
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_balance_ref_folio_update();

-- ── 5. Supprimer l'ancienne fonction unifiée (obsolète) ──────────────────
DROP FUNCTION IF EXISTS public.trg_check_balance_ref_folio();

COMMENT ON FUNCTION public.trg_check_balance_ref_folio_insert IS
  'Balance-check après INSERT. Émet WARNING si un ref_folio est déséquilibré.';
COMMENT ON FUNCTION public.trg_check_balance_ref_folio_update IS
  'Balance-check après UPDATE. Vérifie ref_folio avant ET après via new_table + old_table.';

DO $$ BEGIN
  RAISE NOTICE '▶ Migration 168 terminée — triggers balance-check séparés INSERT/UPDATE.';
  RAISE NOTICE '  Les INSERT sur ecritures_comptables_v2 fonctionnent à nouveau.';
END $$;
