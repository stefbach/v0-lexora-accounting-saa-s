# PHASE 5B - Intercompany Reconciliation Agent
**Timeline:** Weeks 9-10  
**Effort:** 15 hours  
**Owner:** Finance + Tech  
**Status:** READY FOR IMPLEMENTATION

---

## MISSION

Verify that intercompany transactions between **DDS** and **OCC** are:
1. Properly recorded in GL accounts **4411** (receivable) and **4412** (payable)
2. Reconciled between both entities
3. Settled appropriately
4. Disclosed for Big 4 auditor review

**Success Criteria:**
- All intercompany transactions identified and mapped
- 4411/4412 reconciliation complete (variance = 0 or explained)
- Settlement history documented and verified
- Related party disclosure prepared
- Big 4 auditor can review without additional inquiry

---

## DELIVERABLES

### 1. Intercompany Transaction Mapping
**File:** `/exports/INTERCOMPANY_TRANSACTION_MAP.csv`

**Contents:**
- All transactions between DDS and OCC recorded in GL accounts 4411/4412
- Fields:
  - Date
  - Description
  - Direction (DDS→OCC or OCC→DDS)
  - Amount (MUR)
  - DDS Account Number
  - OCC Account Number
  - GL Reference
  - Settlement Status
  - Settlement Date
  - Settlement Method
  - Invoice Number

**Expected Result:**
- Every DDS transaction to OCC has corresponding mirror entry in OCC records
- 100% match between DDS and OCC recorded amounts

**Generation:**
```bash
GET /api/audit/intercompany-reconciliation/generate?start=2025-01-01&end=2025-12-31
# Downloads as: INTERCOMPANY_TRANSACTION_MAP.csv
```

---

### 2. 4411/4412 Reconciliation
**File:** `/exports/INTERCOMPANY_4411_4412_RECONCILIATION.xlsx` (CSV format for Excel)

**Contents:**

#### DDS 4411 (Receivable from OCC)
| Account | Debit (MUR) | Credit (MUR) | Balance (MUR) |
|---------|------:|------:|------:|
| 4411 | X | - | X |

#### OCC 4412 (Payable to DDS)
| Account | Debit (MUR) | Credit (MUR) | Balance (MUR) |
|---------|------:|------:|------:|
| 4412 | - | Y | Y |

**Reconciliation Check:**
- DDS 4411 balance should equal OCC 4412 balance (same sign expected based on perspective)
- Variance: Expected = 0 MUR
- If variance exists: Document reason (timing, pending settlement, error)

**Pairs to Verify:**
1. DDS 4412 Payable = OCC 4411 Receivable (opposite signs)
2. DDS 4411 Receivable = OCC 4412 Payable (opposite signs)

**Generation:**
```bash
GET /api/audit/intercompany-reconciliation/download?file=reconciliation_csv&start=2025-01-01&end=2025-12-31
# Downloads as: INTERCOMPANY_4411_4412_RECONCILIATION.csv
```

---

### 3. Settlement History
**File:** `/exports/INTERCOMPANY_SETTLEMENTS.md`

**Contents:**
- All settled intercompany balances with:
  - Settlement date
  - Settlement method (bank transfer, offset, other)
  - GL reference
  - Amount settled

**Verification:**
- Settlement amount matches intercompany balance
- GL entries recorded with proper accounts (4411/4412)
- Settlement documentation retained (bank confirmations, offset memos)

**Example:**
| Settlement Date | Method | Amount (MUR) | GL Reference | Status |
|---|---|---:|---|---|
| 2025-06-30 | Offset | 50,000 | SETTLE-001 | Verified |
| 2025-12-31 | Bank Transfer | 75,000 | SETTLE-002 | Verified |

**Generation:**
```bash
GET /api/audit/intercompany-reconciliation/download?file=settlement_history_md&start=2025-01-01&end=2025-12-31
# Downloads as: INTERCOMPANY_SETTLEMENTS.md
```

---

### 4. Related Party Disclosure
**File:** `/exports/RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md`

**Contents:**
- Ready for financial statement footnote (Note X)
- Lists all intercompany transactions by category:
  - DDS ↔ OCC transfers (operational)
  - Partner loans (if any)
  - Partner guarantees (if any)
  - Service agreements (if any)

**Aggregates:**
| Category | Amount (MUR) |
|---|---:|
| DDS → OCC Transfers | X |
| OCC → DDS Transfers | Y |
| Partner Loans | Z |
| Partner Guarantees | W |
| **Total Related Party Exposure** | **X+Y+Z+W** |

**Disclosure Topics Covered:**
1. Nature of transactions
2. Accounting treatment (GL accounts, fair market value)
3. Settlement policy and practice
4. IAS 24 compliance statement

**Generation:**
```bash
GET /api/audit/intercompany-reconciliation/download?file=related_party_disclosure_md&start=2025-01-01&end=2025-12-31
# Downloads as: RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md
```

---

### 5. Compliance Check
**File:** `/exports/RELATED_PARTY_COMPLIANCE_CHECK.md`

**Verification Points:**

1. **Fair Market Value**
   - All transactions at arm's length terms
   - Pricing consistent with market rates
   - Economic substance substantiated

2. **Documentation**
   - Contract or agreement exists
   - Purchase order issued
   - Invoice recorded in GL
   - Board resolution (if required by policy)

3. **Approval Authority**
   - Transaction approved by delegated authority
   - Documentation retained
   - Approvers identified

4. **Compliance Status**
   - ✅ Compliant: No critical findings
   - ⚠️ Non-Compliant: Critical findings require remediation

**Findings Format:**
| Finding | Severity | Transaction | Requirement | Evidence |
|---|---|---|---|---|
| Missing invoice | High | TXN-123 | All txns must have invoice | GL entry has no invoice_id |

**Generation:**
```bash
GET /api/audit/intercompany-reconciliation/download?file=compliance_check_md&start=2025-01-01&end=2025-12-31
# Downloads as: RELATED_PARTY_COMPLIANCE_CHECK.md
```

---

## IMPLEMENTATION

### API Endpoints

#### 1. Generate Full Report Package
```
GET /api/audit/intercompany-reconciliation/generate?start=YYYY-MM-DD&end=YYYY-MM-DD

Response:
{
  "success": true,
  "reporting_period": "2025-01-01 to 2025-12-31",
  "files": {
    "transaction_map_csv": {
      "filename": "INTERCOMPANY_TRANSACTION_MAP.csv",
      "size": 5432
    },
    "reconciliation_csv": { ... },
    "settlement_history_md": { ... },
    "related_party_disclosure_md": { ... },
    "compliance_check_md": { ... }
  },
  "summary": {
    "total_transactions": 42,
    "total_amount_mur": 1500000,
    "is_4411_4412_balanced": true,
    "variance_mur": 0,
    "total_settlements": 8,
    "compliance_status": "compliant",
    "critical_findings": 0
  },
  "next_steps": [
    "1. Review transaction map for completeness",
    "2. Verify all GL references match source documents",
    "3. ✅ 4411/4412 accounts are balanced",
    "... more steps ..."
  ]
}
```

#### 2. Download Individual File
```
GET /api/audit/intercompany-reconciliation/download?file=FILE_TYPE&start=YYYY-MM-DD&end=YYYY-MM-DD

Valid file types:
- transaction_map_csv
- reconciliation_csv
- settlement_history_md
- related_party_disclosure_md
- compliance_check_md

Response: File download with appropriate MIME type
```

### Usage Examples

#### Generate All Reports
```typescript
const response = await fetch(
  `/api/audit/intercompany-reconciliation/generate?start=2025-01-01&end=2025-12-31`,
  { method: 'GET' }
)
const data = await response.json()

console.log(`Generated ${Object.keys(data.files).length} files`)
console.log(`Status: ${data.summary.compliance_status}`)
console.log(`Variance: ${data.summary.variance_mur} MUR`)
```

#### Download Transaction Map
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit/intercompany-reconciliation/download?file=transaction_map_csv&start=2025-01-01&end=2025-12-31" \
  -o INTERCOMPANY_TRANSACTION_MAP.csv
```

#### Bulk Export (Shell Script)
```bash
#!/bin/bash

START="2025-01-01"
END="2025-12-31"
BASE_URL="http://localhost:3000/api/audit/intercompany-reconciliation"

files=(
  "transaction_map_csv"
  "reconciliation_csv"
  "settlement_history_md"
  "related_party_disclosure_md"
  "compliance_check_md"
)

for file in "${files[@]}"; do
  echo "Downloading $file..."
  curl -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/download?file=$file&start=$START&end=$END" \
    -o "exports/$(date +%Y%m%d)_$file"
done
```

---

## DATABASE SCHEMA REQUIREMENTS

### Tables Used

1. **societes**
   - id (UUID)
   - nom (VARCHAR) - "DDS" and "OCC"
   - client_id (UUID)

2. **ecritures_comptables_v2**
   - id (UUID)
   - date_ecriture (DATE)
   - description (TEXT)
   - numero_compte (VARCHAR)
   - debit_mur (NUMERIC)
   - credit_mur (NUMERIC)
   - societe_id (UUID)
   - reference_document (VARCHAR)
   - facture_id (UUID)
   - created_at (TIMESTAMPTZ)

3. **flux_interco**
   - id (UUID)
   - societe_emettrice_id (UUID)
   - societe_receptrice_id (UUID)
   - date_flux (DATE)
   - montant_mur (NUMERIC)
   - type_flux (VARCHAR)
   - statut_reconciliation (VARCHAR) - 'en_attente', 'reconcilie', 'litige'
   - reconcilie_avec_id (UUID)
   - created_at (TIMESTAMPTZ)

4. **audit_trail** (for logging)
   - id (UUID)
   - user_id (UUID)
   - action (VARCHAR)
   - table_name (VARCHAR)
   - description (TEXT)
   - new_values (JSONB)
   - timestamp (TIMESTAMPTZ)

---

## VALIDATION RULES

### 4411/4412 Reconciliation

```sql
-- Expected balance for DDS:
SELECT 
  SUM(CASE WHEN numero_compte = '4411' THEN debit_mur - credit_mur ELSE 0 END) AS dds_4411_balance,
  SUM(CASE WHEN numero_compte = '4412' THEN debit_mur - credit_mur ELSE 0 END) AS dds_4412_balance
FROM ecritures_comptables_v2
WHERE societe_id = 'dds_id';

-- Expected balance for OCC (inverse):
SELECT 
  SUM(CASE WHEN numero_compte = '4411' THEN debit_mur - credit_mur ELSE 0 END) AS occ_4411_balance,
  SUM(CASE WHEN numero_compte = '4412' THEN debit_mur - credit_mur ELSE 0 END) AS occ_4412_balance
FROM ecritures_comptables_v2
WHERE societe_id = 'occ_id';

-- Validation: |DDS_4412_balance + OCC_4411_balance| = 0 (or < 1 MUR tolerance)
```

### Transaction Count Validation

```sql
-- All transactions should appear on BOTH sides:
SELECT COUNT(*) FROM ecritures_comptables_v2 
WHERE numero_compte IN ('4411', '4412');
-- Should be even number (paired transactions)
```

---

## TESTING CHECKLIST

### Unit Tests
- [ ] `getIntercompanyTransactionMap()` returns correct transactions
- [ ] `reconcile4411and4412()` calculates balances correctly
- [ ] `getSettlementHistory()` filters settled transactions
- [ ] `getRelatedPartyDisclosure()` aggregates totals correctly
- [ ] `checkRelatedPartyCompliance()` identifies missing documentation

### Integration Tests
- [ ] Full report generation completes within 30 seconds
- [ ] All 5 files are generated successfully
- [ ] Summary metrics match manual calculations
- [ ] Date range filtering works correctly
- [ ] Authentication/authorization enforced

### Data Validation Tests
- [ ] 4411/4412 balances reconcile (variance = 0)
- [ ] Transaction amounts match between DDS and OCC
- [ ] No orphaned GL entries
- [ ] All settlement records have GL references

### Export Format Tests
- [ ] CSV files are valid (parseable by Excel)
- [ ] Markdown files render correctly (links, tables)
- [ ] File downloads have correct MIME types
- [ ] Large exports (10k+ rows) perform acceptably

---

## BIG 4 AUDITOR REQUIREMENTS

### Working Papers Package
```
AUDIT_WORKPAPERS/
└── 07_INTERCOMPANY_RECONCILIATION/
    ├── 01_Transaction_Map.csv
    ├── 02_4411_4412_Reconciliation.xlsx
    ├── 03_Settlement_History.md
    ├── 04_Related_Party_Disclosure.md
    ├── 05_Compliance_Check.md
    └── 06_Reconciliation_Sign_Off.pdf
```

### Key Questions Answered
1. **Are all intercompany transactions recorded?**
   - ✅ Complete transaction map exported
   - ✅ GL references traceable to source documents

2. **Are accounts 4411/4412 balanced?**
   - ✅ Reconciliation report shows variance
   - ✅ Any differences explained and documented

3. **Are settlements documented?**
   - ✅ Settlement history with GL references
   - ✅ Bank confirmations or offset memos retained

4. **Is related party disclosure complete?**
   - ✅ Disclosure narrative ready for financial statements
   - ✅ Fair market value assessments documented

5. **Is everything compliant?**
   - ✅ Compliance check report with findings
   - ✅ Remediation plan for any exceptions

---

## TROUBLESHOOTING

### Issue: 4411/4412 Variance > 0

**Possible Causes:**
1. Timing differences (one entity recorded, other hasn't yet)
2. Rounding differences (unlikely if both use MUR 2 decimals)
3. Missing GL entries (transaction recorded on one side only)
4. Erroneous entries (duplicate or incorrect amount)

**Resolution:**
1. Run reconciliation query to identify specific transactions
2. Compare GL entries side-by-side by date and amount
3. Investigate any one-sided entries
4. Adjust or record missing entries
5. Document variance reason in reconciliation report

### Issue: Transaction Count Mismatch

**Possible Causes:**
1. Unsettled transactions (recorded but not settled)
2. Offset transactions (two offsetting entries = net effect)
3. Reversal entries (correction entries for prior period)

**Resolution:**
1. Filter out unsettled/reversed transactions if appropriate
2. Verify business logic with Finance Controller
3. Update reconciliation with explanation

### Issue: Missing Documentation

**Possible Causes:**
1. Invoice not linked in GL entry
2. Supporting documents not uploaded
3. Approval not recorded

**Resolution:**
1. Locate supporting documents
2. Update GL entry with correct invoice_id
3. Document approval in approval_authority field
4. Re-run compliance check

---

## FILE LOCATIONS

### Source Code
- `/lib/audit/intercompany-reconciliation.ts` - Core logic
- `/lib/audit/intercompany-export.ts` - Export utilities
- `/app/api/audit/intercompany-reconciliation/generate/route.ts` - Generate endpoint
- `/app/api/audit/intercompany-reconciliation/download/route.ts` - Download endpoint

### Documentation
- `/docs/PHASE_5B_INTERCOMPANY_RECONCILIATION.md` - This file
- `/PLAN_ACTION_OUTIL_PARFAIT.md` - Overall phase plan

### Exports
- `/exports/INTERCOMPANY_TRANSACTION_MAP.csv` - Generated by task
- `/exports/INTERCOMPANY_4411_4412_RECONCILIATION.xlsx` - Generated by task
- `/exports/INTERCOMPANY_SETTLEMENTS.md` - Generated by task
- `/exports/RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md` - Generated by task
- `/exports/RELATED_PARTY_COMPLIANCE_CHECK.md` - Generated by task

---

## SUCCESS CRITERIA CHECKLIST

- [ ] All intercompany transactions identified and mapped
- [ ] Transaction map CSV exports correctly (100% of transactions)
- [ ] 4411/4412 reconciliation complete
- [ ] Variance documented (= 0 or explained with sign-off)
- [ ] Settlement history compiled with GL references
- [ ] Related party disclosure narrative ready for footnote
- [ ] Compliance check identifies any documentation gaps
- [ ] All 5 export files generated successfully
- [ ] Big 4 auditor can review without additional inquiry
- [ ] Audit trail logs all report generation and downloads

---

## SIGN-OFF

**Finance Controller:** _________________ Date: _________  
**CFO:** _________________ Date: _________  
**CTO:** _________________ Date: _________  

---

*Generated for LEXORA Phase 5B - Intercompany Reconciliation Agent*  
*Big 4 Audit Ready - All IAS 24 Requirements Covered*
