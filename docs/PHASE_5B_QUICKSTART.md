# Phase 5B Intercompany Reconciliation - Quick Start Guide

## Overview

The Intercompany Reconciliation Agent (Phase 5B, Weeks 9-10) is a complete system for verifying and documenting all transactions between related entities (DDS and OCC) for Big 4 audit compliance.

**Deliverables:**
1. Transaction Map (CSV)
2. 4411/4412 Reconciliation (CSV)
3. Settlement History (Markdown)
4. Related Party Disclosure (Markdown)
5. Compliance Check Report (Markdown)

---

## Quick Start (5 minutes)

### Option A: Web UI (Recommended for First-Time Use)

1. Log in to Lexora as Admin or Auditor
2. Navigate to: **Audit > Intercompany Reconciliation**
3. Select date range (default: current year to date)
4. Click: **Generate Reports**
5. Review summary metrics on screen
6. Download individual files as needed

### Option B: Command Line (Faster for Automation)

```bash
# Generate and download all reports
./scripts/run-intercompany-reconciliation.sh 2025-01-01 2025-12-31

# Files saved to: ./exports/YYYYMMDD_HHMMSS_*.*
```

### Option C: cURL (For Integration/Scripting)

```bash
# 1. Generate all reports
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit/intercompany-reconciliation/generate?start=2025-01-01&end=2025-12-31" \
  | jq .

# 2. Download transaction map
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit/intercompany-reconciliation/download?file=transaction_map_csv&start=2025-01-01&end=2025-12-31" \
  -o TRANSACTION_MAP.csv
```

---

## File Descriptions

### 1. INTERCOMPANY_TRANSACTION_MAP.csv
**Purpose:** Complete listing of all DDS↔OCC transactions  
**Key Columns:**
- Date, Description, Direction (DDS→OCC or OCC→DDS)
- Amount (MUR), GL Accounts, GL Reference
- Settlement Status, Settlement Date

**What to Check:**
- ✅ All major transfers captured
- ✅ Direction matches actual flow (who owes whom)
- ✅ GL references link to source documents

### 2. INTERCOMPANY_4411_4412_RECONCILIATION.csv
**Purpose:** Verify GL accounts 4411/4412 are balanced  
**Key Sections:**
- DDS 4411 Receivable (what OCC owes DDS)
- OCC 4411 Receivable (what DDS owes OCC)
- DDS 4412 Payable (what DDS owes OCC)
- OCC 4412 Payable (what OCC owes DDS)

**What to Check:**
- ✅ Variance = 0 (or explained)
- ✅ Debit = Credit
- ✅ Reconciliation status: BALANCED

**If Variance > 0:**
1. Identify which entity has difference
2. Review missing GL entries
3. Check for timing differences (one recorded, other pending)
4. Document explanation and get sign-off

### 3. INTERCOMPANY_SETTLEMENTS.md
**Purpose:** Track settlement activity (how balances were resolved)  
**Key Information:**
- Settlement dates and methods
- GL references linking to settlement entries
- Verification status (verified/pending/exception)

**What to Check:**
- ✅ All large balances have settlement records
- ✅ Settlement dates are reasonable (not old)
- ✅ Bank confirmations or offset memos exist

### 4. RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md
**Purpose:** Financial statement footnote (ready-to-use text)  
**Key Sections:**
- Summary of all related party transactions
- Narrative explaining accounting treatment
- IAS 24 compliance statement
- Settlement policy

**Usage:**
- Copy-paste into financial statements (Note X - Related Party Transactions)
- Present to audit committee
- Include in audit workpapers

### 5. RELATED_PARTY_COMPLIANCE_CHECK.md
**Purpose:** Verify all compliance requirements are met  
**Key Sections:**
- Documentation status (contracts, POs, invoices, approvals)
- Fair market value assessments
- Findings and exceptions (if any)

**What to Check:**
- ✅ Compliance Status = "COMPLIANT"
- ✅ No critical findings
- ✅ Missing documentation identified and remediated

---

## Interpreting Results

### Success Indicators

✅ **Fully Compliant**
```
Balanced?: YES
Variance: 0.00 MUR
Compliance Status: COMPLIANT
Critical Findings: 0
```

⚠️ **Needs Investigation**
```
Balanced?: NO
Variance: 1,500.00 MUR
Compliance Status: COMPLIANT (with findings)
Critical Findings: 0
```

❌ **Action Required**
```
Balanced?: NO
Variance: 50,000.00 MUR
Compliance Status: NON-COMPLIANT
Critical Findings: 3
```

### Common Issues and Solutions

#### Issue 1: Variance in 4411/4412
**Possible Causes:**
- Timing difference (one entity recorded, other hasn't)
- Missing GL entry (transaction recorded on one side only)
- Rounding error (unlikely if using MUR 2 decimals)

**Resolution:**
1. Get dates of GL entries from both entities
2. If dates differ by 1-2 days → timing difference (explain in variance section)
3. If significant difference → find missing GL entry and record it
4. Re-run reconciliation to verify variance = 0

#### Issue 2: Missing Settlement Records
**Possible Causes:**
- Settlement hasn't been formally recorded in GL
- Settlement documentation not linked to GL entry
- Settlement occurred outside system

**Resolution:**
1. Review bank statements for settlement transfers
2. Record settlement GL entry (debit 4411/4412, credit bank account)
3. Link settlement documentation to GL entry
4. Update flux_interco status to "reconcilie"

#### Issue 3: Missing Documentation
**Possible Causes:**
- Invoice not linked in GL entry
- Supporting documents not uploaded
- Transaction recorded without proper approval

**Resolution:**
1. Locate supporting documentation
2. Update GL entry with invoice_id
3. Document approval in system
4. Add contract/PO references if available

---

## For Big 4 Auditors

### Audit Workpapers Package
All reports should be compiled into the audit workpapers file:

```
AUDIT_WORKPAPERS/
└── 07_INTERCOMPANY_RECONCILIATION/
    ├── 01_INTERCOMPANY_TRANSACTION_MAP.csv
    ├── 02_INTERCOMPANY_4411_4412_RECONCILIATION.csv
    ├── 03_INTERCOMPANY_SETTLEMENTS.md
    ├── 04_RELATED_PARTY_DISCLOSURE.md
    ├── 05_RELATED_PARTY_COMPLIANCE_CHECK.md
    └── 06_RECONCILIATION_SIGN_OFF.pdf
```

### Key Audit Procedures
The reports support these audit procedures:

1. **Existence & Completeness**
   - Review transaction map for all recorded intercompany activity
   - Verify no unrecorded transactions

2. **Accuracy & Valuation**
   - Review 4411/4412 reconciliation
   - Verify fair market value assessments
   - Test settlement amounts

3. **Classification & Disclosure**
   - Review GL account classifications (4411 vs 4412)
   - Verify related party disclosure is complete
   - Check IAS 24 compliance

4. **Authorization & Control**
   - Review approval documentation
   - Verify segregation of duties
   - Check settlement controls

---

## Troubleshooting

### API Not Responding
```bash
# Check service is running
curl http://localhost:3000/api/health

# Check authentication
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/audit/intercompany-reconciliation/generate
```

### Permission Denied
```
Error: "Forbidden - Admin or Auditor role required"
```
**Solution:** Log in as Admin or Auditor user. Check profile.role in database.

### No Data Found
```
"total_transactions": 0
```
**Causes:**
- Date range has no transactions
- Entities DDS/OCC don't exist in database
- GL entries don't have 4411/4412 accounts

**Solution:**
- Verify entities: `SELECT * FROM societes WHERE nom IN ('DDS', 'OCC')`
- Verify GL entries: `SELECT * FROM ecritures_comptables_v2 WHERE numero_compte IN ('4411', '4412')`

### File Download Fails
**Check:** Browser network tab for error details
- Ensure TOKEN has correct permissions
- Verify file type is correct (transaction_map_csv, reconciliation_csv, etc.)

---

## Integration with Other Systems

### Export to Excel
```bash
# Download CSV, open in Excel
./scripts/run-intercompany-reconciliation.sh
# Select CSV files and open with Excel
```

### Export to Confluence/SharePoint
```bash
# Markdown files can be pasted directly into wiki/document management
cat exports/INTERCOMPANY_TRANSACTIONS_DISCLOSURE.md | pbcopy
```

### Email Report
```bash
# Create summary and email to team
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit/intercompany-reconciliation/generate?start=2025-01-01&end=2025-12-31" \
  | jq '.summary' | mailx -s "Intercompany Reconciliation Summary" finance@company.com
```

### Schedule Recurring Reports
```bash
# Add to crontab for monthly reconciliation
# Run last day of month at 5 PM
0 17 28-31 * * /path/to/run-intercompany-reconciliation.sh
```

---

## Support & Questions

### For Finance/Accounting Issues
Contact: Finance Controller
- Missing transactions?
- Settlement policy questions?
- Variance explanations?

### For Technical Issues
Contact: Tech Lead
- API errors?
- Database connectivity?
- Export format issues?

### For Audit Concerns
Contact: CFO + Audit Partner
- Compliance findings?
- Disclosure completeness?
- Big 4 concerns?

---

## Key Metrics at a Glance

After running reconciliation, check:

| Metric | Ideal | Caution | Alarm |
|--------|-------|---------|-------|
| Total Transactions | 20+ | <5 | 0 |
| Balanced? | Yes | N/A | No |
| Variance (MUR) | 0 | <500 | >500 |
| Settlements | >80% | 50-80% | <50% |
| Compliance Status | Compliant | Has findings | Non-Compliant |
| Critical Findings | 0 | N/A | >0 |

---

## Next Steps

After reviewing reports:

1. **Week 9:**
   - [ ] Generate initial reports
   - [ ] Review transaction map
   - [ ] Investigate any variances
   - [ ] Document findings

2. **Week 10:**
   - [ ] Finalize settlement history
   - [ ] Prepare related party disclosure
   - [ ] Complete compliance review
   - [ ] Package for auditor

3. **After Week 10:**
   - [ ] Submit to Big 4 auditor
   - [ ] Address auditor questions
   - [ ] Finalize financial statements
   - [ ] File with regulatory authorities

---

*For complete documentation, see `/docs/PHASE_5B_INTERCOMPANY_RECONCILIATION.md`*
