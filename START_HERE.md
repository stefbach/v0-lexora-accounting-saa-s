# 🚀 START HERE - Lexora Reconciliation Codebase Exploration

**Last Updated**: April 10, 2026  
**Status**: ✅ Complete & Ready to Use

---

## 📍 Where to Begin

### If you have **5 minutes**:
→ Read: **README_CODEBASE_EXPLORATION.md**
- Quick overview of system architecture
- 6 matching strategies at a glance
- How to use the API
- Key takeaways

### If you have **15 minutes**:
→ Read: **RECONCILIATION_SYSTEM_INDEX.md** 
- Complete navigation guide
- Type definitions & database schema
- Matching algorithm details
- Workflow diagrams

### If you have **30+ minutes**:
→ Read: **CODEBASE_EXPLORATION_COMPLETE.md**
- Full technical specification
- All API endpoints documented
- Database schema with examples
- All utility functions
- Complete workflows

### For source code reference:
→ Read: **FULL_FILE_CONTENTS.md**
- Complete smart/route.ts
- Complete smart/apply/route.ts
- Complete taux-change.ts
- Matching engine exports

---

## 📚 What Each Document Covers

| Document | Length | Best For | Start Time |
|----------|--------|----------|------------|
| **README_CODEBASE_EXPLORATION.md** | 5 pages | Overview & quick answers | 5 min |
| **RECONCILIATION_SYSTEM_INDEX.md** | 8 pages | Navigation & understanding flow | 15 min |
| **CODEBASE_EXPLORATION_COMPLETE.md** | 12 pages | Deep technical understanding | 30 min |
| **FULL_FILE_CONTENTS.md** | 10 pages | Source code reference | 20 min |

---

## 🎯 The System in 30 Seconds

**Lexora Reconciliation** automatically matches bank transactions with invoices:

1. **Smart Analysis** (`/smart` endpoint)
   - 6 matching strategies in cascade
   - Returns confidence scores
   - Fast: <5 seconds for 200 transactions

2. **Apply Proposals** (`/smart/apply` endpoint)
   - Batch applies high-confidence matches
   - 5-step validation per match
   - Generates accounting entries

3. **Manual Operations** (`/rapprochement` endpoint)
   - Manual linking
   - Pre-classification (fees, internal transfers, etc.)
   - Full reconciliation workflow

---

## 🔍 What Was Explored

### 4 Core Files ✅
- `app/api/comptable/rapprochement/smart/route.ts` (smart matching)
- `app/api/comptable/rapprochement/smart/apply/route.ts` (apply batch)
- `app/api/comptable/rapprochement/route.ts` (main handler, 12 actions)
- `app/client/rapprochement/page.tsx` (frontend UI)

### 4 Key Utility Functions ✅
- `analyzeAllTransactions()` - Main matching entry point
- `normalize()` - Party name normalization
- `getTauxChange()` - Exchange rate fetcher
- `tiersScore()` - Party similarity scorer

### 5 Database Tables ✅
- `releves_bancaires` - Bank statements
- `factures` - Invoices
- `taux_change` - Exchange rates
- `rapprochement_patterns` - Learned patterns
- (Plus transaction_json JSONB structure)

---

## 🧠 Key Concepts to Understand

### The 6 Matching Strategies
```
1. Exact Reference      → Find invoice number in bank libellé (100%)
2. Exact Amount         → Amount matches + strong party similarity (95%)
3. Close Amount         → Amount within 2% + tiers match (85%)
4. Grouped Sum          → Sum of multiple invoices = payment (87-96%)
5. Partial Payment      → Payment = 10-90% of invoice (70%)
6. Historical Patterns  → Learn from previous matches (80-99%)
```

### TDS Awareness (Tax Withholding)
- Detects if amount difference = 2-6% (typical in Mauritius)
- Boosts confidence automatically when detected

### Multi-Currency Support
- All amounts converted to MUR (Mauritian Rupee)
- FX rates: EUR 46.50, GBP 54.20, USD 44.80
- Tolerance: 5% for cross-currency, 1% for same-currency

### Party Name Matching
- Normalizes names (removes accents, legal suffixes, punctuation)
- Uses Jaccard similarity (word overlap)
- Threshold: 0.40 (0.25 for very short names)

---

## 📊 System Architecture

```
┌─────────────────────────────────────┐
│     Frontend (React Component)      │
│   app/client/rapprochement/page.tsx │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      API Layer (Next.js Routes)     │
├─────────────────────────────────────┤
│ /smart                  (analysis)   │
│ /smart/apply           (batch apply) │
│ /rapprochement         (main ops)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Matching Engine Library          │
├─────────────────────────────────────┤
│ lib/accounting/matching-engine.ts   │
│ - analyzeAllTransactions()          │
│ - findBestMatch()                   │
│ - normalize(), tiersScore()         │
│ - toMUR() (FX conversion)           │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Supabase Database              │
├─────────────────────────────────────┤
│ releves_bancaires (transactions)    │
│ factures (invoices)                 │
│ taux_change (FX rates)              │
│ rapprochement_patterns (learned)    │
└─────────────────────────────────────┘
```

---

## 🚀 How It Works (Simple Example)

### Bank Transaction Arrives
```json
{
  "date": "2025-06-15",
  "libelle": "TRANSFER ACME CORP",
  "debit": "5000.00",
  "tiers_detecte": "ACME CORP"
}
```

### System Searches Invoices
```json
[
  {
    "numero_facture": "INV-001",
    "tiers": "ACME Corporation",
    "montant_ttc": "5000.00",
    "date_facture": "2025-06-10",
    "type_facture": "fournisseur"
  }
]
```

### Matching Engine Tries Strategies
```
1. Exact Reference? → Not found (INV-001 not in "TRANSFER ACME CORP")
2. Exact Amount? → YES! 5000 = 5000
   - Party match: "ACME CORP" vs "ACME Corporation" = 0.9 (excellent)
   - Date: 2025-06-15 vs 2025-06-10 = 5 days (within terms)
   → Confidence: 0.95 ✅
```

### Proposal Generated
```json
{
  "strategy": "exact_amount",
  "confidence": 0.95,
  "reasoning": "Montant exact, tiers 90% similaire, delai 5j (dans termes)",
  "facture_ids": ["uuid-of-invoice"],
  "needs_arbitration": false
}
```

### User Reviews & Applies
```
Click "Apply All"
→ Confidence ≥ 0.85 → Auto-apply
→ Update transaction.statut = "rapproche"
→ Update facture.statut = "paye"
→ Generate BNQ journal entries
```

---

## 📝 API Quick Reference

### Analyze Transactions
```typescript
POST /api/comptable/rapprochement/smart
{
  "societe_id": "uuid",
  "date_debut": "2025-06-01",
  "date_fin": "2025-06-30"
}
// Returns: proposals[] with confidence scores
```

### Apply Batch Proposals
```typescript
POST /api/comptable/rapprochement/smart/apply
{
  "societe_id": "uuid",
  "proposals": [...],
  "min_confidence": 0.85  // Optional
}
// Returns: applied count, errors, consistency stats
```

### Full Auto-Rapprochement
```typescript
POST /api/comptable/rapprochement
{
  "action": "auto_rapprocher",
  "societe_id": "uuid",
  "date_debut": "2025-06-01",
  "date_fin": "2025-06-30"
}
// Returns: matched, interne, frais, salaire, mra, propose, not_matched
```

---

## ✅ Validation Before Applying

The system checks **5 things** before applying each match:

1. ✅ Transaction exists and not already reconciled
2. ✅ No in-batch duplicate factures
3. ✅ All factures exist and haven't been reconciled
4. ✅ Amount within 5% tolerance
5. ✅ Direction correct (debit→supplier, credit→client)

---

## 🎓 Next Steps

1. **Understand the architecture** → Read README_CODEBASE_EXPLORATION.md
2. **Learn the matching algorithm** → Read RECONCILIATION_SYSTEM_INDEX.md (Matching Algorithm Details section)
3. **Explore the API** → Look at FULL_FILE_CONTENTS.md or CODEBASE_EXPLORATION_COMPLETE.md
4. **Reference the database** → See CODEBASE_EXPLORATION_COMPLETE.md (Database Schema section)

---

## 💡 Key Insights

### Why 6 Strategies?
- Different companies provide different data quality
- Some have invoice numbers in bank description
- Some have exact amounts but different party names
- Some pay multiple invoices at once
- Some make partial/advance payments
- Some repeat patterns over time

### Why Confidence Scoring?
- Not all matches are 100% certain
- Allows user to review lower-confidence matches
- Distinguishes between auto-apply (≥0.85) and manual review (0.65-0.85)
- Prevents false positive matches

### Why Multi-Currency?
- International companies in Mauritius
- Need to handle USD, EUR, GBP payments
- Exchange rates stored in DB and updated daily

### Why Historical Patterns?
- Company A always pays via same process
- Pattern learning makes future matches faster & more accurate
- Incremental confidence boost per successful match

---

## 🔗 Document Index

```
📄 Quick Start (This File)
   └─ You are here

📄 README_CODEBASE_EXPLORATION.md
   ├─ System overview
   ├─ API usage examples
   ├─ Performance stats
   └─ Common issues

📄 RECONCILIATION_SYSTEM_INDEX.md
   ├─ Complete file listing
   ├─ Type definitions
   ├─ Matching strategies detail
   ├─ Workflows with flowcharts
   └─ Validation procedures

📄 CODEBASE_EXPLORATION_COMPLETE.md
   ├─ All endpoints documented
   ├─ All 12 POST actions
   ├─ Matching engine code
   ├─ Database schema
   └─ Utility functions

📄 FULL_FILE_CONTENTS.md
   ├─ smart/route.ts (complete)
   ├─ smart/apply/route.ts (complete)
   ├─ taux-change.ts (complete)
   └─ Code references
```

---

## ❓ FAQ

**Q: How fast is the matching?**
A: <5 seconds for 200 transactions (pure heuristic, no LLM)

**Q: Can it handle multi-currency?**
A: Yes! Converts to MUR using ExchangeRate-API with fallback rates

**Q: What if there's no exact match?**
A: System tries 5 additional strategies before giving up. Returns 0.5+ confidence proposals

**Q: Can I apply matches manually?**
A: Yes! Use `/rapprochement` endpoint with `action: lettrer_manuel`

**Q: Does it handle tax withholding?**
A: Yes! Detects 2-6% differences typical of TDS and boosts confidence

**Q: Can it learn from past matches?**
A: Yes! Stores patterns in `rapprochement_patterns` table and uses them in future matches

---

## 🎯 You Now Know

✅ How the reconciliation system works  
✅ The 6 matching strategies and when each applies  
✅ How to call the APIs  
✅ What data gets stored in the database  
✅ How validation works  
✅ How to extend the system  

---

**Ready to dive deeper? Pick your document above and start reading! 📖**
