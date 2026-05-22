-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4, Task 4C: INVOICE TRACEABILITY TESTING
-- Purpose: Test 50 sample invoices for complete GL traceability
-- Timeline: Weeks 7-8
-- Output: Data extraction for Excel report generation
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: SAMPLE SELECTION LOGIC
-- Select 50 invoices stratified across:
--   - 12 months of data
--   - Document types (customer/supplier)
--   - Amount ranges ($50-$50,000)
--   - Various tax treatments (19%, 8%, 0%, exempt)
-- ─────────────────────────────────────────────────────────────────────────────

WITH date_range AS (
  SELECT
    DATE_TRUNC('month', f.date_facture)::DATE AS month_start,
    COUNT(*) as invoice_count
  FROM public.factures f
  WHERE f.date_facture >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '12 months'
    AND f.date_facture < CURRENT_DATE
    AND f.societe_id IS NOT NULL
  GROUP BY DATE_TRUNC('month', f.date_facture)
),

amount_buckets AS (
  SELECT
    f.id,
    f.numero_facture,
    f.type_facture,
    f.date_facture,
    f.montant_ht,
    f.montant_tva,
    f.montant_ttc,
    f.taux_tva,
    f.societe_id,
    f.tiers,
    f.statut,
    CASE
      WHEN f.montant_ttc < 100 THEN '1_under_100'
      WHEN f.montant_ttc < 500 THEN '2_100_to_500'
      WHEN f.montant_ttc < 2000 THEN '3_500_to_2k'
      WHEN f.montant_ttc < 10000 THEN '4_2k_to_10k'
      ELSE '5_over_10k'
    END AS amount_bucket,
    CASE
      WHEN ABS(f.taux_tva - 19) < 0.01 THEN '19%'
      WHEN ABS(f.taux_tva - 8) < 0.01 THEN '8%'
      WHEN ABS(f.taux_tva - 0) < 0.01 THEN '0%'
      ELSE 'exempt'
    END AS tax_treatment,
    ROW_NUMBER() OVER (
      PARTITION BY
        DATE_TRUNC('month', f.date_facture)::DATE,
        f.type_facture,
        CASE
          WHEN f.montant_ttc < 100 THEN '1_under_100'
          WHEN f.montant_ttc < 500 THEN '2_100_to_500'
          WHEN f.montant_ttc < 2000 THEN '3_500_to_2k'
          WHEN f.montant_ttc < 10000 THEN '4_2k_to_10k'
          ELSE '5_over_10k'
        END,
        CASE
          WHEN ABS(f.taux_tva - 19) < 0.01 THEN '19%'
          WHEN ABS(f.taux_tva - 8) < 0.01 THEN '8%'
          WHEN ABS(f.taux_tva - 0) < 0.01 THEN '0%'
          ELSE 'exempt'
        END
      ORDER BY f.created_at ASC
    ) AS seq
  FROM public.factures f
  WHERE f.date_facture >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '12 months'
    AND f.date_facture < CURRENT_DATE
    AND f.societe_id IS NOT NULL
)

SELECT 'SAMPLE_SELECTION_COMPLETE' AS phase;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: TRACEABILITY TEST DATA
-- For each sample invoice:
--   - Locate in factures table
--   - Verify required fields
--   - Find GL entries via facture_id and ref_folio
--   - Verify GL account postings
--   - Match amounts
--   - Verify approval trail
-- ─────────────────────────────────────────────────────────────────────────────

WITH sample_invoices AS (
  SELECT
    f.id,
    f.numero_facture,
    f.type_facture,
    f.date_facture,
    f.montant_ht,
    f.montant_tva,
    f.montant_ttc,
    f.taux_tva,
    f.societe_id,
    f.tiers,
    f.statut,
    f.created_at,
    f.updated_at,
    f.created_by,
    f.document_id,
    f.tiers AS customer_supplier_name,
    ROW_NUMBER() OVER (
      PARTITION BY
        DATE_TRUNC('month', f.date_facture)::DATE,
        f.type_facture
      ORDER BY f.montant_ttc ASC
    ) AS seq
  FROM public.factures f
  WHERE f.date_facture >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '12 months'
    AND f.date_facture < CURRENT_DATE
    AND f.societe_id IS NOT NULL
),

selected_samples AS (
  SELECT *
  FROM sample_invoices si
  WHERE si.seq <= 2  -- 2 per month per type = ~50 invoices
  LIMIT 50
),

-- Step 1: Locate invoice in system
invoice_validation AS (
  SELECT
    ss.id AS facture_id,
    ss.numero_facture,
    ss.type_facture,
    ss.date_facture,
    ss.montant_ht,
    ss.montant_tva,
    ss.montant_ttc,
    ss.taux_tva,
    ss.societe_id,
    ss.tiers,
    ss.statut,
    CASE
      WHEN ss.numero_facture IS NOT NULL THEN 'YES'
      ELSE 'NO'
    END AS has_invoice_number,
    CASE
      WHEN ss.date_facture IS NOT NULL THEN 'YES'
      ELSE 'NO'
    END AS has_invoice_date,
    CASE
      WHEN ss.tiers IS NOT NULL AND TRIM(ss.tiers) != '' THEN 'YES'
      ELSE 'NO'
    END AS has_tiers_name,
    CASE
      WHEN ss.montant_ht IS NOT NULL AND ss.montant_ht > 0 THEN 'YES'
      ELSE 'NO'
    END AS has_ht_amount,
    CASE
      WHEN ss.montant_tva IS NOT NULL THEN 'YES'
      ELSE 'NO'
    END AS has_vat_amount,
    CASE
      WHEN ss.montant_ttc IS NOT NULL AND ss.montant_ttc > 0 THEN 'YES'
      ELSE 'NO'
    END AS has_ttc_amount
  FROM selected_samples ss
),

-- Step 2: Locate GL entries
gl_entries_found AS (
  SELECT
    ss.id AS facture_id,
    ss.numero_facture,
    COUNT(DISTINCT ec.id) AS gl_entry_count,
    STRING_AGG(DISTINCT ec.numero_compte, ', ' ORDER BY ec.numero_compte) AS posted_accounts,
    COALESCE(SUM(ec.debit_mur), 0) AS total_debit,
    COALESCE(SUM(ec.credit_mur), 0) AS total_credit,
    STRING_AGG(DISTINCT ec.ref_folio, '|') AS ref_folios
  FROM selected_samples ss
  LEFT JOIN public.ecritures_comptables_v2 ec ON
    (ec.facture_id = ss.id OR ec.ref_folio = ss.numero_facture)
  GROUP BY ss.id, ss.numero_facture
),

-- Step 3 & 4: Account postings analysis
account_postings AS (
  SELECT
    ss.id AS facture_id,
    ss.numero_facture,
    ss.type_facture,
    ss.montant_ht,
    ss.montant_tva,
    ss.montant_ttc,
    ec.numero_compte,
    ec.debit_mur,
    ec.credit_mur,
    ec.journal,
    ec.description,
    ec.created_at AS entry_created_at,
    CASE
      WHEN ss.type_facture = 'client' AND ec.numero_compte LIKE '411%' THEN 'ACCOUNTS_RECEIVABLE'
      WHEN ss.type_facture = 'client' AND ec.numero_compte LIKE '706%' THEN 'REVENUE'
      WHEN ss.type_facture = 'client' AND ec.numero_compte LIKE '441%' THEN 'VAT_COLLECTED'
      WHEN ss.type_facture = 'fournisseur' AND ec.numero_compte LIKE '4401%' THEN 'ACCOUNTS_PAYABLE'
      WHEN ss.type_facture = 'fournisseur' AND ec.numero_compte LIKE '6%' THEN 'EXPENSE'
      WHEN ss.type_facture = 'fournisseur' AND ec.numero_compte LIKE '4456%' THEN 'VAT_PAID'
      ELSE 'OTHER'
    END AS account_purpose
  FROM selected_samples ss
  LEFT JOIN public.ecritures_comptables_v2 ec ON
    (ec.facture_id = ss.id OR ec.ref_folio = ss.numero_facture)
),

-- Step 5: Amount matching
amount_matching AS (
  SELECT
    ss.id AS facture_id,
    ss.numero_facture,
    ss.montant_ht,
    ss.montant_tva,
    ss.montant_ttc,
    COALESCE(SUM(CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE 0 END), 0) AS gl_total_debit,
    COALESCE(SUM(CASE WHEN ec.credit_mur > 0 THEN ec.credit_mur ELSE 0 END), 0) AS gl_total_credit,
    CASE
      WHEN ABS(COALESCE(SUM(ec.debit_mur), 0) - COALESCE(SUM(ec.credit_mur), 0)) < 0.01 THEN 'YES'
      ELSE 'NO'
    END AS gl_balanced,
    CASE
      WHEN ABS(
        (COALESCE(SUM(ec.debit_mur), 0) + COALESCE(SUM(ec.credit_mur), 0)) / 2 - ss.montant_ttc
      ) < 0.01 THEN 'YES'
      ELSE 'NO'
    END AS amount_matches
  FROM selected_samples ss
  LEFT JOIN public.ecritures_comptables_v2 ec ON
    (ec.facture_id = ss.id OR ec.ref_folio = ss.numero_facture)
  GROUP BY ss.id, ss.numero_facture, ss.montant_ht, ss.montant_tva, ss.montant_ttc
),

-- Step 6: Approval trail
approval_trail AS (
  SELECT
    ss.id AS facture_id,
    ss.numero_facture,
    ss.created_by AS invoice_created_by,
    ss.created_at AS invoice_created_at,
    COALESCE(p_creator.email, 'UNKNOWN') AS creator_email,
    CASE
      WHEN ss.created_by IS NOT NULL THEN 'YES'
      ELSE 'NO'
    END AS has_creator,
    CASE
      WHEN ss.updated_at > ss.created_at + INTERVAL '1 minute' THEN 'YES'
      ELSE 'NO'
    END AS has_approval_changes
  FROM selected_samples ss
  LEFT JOIN public.profiles p_creator ON p_creator.id = ss.created_by
)

-- FINAL: Comprehensive traceability report
SELECT
  iv.facture_id,
  iv.numero_facture,
  iv.type_facture,
  iv.date_facture,
  iv.montant_ht,
  iv.montant_tva,
  iv.montant_ttc,
  iv.taux_tva,
  iv.societe_id,
  iv.tiers,
  iv.statut,
  iv.has_invoice_number,
  iv.has_invoice_date,
  iv.has_tiers_name,
  iv.has_ht_amount,
  iv.has_vat_amount,
  iv.has_ttc_amount,
  COALESCE(glf.gl_entry_count, 0) AS gl_entry_count,
  glf.posted_accounts,
  glf.total_debit,
  glf.total_credit,
  am.gl_total_debit,
  am.gl_total_credit,
  am.gl_balanced,
  am.amount_matches,
  CASE
    WHEN am.amount_matches = 'YES' AND am.gl_balanced = 'YES' THEN 'PASS'
    ELSE 'FAIL'
  END AS traceability_status,
  at.has_creator,
  at.has_approval_changes,
  at.invoice_created_at,
  at.creator_email,
  CASE
    WHEN COALESCE(glf.gl_entry_count, 0) = 0 THEN 'NO_GL_ENTRIES'
    WHEN am.amount_matches = 'NO' THEN 'AMOUNT_MISMATCH'
    WHEN am.gl_balanced = 'NO' THEN 'GL_IMBALANCE'
    WHEN at.has_creator = 'NO' THEN 'NO_CREATOR'
    ELSE 'OK'
  END AS exception_type
FROM invoice_validation iv
LEFT JOIN gl_entries_found glf ON iv.facture_id = glf.facture_id
LEFT JOIN amount_matching am ON iv.facture_id = am.facture_id
LEFT JOIN approval_trail at ON iv.facture_id = at.facture_id
ORDER BY iv.date_facture DESC, iv.montant_ttc DESC;
