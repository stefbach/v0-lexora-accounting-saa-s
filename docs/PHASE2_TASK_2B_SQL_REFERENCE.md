# PHASE 2, TASK 2B — SQL Reference Queries
## Banking Extraction — Complete Query Handbook

---

## Quick Navigation

1. [GL Balance Queries](#1-gl-balance-queries)
2. [Bank Statement Balance Queries](#2-bank-statement-balance-queries)
3. [Transaction Matching Queries](#3-transaction-matching-queries)
4. [Unmatched & Outstanding Queries](#4-unmatched--outstanding-queries)
5. [Variance Analysis Queries](#5-variance-analysis-queries)
6. [Forex & Multi-Currency Queries](#6-forex--multi-currency-queries)
7. [Audit Trail & Evidence Queries](#7-audit-trail--evidence-queries)

---

## 1. GL Balance Queries

### 1.1 Monthly GL Balance (by account, by company)

```sql
-- Get GL balance for account 5121 (Comptes Bancaires)
-- Grouped by month-end, per company
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date + interval '1 month' - interval '1 day' AS period_end,
  ec.societe_id,
  s.nom AS societe_nom,
  ec.numero_compte,
  ROUND(SUM(CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE 0 END)::numeric, 2) AS total_debits,
  ROUND(SUM(CASE WHEN ec.credit_mur > 0 THEN ec.credit_mur ELSE 0 END)::numeric, 2) AS total_credits,
  ROUND(SUM(ec.debit_mur - ec.credit_mur)::numeric, 2) AS balance_mur,
  COUNT(DISTINCT ec.id) AS nb_entries
FROM ecritures_comptables_v2 ec
JOIN societes s ON s.id = ec.societe_id
WHERE ec.numero_compte IN ('5121', '51210', '512100', '512101')  -- canonical + legacy codes
  AND ec.date_ecriture >= '2025-07-01'  -- FY2025-2026 start
  AND ec.date_ecriture <= '2026-06-30'  -- FY2025-2026 end
  AND ec.societe_id IN (
    SELECT id FROM societes WHERE client_id = [CLIENT_ID]
  )
GROUP BY
  period_end,
  ec.societe_id,
  s.nom,
  ec.numero_compte
ORDER BY
  ec.societe_id,
  period_end;
```

**Parameters:**
- `[CLIENT_ID]` — UUID of the client (e.g., DDS Mauritius Ltd or OCC)

**Output columns:**
- `period_end` — Last day of month (e.g., 2025-07-31)
- `societe_nom` — Company name
- `numero_compte` — Account code (canonical 4-digit)
- `total_debits` — Sum of all debits for month (MUR)
- `total_credits` — Sum of all credits for month (MUR)
- `balance_mur` — Closing balance for month (debit - credit)
- `nb_entries` — Number of GL entries posted

---

### 1.2 Opening Balance (start of period for reconciliation)

```sql
-- Get opening balance (as of 2025-07-01) for each account
SELECT
  ec.societe_id,
  s.nom AS societe_nom,
  ec.numero_compte,
  ROUND(SUM(ec.debit_mur - ec.credit_mur)::numeric, 2) AS opening_balance,
  MAX(ec.date_ecriture) AS last_entry_date
FROM ecritures_comptables_v2 ec
JOIN societes s ON s.id = ec.societe_id
WHERE ec.numero_compte IN ('5121', '51210', '512100', '512101')
  AND ec.date_ecriture < '2025-07-01'  -- Before FY start
  AND ec.societe_id IN (SELECT id FROM societes WHERE client_id = [CLIENT_ID])
GROUP BY
  ec.societe_id,
  s.nom,
  ec.numero_compte;
```

---

### 1.3 Daily GL Balance Progression (for detailed reconciliation)

```sql
-- Show daily cumulative GL balance throughout the month
-- Useful for matching daily bank statements
WITH daily_entries AS (
  SELECT
    ec.date_ecriture::date AS entry_date,
    ec.societe_id,
    ec.numero_compte,
    SUM(ec.debit_mur - ec.credit_mur) AS daily_change
  FROM ecritures_comptables_v2 ec
  WHERE ec.numero_compte IN ('5121', '51210', '512100', '512101')
    AND ec.date_ecriture >= [START_DATE]
    AND ec.date_ecriture <= [END_DATE]
  GROUP BY
    entry_date,
    ec.societe_id,
    ec.numero_compte
)
SELECT
  entry_date,
  societe_id,
  numero_compte,
  daily_change,
  SUM(daily_change) OVER (
    PARTITION BY societe_id, numero_compte
    ORDER BY entry_date
  ) AS cumulative_balance
FROM daily_entries
ORDER BY
  societe_id,
  numero_compte,
  entry_date;
```

**Parameters:**
- `[START_DATE]` — Start of month (e.g., '2025-07-01')
- `[END_DATE]` — End of month (e.g., '2025-07-31')

---

## 2. Bank Statement Balance Queries

### 2.1 Monthly Bank Statement Summary

```sql
-- Get bank statement balance from releves_bancaires
-- One row per account per month
SELECT
  rb.periode,
  rb.societe_id,
  s.nom AS societe_nom,
  cb.numero_compte,
  cb.devise,
  cb.nom AS account_name,
  rb.solde_ouverture AS opening_balance,
  rb.total_debits,
  rb.total_credits,
  rb.solde_cloture AS closing_balance,
  rb.solde_ouverture + rb.total_credits - rb.total_debits AS calculated_balance,
  COUNT(tb.id) AS transaction_count,
  rb.statut_rapprochement,
  rb.created_at
FROM releves_bancaires rb
JOIN societes s ON s.id = rb.societe_id
JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
LEFT JOIN transactions_bancaires tb ON tb.releve_id = rb.id
WHERE rb.societe_id IN (SELECT id FROM societes WHERE client_id = [CLIENT_ID])
  AND rb.periode >= '2025-07'  -- FY2025-2026 start
  AND rb.periode <= '2026-06'  -- FY2025-2026 end
GROUP BY
  rb.id,
  rb.periode,
  rb.societe_id,
  s.nom,
  cb.id,
  cb.numero_compte,
  cb.devise,
  cb.nom,
  rb.solde_ouverture,
  rb.total_debits,
  rb.total_credits,
  rb.solde_cloture,
  rb.statut_rapprochement,
  rb.created_at
ORDER BY
  rb.societe_id,
  rb.periode;
```

**Output columns:**
- `periode` — YYYY-MM format
- `numero_compte` — Account # (e.g., 512100)
- `devise` — Currency (MUR, EUR, etc.)
- `opening_balance` — Balance as of month start
- `total_debits`, `total_credits` — Movements during month
- `closing_balance` — Balance as of month-end
- `calculated_balance` — Computed: opening + credits - debits (should equal closing_balance)

---

### 2.2 Bank Statement Details (all transactions in statement)

```sql
-- List all transactions from a specific bank statement
-- Used to populate "Bank Section" of reconciliation report
SELECT
  rb.periode,
  rb.date_fin AS statement_date,
  cb.numero_compte,
  tb.id AS tx_id,
  tb.date_transaction,
  tb.date_valeur,
  tb.libelle_banque,
  tb.reference,
  ROUND(tb.debit::numeric, 2) AS debit,
  ROUND(tb.credit::numeric, 2) AS credit,
  ROUND(tb.montant_mur::numeric, 2) AS montant_mur,
  tb.devise_origine,
  tb.taux_change_applique,
  tb.statut_lettrage,
  CASE
    WHEN tb.statut_lettrage = 'lettre' THEN '✓ Matched'
    WHEN CURRENT_DATE - tb.date_transaction > 30 THEN '🚩 OLD'
    ELSE '⏳ Pending'
  END AS reconciliation_status
FROM releves_bancaires rb
JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
LEFT JOIN transactions_bancaires tb ON tb.releve_id = rb.id
WHERE rb.societe_id = [SOCIETE_ID]
  AND rb.compte_bancaire_id = [COMPTE_ID]
  AND rb.periode = [PERIOD]  -- e.g., '2025-07'
ORDER BY
  tb.date_transaction ASC;
```

**Parameters:**
- `[SOCIETE_ID]` — UUID of company
- `[COMPTE_ID]` — UUID of bank account
- `[PERIOD]` — YYYY-MM format

---

## 3. Transaction Matching Queries

### 3.1 Matched Transactions (via lettrages)

```sql
-- All transactions that have been matched to GL entries
SELECT
  tb.id AS bank_tx_id,
  tb.date_transaction AS bank_tx_date,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS bank_amount,
  tb.montant_mur AS bank_amount_mur,
  COALESCE(tb.devise_origine, 'MUR') AS bank_currency,
  tb.libelle_banque,
  tb.reference,
  
  l.id AS lettrage_id,
  l.date_lettrage,
  l.montant_lettre,
  l.notes AS lettrage_notes,
  
  ec.id AS gl_entry_id,
  ec.date_ecriture AS gl_entry_date,
  ec.numero_compte AS gl_account,
  CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END AS gl_amount,
  ec.journal_code,
  ec.reference AS gl_reference,
  ec.description,
  
  0 AS days_unmatched,
  'matched' AS match_status
FROM transactions_bancaires tb
JOIN lettrages l ON l.transaction_bancaire_id = tb.id
JOIN ecritures_comptables_v2 ec ON ec.id = l.ecriture_id
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.date_transaction >= '2025-07-01'
  AND tb.date_transaction <= '2026-06-30'
ORDER BY
  tb.date_transaction ASC;
```

**Output:** All matched transactions with GL cross-reference

---

### 3.2 Unmatched Transactions (no lettrage)

```sql
-- All transactions NOT matched to GL entries
SELECT
  tb.id AS bank_tx_id,
  tb.date_transaction AS bank_tx_date,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS bank_amount,
  tb.montant_mur AS bank_amount_mur,
  COALESCE(tb.devise_origine, 'MUR') AS bank_currency,
  tb.libelle_banque,
  tb.reference,
  tb.statut_lettrage,
  tb.notes AS bank_notes,
  
  CURRENT_DATE - tb.date_transaction AS days_unmatched,
  CASE
    WHEN CURRENT_DATE - tb.date_transaction > 30 THEN '🚩 AUDIT FLAG'
    WHEN CURRENT_DATE - tb.date_transaction > 7 THEN '⚠️ WARNING'
    ELSE 'OK'
  END AS audit_status,
  
  'unmatched' AS match_status
FROM transactions_bancaires tb
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.date_transaction >= '2025-07-01'
  AND tb.date_transaction <= '2026-06-30'
  AND NOT EXISTS (
    SELECT 1 FROM lettrages l WHERE l.transaction_bancaire_id = tb.id
  )
ORDER BY
  tb.date_transaction ASC;
```

**Output:** Unmatched transactions with age flagging

---

### 3.3 Partial/Fuzzy Matches (for investigation)

```sql
-- Find unmatched bank transactions that may have GL entries
-- Match by:
-- 1. Amount (within 2%)
-- 2. Date (within 5 days)
-- 3. Libelle substring match
SELECT
  tb.id AS bank_tx_id,
  tb.date_transaction,
  tb.libelle_banque,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS bank_amount,
  tb.montant_mur,
  
  ec.id AS potential_gl_entry_id,
  ec.date_ecriture,
  ec.description,
  CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END AS gl_amount,
  ABS(ec.date_ecriture - tb.date_transaction) AS date_diff_days,
  
  ROUND(
    100.0 * ABS(
      (CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END) - 
      (CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END)
    ) / NULLIF(CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END, 0),
    2
  ) AS amount_diff_percent,
  
  CASE
    WHEN ABS(ec.date_ecriture - tb.date_transaction) <= 5
      AND ABS(
        (CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END) - 
        (CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END)
      ) / NULLIF(CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END, 0) < 0.02
      AND tb.libelle_banque ILIKE '%' || SPLIT_PART(ec.description, ' ', 1) || '%'
    THEN 'HIGH CONFIDENCE'
    ELSE 'LOW CONFIDENCE'
  END AS match_confidence
FROM transactions_bancaires tb
CROSS JOIN ecritures_comptables_v2 ec
WHERE tb.societe_id = [SOCIETE_ID]
  AND ec.societe_id = [SOCIETE_ID]
  AND tb.date_transaction >= '2025-07-01'
  AND tb.date_transaction <= '2026-06-30'
  AND ABS(ec.date_ecriture - tb.date_transaction) <= 5
  AND NOT EXISTS (
    SELECT 1 FROM lettrages l WHERE l.transaction_bancaire_id = tb.id
  )
ORDER BY
  match_confidence DESC,
  amount_diff_percent ASC;
```

---

## 4. Unmatched & Outstanding Queries

### 4.1 Outstanding Deposits (Awaiting GL Posting)

```sql
-- Bank received payment, but GL entry not yet posted
-- Typically: customer payments, vendor credits, bank interest
SELECT
  tb.id,
  tb.date_transaction,
  CURRENT_DATE - tb.date_transaction AS days_pending,
  tb.libelle_banque,
  tb.credit AS deposit_amount,
  tb.montant_mur,
  tb.reference,
  tb.statut_lettrage,
  CASE
    WHEN CURRENT_DATE - tb.date_transaction > 30 THEN '🚩 CRITICAL'
    WHEN CURRENT_DATE - tb.date_transaction > 7 THEN '⚠️ WARNING'
    ELSE 'NORMAL'
  END AS age_category
FROM transactions_bancaires tb
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.compte_bancaire_id = [COMPTE_ID]
  AND tb.credit > 0  -- Deposit/credit side
  AND tb.date_transaction >= [MONTH_START]
  AND tb.date_transaction <= [MONTH_END]
  AND tb.statut_lettrage IN ('en_attente', 'manuel_suspend')
  AND NOT EXISTS (
    SELECT 1 FROM lettrages l WHERE l.transaction_bancaire_id = tb.id
  )
ORDER BY
  tb.date_transaction ASC;
```

---

### 4.2 Outstanding Checks (Accrued but not Cleared)

```sql
-- GL entry posted (expense accrued), but payment not yet cleared by bank
-- Check for outgoing payments (debits) with GL accrual but no bank posting
SELECT
  ec.id AS gl_entry_id,
  ec.date_ecriture,
  CURRENT_DATE - ec.date_ecriture AS days_uncleared,
  ec.description,
  ec.debit_mur AS accrual_amount,
  ec.reference,
  ec.journal_code,
  
  CASE
    WHEN CURRENT_DATE - ec.date_ecriture > 30 THEN '🚩 CRITICAL'
    WHEN CURRENT_DATE - ec.date_ecriture > 7 THEN '⚠️ WARNING'
    ELSE 'NORMAL'
  END AS age_category,
  
  'ACCRUED - AWAITING BANK CLEARANCE' AS classification
FROM ecritures_comptables_v2 ec
WHERE ec.societe_id = [SOCIETE_ID]
  AND ec.numero_compte IN ('5121', '51210', '512100', '512101')
  AND ec.debit_mur > 0  -- Debit side (payment out)
  AND ec.date_ecriture >= [MONTH_START]
  AND ec.date_ecriture <= [MONTH_END]
  AND NOT EXISTS (
    SELECT 1 FROM lettrages l WHERE l.ecriture_id = ec.id
  )
  AND ec.journal_code NOT IN ('OD', 'CLS')  -- Not reversals/closures
ORDER BY
  ec.date_ecriture ASC;
```

---

### 4.3 Stale Items (> 30 Days Old and Unmatched)

```sql
-- Audit flag: All unmatched items older than 30 days
-- These MUST be investigated and documented
SELECT
  'BANK' AS source,
  tb.id AS tx_id,
  tb.date_transaction AS date,
  CURRENT_DATE - tb.date_transaction AS days_old,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS amount,
  tb.montant_mur,
  tb.libelle_banque AS description,
  'REQUIRES INVESTIGATION' AS action_needed
FROM transactions_bancaires tb
WHERE tb.societe_id = [SOCIETE_ID]
  AND CURRENT_DATE - tb.date_transaction > 30
  AND NOT EXISTS (SELECT 1 FROM lettrages l WHERE l.transaction_bancaire_id = tb.id)

UNION ALL

SELECT
  'GL' AS source,
  ec.id,
  ec.date_ecriture,
  CURRENT_DATE - ec.date_ecriture,
  CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END,
  CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END,
  ec.description,
  'REQUIRES INVESTIGATION' AS action_needed
FROM ecritures_comptables_v2 ec
WHERE ec.societe_id = [SOCIETE_ID]
  AND ec.numero_compte IN ('5121', '51210', '512100', '512101')
  AND CURRENT_DATE - ec.date_ecriture > 30
  AND NOT EXISTS (SELECT 1 FROM lettrages l WHERE l.ecriture_id = ec.id)

ORDER BY
  days_old DESC;
```

---

## 5. Variance Analysis Queries

### 5.1 Monthly Reconciliation Variance

```sql
-- Compare bank statement balance vs GL balance
-- Shows variance and categorizes
WITH gl_balance AS (
  SELECT
    ec.societe_id,
    DATE_TRUNC('month', ec.date_ecriture)::date + interval '1 month' - interval '1 day' AS period_end,
    ROUND(SUM(ec.debit_mur - ec.credit_mur)::numeric, 2) AS balance
  FROM ecritures_comptables_v2 ec
  WHERE ec.numero_compte IN ('5121', '51210', '512100', '512101')
    AND ec.date_ecriture >= '2025-07-01'
    AND ec.date_ecriture <= '2026-06-30'
  GROUP BY ec.societe_id, period_end
),
bank_balance AS (
  SELECT
    rb.societe_id,
    rb.periode,
    (rb.periode || '-01')::date + interval '1 month' - interval '1 day' AS period_end,
    ROUND(rb.solde_cloture::numeric, 2) AS balance
  FROM releves_bancaires rb
  WHERE rb.periode >= '2025-07'
    AND rb.periode <= '2026-06'
)
SELECT
  gl.societe_id,
  gl.period_end,
  s.nom AS societe_nom,
  gl.balance AS gl_balance,
  bb.balance AS bank_balance,
  ROUND((bb.balance - gl.balance)::numeric, 2) AS variance,
  CASE
    WHEN ABS(bb.balance - gl.balance) < 1 THEN 'BALANCED'
    WHEN ABS(bb.balance - gl.balance) <= 100 THEN 'MINOR VARIANCE'
    ELSE 'SIGNIFICANT VARIANCE'
  END AS variance_category
FROM gl_balance gl
FULL JOIN bank_balance bb ON
  gl.societe_id = bb.societe_id AND
  gl.period_end = bb.period_end
JOIN societes s ON s.id = COALESCE(gl.societe_id, bb.societe_id)
ORDER BY
  COALESCE(gl.societe_id, bb.societe_id),
  COALESCE(gl.period_end, bb.period_end);
```

---

### 5.2 Variance Root Cause Analysis

```sql
-- Identify items that explain the variance
-- Outstanding deposits + checks + unmatched items
WITH variance_calc AS (
  SELECT
    [SOCIETE_ID] AS societe_id,
    [PERIOD] AS period,
    [BANK_BALANCE] AS bank_balance,
    [GL_BALANCE] AS gl_balance,
    [BANK_BALANCE] - [GL_BALANCE] AS variance
)
SELECT
  vc.period,
  vc.variance,
  'Pending Deposits' AS category,
  COALESCE(SUM(tb.credit), 0) AS amount,
  COUNT(*) AS count
FROM variance_calc vc
LEFT JOIN transactions_bancaires tb ON
  tb.societe_id = vc.societe_id
  AND tb.date_transaction >= (vc.period || '-01')::date
  AND tb.date_transaction < (vc.period || '-01')::date + interval '1 month'
  AND tb.credit > 0
  AND NOT EXISTS (SELECT 1 FROM lettrages l WHERE l.transaction_bancaire_id = tb.id)
GROUP BY vc.period, vc.variance

UNION ALL

SELECT
  vc.period,
  vc.variance,
  'Outstanding Checks' AS category,
  COALESCE(SUM(ec.debit_mur), 0) AS amount,
  COUNT(*) AS count
FROM variance_calc vc
LEFT JOIN ecritures_comptables_v2 ec ON
  ec.societe_id = vc.societe_id
  AND ec.numero_compte IN ('5121', '51210', '512100', '512101')
  AND ec.date_ecriture >= (vc.period || '-01')::date
  AND ec.date_ecriture < (vc.period || '-01')::date + interval '1 month'
  AND ec.debit_mur > 0
  AND NOT EXISTS (SELECT 1 FROM lettrages l WHERE l.ecriture_id = ec.id)
  AND ec.journal_code NOT IN ('OD', 'CLS')
GROUP BY vc.period, vc.variance

ORDER BY
  period, category;
```

---

## 6. Forex & Multi-Currency Queries

### 6.1 EUR Transactions with Exchange Rate Tracking

```sql
-- All EUR transactions with MUR conversion details
SELECT
  tb.id,
  tb.date_transaction,
  tb.libelle_banque,
  tb.devise_origine,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS amount_orig,
  tb.montant_mur,
  tb.taux_change_applique,
  tch.taux_mcb AS mcb_taux_oftheday,
  CASE
    WHEN tch.taux_mcb IS NOT NULL 
      THEN ROUND(
        ABS(tb.taux_change_applique - tch.taux_mcb) / tch.taux_mcb * 100,
        3
      )
    ELSE NULL
  END AS rate_variance_pct,
  CASE
    WHEN tch.taux_mcb IS NOT NULL
      AND ABS(tb.taux_change_applique - tch.taux_mcb) > 0.01
    THEN '⚠️ RATE VARIANCE'
    ELSE 'OK'
  END AS fx_status,
  tb.statut_lettrage
FROM transactions_bancaires tb
LEFT JOIN taux_change_historique tch ON
  tch.devise = tb.devise_origine
  AND tch.date_taux = tb.date_transaction
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.devise_origine != 'MUR'
  AND tb.date_transaction >= '2025-07-01'
  AND tb.date_transaction <= '2026-06-30'
ORDER BY
  tb.date_transaction ASC;
```

---

### 6.2 Monthly Forex Gain/Loss Analysis

```sql
-- Calculate realized forex difference for the month
-- For matched transactions: difference between applied rate and actual
SELECT
  DATE_TRUNC('month', tb.date_transaction)::date + interval '1 month' - interval '1 day' AS period_end,
  tb.devise_origine,
  COUNT(*) AS transaction_count,
  
  SUM(CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END) AS total_original,
  SUM(tb.montant_mur) AS total_mur_actual,
  
  -- If all used same rate
  ROUND(
    (SUM(CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END) * 
     AVG(tb.taux_change_applique)) - SUM(tb.montant_mur),
    2
  ) AS realized_forex_diff,
  
  CASE
    WHEN ROUND(
      (SUM(CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END) * 
       AVG(tb.taux_change_applique)) - SUM(tb.montant_mur),
      2
    ) > 0 THEN 'GAIN'
    WHEN ROUND(
      (SUM(CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END) * 
       AVG(tb.taux_change_applique)) - SUM(tb.montant_mur),
      2
    ) < 0 THEN 'LOSS'
    ELSE 'BREAK-EVEN'
  END AS forex_result
FROM transactions_bancaires tb
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.devise_origine != 'MUR'
  AND tb.date_transaction >= '2025-07-01'
  AND tb.date_transaction <= '2026-06-30'
GROUP BY
  period_end,
  tb.devise_origine
ORDER BY
  period_end,
  tb.devise_origine;
```

---

## 7. Audit Trail & Evidence Queries

### 7.1 Lettrage Audit Trail

```sql
-- Show all matching/lettering activity
SELECT
  l.id AS lettrage_id,
  l.created_at,
  l.date_lettrage,
  
  tb.id AS bank_tx_id,
  tb.date_transaction,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS bank_amount,
  tb.montant_mur,
  
  ec.id AS gl_entry_id,
  ec.date_ecriture,
  ec.journal_code,
  ec.numero_compte,
  
  l.montant_lettre,
  CASE
    WHEN ABS(l.montant_lettre - tb.montant_mur) < 0.01 THEN 'FULL'
    ELSE 'PARTIAL'
  END AS lettrage_type,
  
  l.notes,
  
  CASE
    WHEN l.created_at != l.date_lettrage THEN 'MODIFIED'
    ELSE 'ORIGINAL'
  END AS lettrage_status
FROM lettrages l
JOIN transactions_bancaires tb ON tb.id = l.transaction_bancaire_id
JOIN ecritures_comptables_v2 ec ON ec.id = l.ecriture_id
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.date_transaction >= '2025-07-01'
  AND tb.date_transaction <= '2026-06-30'
ORDER BY
  l.created_at DESC;
```

---

### 7.2 Reconciliation History (statut_rapprochement)

```sql
-- Show reconciliation status progression
SELECT
  rb.id,
  rb.periode,
  rb.societe_id,
  cb.numero_compte,
  rb.date_debut,
  rb.date_fin,
  rb.solde_ouverture,
  rb.solde_cloture,
  rb.statut_rapprochement,
  rb.created_at,
  COUNT(tb.id) AS total_transactions,
  SUM(CASE WHEN tb.statut_lettrage = 'lettre' THEN 1 ELSE 0 END) AS matched_transactions,
  ROUND(
    100.0 * 
    SUM(CASE WHEN tb.statut_lettrage = 'lettre' THEN 1 ELSE 0 END) /
    NULLIF(COUNT(tb.id), 0),
    1
  ) AS match_percentage
FROM releves_bancaires rb
JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
LEFT JOIN transactions_bancaires tb ON tb.releve_id = rb.id
WHERE rb.societe_id = [SOCIETE_ID]
  AND rb.periode >= '2025-07'
  AND rb.periode <= '2026-06'
GROUP BY
  rb.id,
  rb.periode,
  rb.societe_id,
  cb.numero_compte,
  rb.date_debut,
  rb.date_fin,
  rb.solde_ouverture,
  rb.solde_cloture,
  rb.statut_rapprochement,
  rb.created_at
ORDER BY
  rb.periode DESC;
```

---

### 7.3 Manual Adjustments / Correction Entries

```sql
-- Find entries marked as manual adjustments (OD journal)
-- Used to reconcile variances
SELECT
  ec.id,
  ec.date_ecriture,
  ec.journal_code,
  ec.numero_compte,
  ec.description,
  ec.debit_mur,
  ec.credit_mur,
  ec.reference,
  ec.notes,
  CASE
    WHEN ec.journal_code = 'OD' AND ec.description ILIKE '%reconcili%' THEN 'RECONCILIATION ADJUSTMENT'
    WHEN ec.journal_code = 'OD' AND ec.description ILIKE '%variance%' THEN 'VARIANCE CORRECTION'
    WHEN ec.journal_code = 'OD' AND ec.description ILIKE '%forex%' THEN 'FOREX ADJUSTMENT'
    ELSE 'OTHER'
  END AS adjustment_type
FROM ecritures_comptables_v2 ec
WHERE ec.societe_id = [SOCIETE_ID]
  AND ec.numero_compte IN ('5121', '51210', '512100', '512101')
  AND ec.journal_code = 'OD'
  AND ec.date_ecriture >= '2025-07-01'
  AND ec.date_ecriture <= '2026-06-30'
ORDER BY
  ec.date_ecriture DESC;
```

---

## Appendix: Common Parameters

```typescript
// Example parameter values for UK environment
interface BankingExportParams {
  CLIENT_ID: string;           // 'c_dds_maurit' or similar
  SOCIETE_ID: string;          // 'soc_dds' (DDS) or 'soc_occ' (OCC)
  COMPTE_ID: string;           // Account UUID from comptes_bancaires.id
  PERIOD: string;              // '2025-07' format
  MONTH_START: Date;           // 2025-07-01
  MONTH_END: Date;             // 2025-07-31
  START_DATE: Date;            // FY start 2025-07-01
  END_DATE: Date;              // FY end 2026-06-30
  BANK_BALANCE: number;        // From releves_bancaires.solde_cloture
  GL_BALANCE: number;          // Computed from ecritures_comptables_v2
}
```

---

*Last updated: 2026-05-22*
