-- ═══════════════════════════════════════════════════════════════════════════
-- Query 1: GENERAL LEDGER EXPORT (12 months)
-- ═══════════════════════════════════════════════════════════════════════════
-- Exports ALL ecritures_comptables_v2 rows from past 12 months
-- Format: CSV with all required columns for Big 4 audit
-- Sorted: By date, then by account number
-- Validation: Can be used to verify SUM(debit) = SUM(credit) for each month
--
-- Usage:
--   psql [connection] -c "COPY ($(cat 01_general_ledger_12months.sql)) TO STDOUT CSV HEADER;"
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  ec.date_ecriture AS date,
  ec.numero_compte AS account,
  COALESCE(ec.debit_mur, 0) AS debit,
  COALESCE(ec.credit_mur, 0) AS credit,
  ec.description AS description,
  ec.journal AS journal,
  ec.ref_folio AS ref_folio,
  au_creator.email AS created_by,
  au_approver.email AS approved_by,
  ec.created_at AS created_at,
  ec.exercice AS fiscal_year,
  s.nom AS societe_name,
  pcm.nom_compte AS account_name
FROM
  public.ecritures_comptables_v2 ec
  LEFT JOIN public.societes s ON ec.societe_id = s.id
  LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  LEFT JOIN public.profiles au_creator ON ec.created_by = au_creator.id
  LEFT JOIN public.profiles au_approver ON ec.approved_by = au_approver.id
WHERE
  -- Past 12 months from today
  ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  AND ec.date_ecriture < CURRENT_DATE + INTERVAL '1 day'
ORDER BY
  ec.date_ecriture ASC,
  ec.numero_compte ASC,
  ec.id ASC;
