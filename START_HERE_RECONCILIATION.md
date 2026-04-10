# 🚀 LEXORA Reconciliation System — START HERE

**Generated**: April 10, 2026  
**Status**: ✅ Complete codebase exploration with full documentation

---

## 📚 Documentation Structure

You have **3 key documents** to understand the reconciliation system:

### 1. **QUICK_REFERENCE_RECONCILIATION.md** ⭐ START HERE (15 min)
   - High-level overview of the 5 matching strategies
   - Quick reference tables for API routes, thresholds, statuses
   - Common pitfalls and debugging tips
   - **Best for**: Quick lookups, understanding the big picture

### 2. **LEXORA_RAPPROCHEMENT_COMPLETE.md** (Comprehensive, 90 min)
   - Full system architecture (13 detailed sections)
   - Complete file contents and explanations
   - Database schema and tables
   - Data flow diagrams
   - Performance considerations
   - **Best for**: Deep understanding, architecture decisions

### 3. **FILE_MANIFEST_RECONCILIATION.md** (Navigation guide, 10 min)
   - Which file does what
   - Code structure conventions
   - Common tasks (how to add features)
   - Debugging guide
   - **Best for**: Finding code, modifying features

---

## 🎯 What Is The Reconciliation System?

The LEXORA reconciliation engine automatically matches bank transactions to invoices using 5 intelligent strategies:

```
Bank Transaction: 50,000 MUR from ACME on 2024-06-15
            ↓
      [Matching Engine]
            ↓
Strategies tried (cascade order):
  1. Invoice # in bank description?          → 100% confidence
  2. Exact amount + supplier name match?     → 95% confidence
  3. Close amount (±1%) + name similarity?   → 85% confidence
  4. Multiple invoices from same supplier sum to this amount? → 85% confidence
  5. Partial payment (10-90% of invoice)?    → 70% confidence
            ↓
Result: ✅ Matched Invoice INV-2024-1234 (100% confidence)
            ↓
Auto-apply if confidence ≥85% OR show to user for review
            ↓
Auto-generate journal entries in general ledger
```

---

## 🔥 Key Files to Know

### **Core Algorithm** (What matches what?)
📄 `lib/accounting/matching-engine.ts` (354 lines)
- `normalize()` — Clean up supplier names for comparison
- `tiersScore()` — Score name similarity 0-1 (Jaccard similarity)
- `findBestMatch()` — Try all 5 strategies for one transaction
- `analyzeAllTransactions()` — Process multiple transactions in batch

### **Apply Matches** (Update database + generate GL entries)
📄 `lib/accounting/ecritures-factures.ts` (303 lines)
- `createEcrituresForFacture()` — Generate invoice journal entries (401, 706, etc.)
- `createEcrituresForPayment()` — Generate payment offsetting entries (512, etc.)

### **API Routes** (How to call it)

| Endpoint | Purpose | Use When |
|----------|---------|----------|
| `POST /api/comptable/rapprochement/smart` | Analyze & propose matches | User clicks "Analyze" |
| `POST /api/comptable/rapprochement/smart/apply` | Batch apply proposals | User clicks "Apply All" |
| `POST /api/comptable/rapprochement/agent` | AI-assisted with Claude | Advanced matching needed |
| `POST /api/comptable/rapprochement/reset` | Delete all reconciliation | Reset everything (⚠️ destructive) |

### **UI** (Where users interact)
📄 `app/client/rapprochement/page.tsx` (1203 lines)
- Calls the API routes above
- Shows proposals with confidence badges
- Allows manual review/approval before applying

---

## 🎛️ Key Concepts

### **Direction Rule** (CRITICAL!)
```
DEBIT transaction  →  Supplier payment  →  Match to supplier invoice
CREDIT transaction →  Client payment    →  Match to client invoice

If you get this wrong, the matching will fail!
```

### **Amount Tolerance**
```
Same currency (MUR):     ±1%
Cross-currency (EUR):    ±5% or 100 MUR (after FX conversion)

Example: 50,000 MUR transaction can match 50,000-50,500 MUR invoice
```

### **Confidence Thresholds**
```
≥0.95    ✅ Auto-apply (no questions)
0.85-95  ✅ Auto-apply with stats
0.65-85  ⚠️  Show to user for review
<0.65    ❌ Skip/ignore
```

### **Statuses**
- Factures: `en_attente` (pending) → `paye` (paid)
- Transactions: `non_identifie` (unmatched) → `rapproche` (matched)

---

## 🚀 Quick Start: How to Use

### **Scenario 1: Auto-reconcile (Smart Engine)**
```
User clicks "Smart Rapprochement" on /client/rapprochement

1. POST /api/comptable/rapprochement/smart
   ↓ Analyzes 50-250 unmatched transactions
   ↓ Returns proposals with confidence scores

2. User sees summary dialog:
   - 35 high-confidence matches (≥85%)
   - 13 need review (65-85%)
   - 2 orphaned (no match found)

3. User clicks "Apply All"
   ↓ POST /api/comptable/rapprochement/smart/apply (min_confidence=0.85)
   ↓ Updates: transaction.lettre, facture.statut, + GL entries

4. Done! ✅ 35 reconciled automatically
```

### **Scenario 2: AI-Assisted Matching**
```
User clicks "Analyze with AI" (Claude agent)

1. POST /api/comptable/rapprochement/agent
   ↓ Claude uses tools: list_transactions, list_invoices, apply_match, etc.
   ↓ Reasons through matches with context
   ↓ Applies high-confidence matches

2. Returns summary:
   - Tool calls made
   - Matches applied
   - Issues identified
```

### **Scenario 3: Manual Linking**
```
User manually links one transaction to one or more invoices

1. Click "Link" on a transaction in the UI
2. Select invoice(s) from dialog
3. Click "Confirm"
4. Calls apply_match endpoint with direct_action mode
5. Same GL entries generated automatically
```

---

## 🧮 How Matching Works (Technical)

### **Strategy 1: Exact Reference** (100%)
```
if "INV-2024-001" in bank_libelle then ✅ Match with INV-2024-001
```

### **Strategy 2-3: Amount + Tiers** (95-85%)
```
Amount:     within tolerance
Tiers:      normalized names similar (Jaccard >= 0.40)
Date:       within payment terms + 10 days
Confidence: based on exact amount + name strength
```

### **Strategy 4: Grouped Sum** (85%)
```
Find 2-5 invoices from same supplier whose sum = transaction amount
All invoices unpaid, amount tolerance 5%, tiers match >=50%
```

### **Strategy 5: Partial** (70%)
```
Payment is 10-90% of invoice amount
Strong tiers match required (>=0.7)
Example: 5,000 payment against 10,000 invoice = acompte (partial)
```

---

## 📊 Database Tables (What Gets Updated)

### **1. releves_bancaires** (Bank Statement)
```javascript
{
  id: "statement-123",
  transactions_json: [
    {
      id: "tx-456",
      date: "2024-06-15",
      libelle: "Paiement INV-001 ACME Ltd",
      tiers_detecte: "ACME",
      debit: 50000,  // If > 0: supplier payment
      credit: 0,
      devise: "MUR",
      statut: "rapproche",  // After matching
      lettre: "SM123456",   // Reconciliation marker
      facture_ids: ["fac-001"],
      matched_type: "facture_unique"
    }
  ]
}
```

### **2. factures** (Invoice)
```javascript
{
  id: "fac-001",
  numero_facture: "INV-2024-001",
  tiers: "ACME Ltd",
  type_facture: "fournisseur",
  montant_ttc: 50000,
  montant_mur: 50000,
  devise: "MUR",
  statut: "paye",  // After matching
  rapproche_releve_id: "statement-123",  // Link back
  rapproche_transaction_idx: 0,
  rapproche_date: "2024-06-20",
  rapproche_source: "smart"
}
```

### **3. ecritures_comptables_v2** (GL Entry, auto-generated)
```javascript
{
  journal: "BNQ",  // Bank
  ref_folio: "BANK-statement-123-0",  // Unique link
  numero_compte: "401",  // Supplier
  debit_mur: 50000,
  credit_mur: 0,
  date_ecriture: "2024-06-15",
  description: "Paiement facture INV-2024-001 — ACME Ltd"
}
```

---

## ⚡ Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Smart analyze | <5s | Pure heuristic, 200 transactions |
| Smart apply | 15-30s | Batch writes, 35 matches |
| Agent loop | 10-55s | Max 4 Claude calls |
| Grouping logic | <1s | Limited to 5-facture subsets |

---

## ⚠️ 5 Pre-Apply Checks (Why Matches Fail)

Before any match is applied, 5 checks are performed:

```
1. Transaction not already reconciled
   ✗ Error: "Transaction already matched to INV-001"

2. All invoices exist
   ✗ Error: "Invoice not found"

3. Invoices not already paid
   ✗ Error: "Invoice already paid"

4. Amount within tolerance
   ✗ Error: "Amount difference 15% (>5% limit)"

5. Direction matches (debit→supplier, credit→client)
   ✗ Error: "Debit transaction can't match client invoice"
```

If **ANY** check fails → match rejected
If **ALL** pass → match applied + GL entries generated

---

## 🔧 How to Modify the System

### **Change Amount Tolerance**
File: `lib/accounting/matching-engine.ts`, function `tryAmountAndTiers()`
```javascript
const tolerance = sameCurrency ? 0.01 : 0.05  // ← Change here
```

### **Add New Matching Strategy**
1. Create `tryMyStrategy()` function in `matching-engine.ts`
2. Add to strategies array in `findBestMatch()`
3. Return a `MatchProposal` with confidence score

### **Adjust Confidence Calculation**
File: `lib/accounting/matching-engine.ts`, each strategy function
```javascript
let confidence = 0.85  // ← Adjust base confidence
if (withinTerms) confidence += 0.05  // ← Adjust modifiers
```

### **Change FX Rates**
File: `lib/matching-engine.ts`
```javascript
const FALLBACK_FX: Record<string, number> = {
  EUR: 46.50,  // ← Change here
  GBP: 54.20,
  USD: 44.80,
  MUR: 1,
}
```

---

## 🐛 Debugging

### **Proposal not appearing?**
1. ✓ Is transaction marked as 'rapproche'? (should NOT be)
2. ✓ Do unpaid invoices exist for this supplier?
3. ✓ Run smart endpoint with date filters to isolate
4. ✓ Check console logs for rejection reason

### **Apply failing?**
1. ✓ Check all 5 pre-apply verifications above
2. ✓ Verify amount within 5% tolerance
3. ✓ Verify direction (debit→supplier, credit→client)
4. ✓ Check facture.statut !== 'paye'

### **GL entries not generating?**
1. ✓ Check `createEcrituresForPayment()` called
2. ✓ Verify `ref_folio` format: `BANK-{releve_id}-{idx}`
3. ✓ Verify `societe_id` is valid

---

## 📖 Reading Path

**New to LEXORA?** Follow this path:

1. **5 min**: Read this file (you are here ✓)
2. **15 min**: Read `QUICK_REFERENCE_RECONCILIATION.md`
3. **45 min**: Read `lib/accounting/matching-engine.ts` source code
4. **20 min**: Read `app/api/comptable/rapprochement/smart/route.ts`
5. **20 min**: Read `app/api/comptable/rapprochement/smart/apply/route.ts`
6. **Done!** You understand the system

**Total Time**: ~2 hours to full expertise

---

## 🆘 Still Have Questions?

- **Architecture**: See `LEXORA_RAPPROCHEMENT_COMPLETE.md` (Section 2-4)
- **API Details**: See `FILE_MANIFEST_RECONCILIATION.md` (Section 🔌)
- **Database**: See `LEXORA_RAPPROCHEMENT_COMPLETE.md` (Section 6)
- **UI Components**: See `LEXORA_RAPPROCHEMENT_COMPLETE.md` (Section 7)
- **Common Tasks**: See `FILE_MANIFEST_RECONCILIATION.md` (Section 🚀)
- **Debugging**: See `FILE_MANIFEST_RECONCILIATION.md` (Section 📞)

---

## ✅ Checklist: Ready to Build?

Before starting a new feature, verify:

- [ ] I understand the 5 matching strategies
- [ ] I know the direction rule (debit→supplier, credit→client)
- [ ] I understand confidence thresholds (0.85+ auto-apply)
- [ ] I know the 5 pre-apply verifications
- [ ] I've read the quick reference card
- [ ] I know which file does what (from FILE_MANIFEST)

**Once you have ✅ all above**, you're ready to build!

---

## 📊 System Diagram

```
BANK STATEMENT
    ↓ import
releves_bancaires.transactions_json
    ↓ unmatched = statut !== 'rapproche'
[50 transactions]
    ↓
MATCHING ENGINE (5 strategies)
├─ exact_reference (100%)
├─ exact_amount + tiers (95%)
├─ close_amount + tiers (85%)
├─ grouped_sum (85%)
└─ partial (70%)
    ↓
PROPOSALS [48 matches]
├─ 35 high-confidence (≥85%)
├─ 13 need review (65-85%)
└─ 2 orphans (<65%)
    ↓
BATCH APPLY (min_confidence=0.85)
├─ 5 verifications per proposal
├─ Update transactions (lettre, facture_ids, statut)
├─ Update factures (statut='paye', rapproche_*)
└─ Generate GL entries (BANK-*)
    ↓
GENERAL LEDGER (ecritures_comptables_v2)
├─ 401 Fournisseurs (supplier offset)
└─ 512 Banque (bank offset)
    ↓
✅ RECONCILED
```

---

**🎉 You're ready! Start with QUICK_REFERENCE_RECONCILIATION.md**

