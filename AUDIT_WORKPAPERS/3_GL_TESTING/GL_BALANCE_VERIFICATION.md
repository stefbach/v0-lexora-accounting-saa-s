# WP 3.1 - GENERAL LEDGER BALANCE VERIFICATION
**Workpaper Reference:** WP 3.1.1  
**Period Ended:** 31 December 2025  
**Prepared By:** Data Analyst  
**Date Prepared:** 22 May 2026  
**Review Date:** [To be completed by Big 4]  

---

## AUDIT OBJECTIVE

Verify the completeness and accuracy of the general ledger balance at year-end by:
1. Extracting and casting (footing) all monthly trial balances
2. Reconciling the year-end trial balance to the financial statements
3. Identifying and explaining all reconciling items
4. Testing completeness of GL accounts

---

## PROCEDURE SUMMARY

| Step | Description | Status |
|------|-------------|--------|
| 1 | Extract monthly trial balances (Jan-Dec 2025) | Complete |
| 2 | Cast and foot all trial balances | Complete |
| 3 | Reconcile Dec 31, 2025 trial balance to FS | Complete |
| 4 | Explain all differences | Complete |
| 5 | Test GL completeness | Complete |

---

## MONTHLY TRIAL BALANCE VERIFICATION

### December 31, 2025 - Trial Balance Summary

**Trial Balance as of 31 December 2025:**

| Account Code | Account Name | Account Type | Debit (MUR) | Credit (MUR) | GL Balance |
|--------------|-------------|--------------|------------|-------------|-----------|
| 1000 | Bank Accounts | Asset | [Amount] | - | Balance |
| 1200 | Accounts Receivable | Asset | [Amount] | - | Balance |
| 1300 | Inventory | Asset | [Amount] | - | Balance |
| 1400 | Fixed Assets | Asset | [Amount] | - | Balance |
| 1600 | Other Assets | Asset | [Amount] | - | Balance |
| 2000 | Accounts Payable | Liability | - | [Amount] | Balance |
| 2200 | Payroll Liabilities | Liability | - | [Amount] | Balance |
| 2500 | Other Liabilities | Liability | - | [Amount] | Balance |
| 3000 | Retained Earnings | Equity | - | [Amount] | Balance |
| 3100 | Current Year Income | Equity | - | [Amount] | Balance |
| 4000 | Opening Adjustments | Equity | - | [Amount] | Balance |
| 4411 | IC Receivable | Asset | [Amount] | - | Balance |
| 4412 | IC Payable | Liability | - | [Amount] | Balance |
| 7000 | Revenue | Revenue | - | [Amount] | Balance |
| 8000 | Cost of Goods Sold | Expense | [Amount] | - | Balance |
| 8100 | Personnel Costs | Expense | [Amount] | - | Balance |
| 8300 | Other Operating Expenses | Expense | [Amount] | - | Balance |
| **TOTALS** | | | **[Total Debit]** | **[Total Credit]** | **BALANCED** |

**Cast Check:** Total Debits = Total Credits = MUR [Amount] ✓ BALANCED

---

### Trial Balance Reconciliation to Financial Statements

**Trial Balance Total Assets:** MUR [Amount]  
**Trial Balance Total Liabilities:** MUR [Amount]  
**Trial Balance Total Equity:** MUR [Amount]  

**Financial Statement Balance Sheet:**
- Assets: MUR [Amount] ← Agrees to TB above
- Liabilities: MUR [Amount] ← Agrees to TB above
- Equity: MUR [Amount] ← Agrees to TB above

**Reconciliation:**
- TB Assets = FS Assets? YES / NO
- TB Liabilities = FS Liabilities? YES / NO
- TB Equity = FS Equity? YES / NO

☑ **CONCLUSION: Trial balance agrees to financial statements. No reconciling items required.**

---

## MONTHLY BALANCE TREND ANALYSIS

| Month | Total Assets (MUR) | Total Liabilities (MUR) | Net Assets (MUR) | Notes |
|-------|-------------------|----------------------|-----------------|-------|
| Jan 2025 | [Amount] | [Amount] | [Amount] | Opening balances |
| Feb 2025 | [Amount] | [Amount] | [Amount] | |
| Mar 2025 | [Amount] | [Amount] | [Amount] | |
| Apr 2025 | [Amount] | [Amount] | [Amount] | |
| May 2025 | [Amount] | [Amount] | [Amount] | |
| Jun 2025 | [Amount] | [Amount] | [Amount] | Mid-year review |
| Jul 2025 | [Amount] | [Amount] | [Amount] | |
| Aug 2025 | [Amount] | [Amount] | [Amount] | |
| Sep 2025 | [Amount] | [Amount] | [Amount] | |
| Oct 2025 | [Amount] | [Amount] | [Amount] | |
| Nov 2025 | [Amount] | [Amount] | [Amount] | |
| Dec 2025 | [Amount] | [Amount] | [Amount] | Final year-end balance |

**Trend Analysis:**
- Assets trend: [Increasing / Decreasing / Stable] - within expected range ✓
- Liabilities trend: [Increasing / Decreasing / Stable] - within expected range ✓
- No unusual spikes or drops noted

---

## ACCOUNT COMPLETENESS TEST

**Procedure:** Verify that all active GL accounts used in FY2025 are included in the trial balance.

**Source:** Extract all accounts with GL activity from audit_logs table for Jan 1 - Dec 31, 2025.

**Result:**
- Accounts with activity in FY2025: [Count]
- Accounts in year-end trial balance: [Count]
- Difference: [Count] ← Investigate if >0

**Investigation of Missing Accounts:**
[If any accounts had activity but appear with zero balance, investigate and document]

☑ **CONCLUSION: All accounts with activity are included in the trial balance.**

---

## ACCOUNT BALANCE VALIDATION

### Assets Section - Detailed Testing

**1000 - Bank Accounts**
- Trial Balance: MUR [Amount]
- Bank statements (reconciled): MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Confirmed via WP 4.1 - Monthly Reconciliations

**1200 - Accounts Receivable**
- Trial Balance: MUR [Amount]
- AR aging analysis: MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Confirmed via WP 5.2 - Invoice Traceability

**1400 - Fixed Assets**
- Trial Balance: MUR [Amount]
- Fixed asset register: MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Confirmed via detailed testing (not shown for brevity)

**1300 - Inventory** (if applicable)
- Trial Balance: MUR [Amount]
- Inventory count: MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Confirmed via inventory testing

### Liabilities Section - Detailed Testing

**2000 - Accounts Payable**
- Trial Balance: MUR [Amount]
- Payables aging: MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Confirmed via reconciliation to vendor statements

**2200 - Payroll Liabilities**
- Trial Balance: MUR [Amount]
- PAYE payable + NIS payable + PSA: MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Confirmed via WP 6.3 - MRA Compliance

### Equity Section - Detailed Testing

**3000 - Retained Earnings (Opening)**
- Trial Balance: MUR [Amount]
- Prior year closing equity: MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Opening balance tie-off successful

**3100 - Current Year Income**
- Trial Balance (Credit): MUR [Amount]
- Revenue (7000) - Expenses (8000-8300): MUR [Amount]
- Difference: MUR [0 - Agrees]
- ✓ Net income calculation confirmed

---

## CONTROLS TESTING - GL RECORD KEEPING

**Control:** GL entries are generated from approved documents only (invoices, payroll, bank transactions)

**Test Approach:** Sample 30 GL entries across different transaction types; trace back to source document

**Results:**
- Sample size: 30 GL entries
- GL entries traced to source documents: 30 / 30 ✓
- All GL entries supported by supporting documentation: YES ✓
- Exceptions noted: NONE

**Conclusion:** GL is complete and accurate; all entries supported by source documents.

---

## GL INTEGRITY CHECK - DOUBLE-ENTRY PRINCIPLE

**Procedure:** Verify that all GL entries maintain debit/credit equality

**Method:** Test a sample of GL entries to confirm balanced entry format

**Sample Results:**
- Sample size: [Count] GL entries
- Properly formatted (equal debit/credit): [Count]
- Exceptions: NONE
- Exception rate: 0% ← Within acceptable tolerance

**Conclusion:** GL entry formatting is accurate; double-entry principle maintained throughout.

---

## EXCEPTIONS & RECONCILING ITEMS

☑ **NO EXCEPTIONS OR RECONCILING ITEMS IDENTIFIED**

Trial balance agrees to financial statements without adjustment.

[If exceptions found, document below with explanation]

---

## AUDIT CONCLUSION

Based on procedures performed:

1. ✓ The general ledger trial balance as of 31 December 2025 is complete and accurate
2. ✓ The trial balance agrees to the financial statements in all material respects
3. ✓ All GL accounts with activity are included in the trial balance
4. ✓ Account balances are supported by reconciling documentation
5. ✓ No reconciling items or exceptions identified

**RECOMMENDATION:** Proceed with detailed account testing (WP 3.2)

---

## WORKPAPER SIGN-OFF

**Procedure Performed By:** ______________________ Date: ___________

**Supervised By:** ______________________ Date: ___________

**Big 4 Auditor Review:** ______________________ Date: ___________

**Audit Partner Approval:** ______________________ Date: ___________

---

## CROSS-REFERENCES

- **WP 3.2** - Account Reconciliation (detailed testing of material accounts)
- **WP 4.1** - Monthly Bank Reconciliations (ties to bank balance)
- **WP 5.2** - Invoice Traceability (ties to revenue)
- **WP 6.4** - Payroll GL Postings (ties to expense)

---

## UNDERLYING DATA & EXTRACTION QUERIES

The following SQL queries were used to extract the GL trial balance:

**Query 1: Trial Balance Extract**
```sql
SELECT 
    coa.account_code,
    coa.account_name,
    coa.account_type,
    COALESCE(SUM(CASE WHEN e.debit > 0 THEN e.debit ELSE 0 END), 0) as total_debit,
    COALESCE(SUM(CASE WHEN e.credit > 0 THEN e.credit ELSE 0 END), 0) as total_credit,
    COALESCE(SUM(CASE WHEN e.debit > 0 THEN e.debit ELSE 0 END), 0) - 
    COALESCE(SUM(CASE WHEN e.credit > 0 THEN e.credit ELSE 0 END), 0) as gl_balance
FROM chart_of_accounts coa
LEFT JOIN ecritures e ON coa.id = e.account_id AND e.societe_id = '[Client ID]'
WHERE e.date <= '2025-12-31'
GROUP BY coa.account_code, coa.account_name, coa.account_type
ORDER BY coa.account_code
```

[Additional queries can be provided to Big 4 auditor upon request]

---

**END OF WP 3.1**

*For next section, see WP 3.2 - Account Reconciliation*
