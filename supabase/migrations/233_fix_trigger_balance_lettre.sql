-- ============================================================================
-- Migration 233 — Fix trigger trg_check_balance_lettre (ne pas planter sur INSERT)
-- ============================================================================
--
-- BUG signalé en prod (2026-05-03) :
--   ERROR: 42P01: relation "old_table" does not exist
--   QUERY: ... lettre IN (SELECT lettre FROM old_table ...) ...
--   CONTEXT: PL/pgSQL function trg_check_balance_lettre() line 7
--
-- CAUSE : la fonction définie en migration 224 référence à la fois `new_table`
-- ET `old_table` dans son corps (UNION). Mais le trigger AFTER INSERT
-- (ligne 102) ne déclare que `REFERENCING NEW TABLE AS new_table` — pas
-- de OLD TABLE car INSERT n'a pas d'anciennes valeurs.
--
-- Conséquence : tout INSERT dans ecritures_comptables_v2 fait planter le
-- trigger qui tente d'accéder à `old_table` inexistante → la transaction
-- est ROLLBACK, l'INSERT échoue.
--
-- Le bug ne s'était probablement pas révélé avant parce que la majorité
-- des chemins d'écriture passaient par RPC ou par des INSERTs en lot où
-- l'erreur était silencée. Mais sur un INSERT direct depuis SQL editor
-- (cas du backfill SKYCALL), il bloque.
--
-- FIX : dispatch selon TG_OP. INSERT n'utilise que new_table. UPDATE
-- utilise les 2. DELETE serait géré pareil mais le trigger n'est pas
-- défini sur DELETE actuellement.
--
-- IDEMPOTENT (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_check_balance_lettre()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  r RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR r IN
      SELECT
        ecr.societe_id, ecr.lettre,
        SUM(COALESCE(ecr.debit_mur, 0))  AS sum_debit,
        SUM(COALESCE(ecr.credit_mur, 0)) AS sum_credit
      FROM public.ecritures_comptables_v2 ecr
      WHERE ecr.lettre IS NOT NULL
        AND ecr.lettre IN (SELECT DISTINCT lettre FROM new_table WHERE lettre IS NOT NULL)
      GROUP BY ecr.societe_id, ecr.lettre
      HAVING ABS(SUM(COALESCE(ecr.debit_mur, 0)) - SUM(COALESCE(ecr.credit_mur, 0))) > 0.01
    LOOP
      RAISE WARNING '[balance-check-lettre/INSERT] societe=% lettre=% : sum_debit=% sum_credit=% (ecart=%)',
        r.societe_id, r.lettre, r.sum_debit, r.sum_credit, (r.sum_debit - r.sum_credit);
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR r IN
      SELECT
        ecr.societe_id, ecr.lettre,
        SUM(COALESCE(ecr.debit_mur, 0))  AS sum_debit,
        SUM(COALESCE(ecr.credit_mur, 0)) AS sum_credit
      FROM public.ecritures_comptables_v2 ecr
      WHERE ecr.lettre IS NOT NULL
        AND ecr.lettre IN (
          SELECT DISTINCT lettre FROM (
            SELECT lettre FROM new_table WHERE lettre IS NOT NULL
            UNION ALL
            SELECT lettre FROM old_table WHERE lettre IS NOT NULL
          ) s
        )
      GROUP BY ecr.societe_id, ecr.lettre
      HAVING ABS(SUM(COALESCE(ecr.debit_mur, 0)) - SUM(COALESCE(ecr.credit_mur, 0))) > 0.01
    LOOP
      RAISE WARNING '[balance-check-lettre/UPDATE] societe=% lettre=% : sum_debit=% sum_credit=% (ecart=%)',
        r.societe_id, r.lettre, r.sum_debit, r.sum_credit, (r.sum_debit - r.sum_credit);
    END LOOP;
  END IF;

  RETURN NULL; -- STATEMENT trigger
END;
$func$;

COMMENT ON FUNCTION public.trg_check_balance_lettre IS
  'Verifie apres chaque INSERT/UPDATE de la colonne lettre que sum debit = '
  'sum credit par (societe_id, lettre). Dispatch selon TG_OP pour ne pas '
  'rechercher old_table sur INSERT (fix migration 233 — bug initial mig 224). '
  'RAISE WARNING (non bloquant). Visible dans les logs Postgres pour audit.';
