# 📚 LEXORA Reconciliation Documentation Index

**Generated**: April 10, 2026  
**Location**: `/home/work/.openclaw/workspace/lexora/`

---

## 📖 Main Documentation Files

### **START_HERE_RECONCILIATION.md** ⭐ BEGIN HERE
- **Size**: 12 KB | **Read time**: 5-10 min
- **Content**: 
  - What is reconciliation? (high-level overview)
  - 5 matching strategies explained
  - Key concepts (direction rule, tolerance, thresholds)
  - Quick start scenarios (auto, AI, manual)
  - How matching works (technical)
  - Database tables explained with examples
  - Debugging tips
  - Reading path (2-3 hours to expertise)
- **Best for**: First-time users, understanding the "why"
- **Use when**: You're new to the system

---

### **QUICK_REFERENCE_RECONCILIATION.md** 📋
- **Size**: 6.4 KB | **Read time**: 15 min
- **Content**:
  - 5 strategies comparison table
  - Key math formulas (tolerance, similarity, FX)
  - API routes summary
  - Direction rule (CRITICAL)
  - Journal entries auto-generated
  - Confidence thresholds
  - Lettrage codes
  - Key DB tables
  - 5 pre-apply verifications
  - Utility functions
  - Performance tips
  - Common pitfalls
  - Status values
  - UI components list
- **Best for**: Quick lookup, pocket reference
- **Use when**: You need to find something fast

---

### **LEXORA_RAPPROCHEMENT_COMPLETE.md** 📘
- **Size**: 20 KB | **Read time**: 90 min
- **Content**: 13 major sections:
  1. Directory structure (top-level)
  2. Key files: Matching engine (354 lines)
  3. API Routes: Rapprochement (4 routes)
  4. Accounting utilities (ecritures, FX)
  5. UI: Rapprochement page (1203 lines)
  6. Database tables & migrations
  7. shadcn/ui components
  8. Utility functions & patterns
  9. Key patterns & conventions
  10. Complete data flow
  11. Error handling & edge cases
  12. Performance considerations
  13. Next steps for new features
- **Best for**: Deep system understanding
- **Use when**: You're implementing a major feature

---

### **FILE_MANIFEST_RECONCILIATION.md** 📍
- **Size**: 8.8 KB | **Read time**: 10-15 min
- **Content**:
  - Core files breakdown (matching engine, journals, FX)
  - API routes detailed (smart, apply, agent, reset)
  - UI pages
  - Database migrations
  - UI components
  - Related utilities & modules
  - Key files reading order
  - Code structure conventions
  - Common tasks (how to):
    - Add new matching strategy
    - Change tolerances
    - Modify FX rates
    - Add UI fields
    - Debug a transaction
  - Support & debugging checklist
- **Best for**: Navigation & how-to guide
- **Use when**: You're building a new feature

---

## 🎯 Quick Navigation

**I want to understand...**

| Question | Document | Section |
|----------|----------|---------|
| What is reconciliation? | START_HERE | "🎯 What Is Reconciliation" |
| The 5 matching strategies | QUICK_REFERENCE | "🎯 Core Matching Strategies" |
| How direction rule works | QUICK_REFERENCE | "🔄 Direction Rule (CRITICAL)" |
| Complete system architecture | LEXORA_COMPLETE | Sections 1-4 |
| How database is organized | LEXORA_COMPLETE | Section 6 |
| How to add a feature | FILE_MANIFEST | Section 🚀 |
| How to debug a problem | FILE_MANIFEST | Section 📞 |
| What each file does | FILE_MANIFEST | Section 📂 |
| API route details | FILE_MANIFEST | Section 🔌 |
| Code conventions | FILE_MANIFEST | Section 📝 |

---

## 📁 Full File Listing (Provided in Docs)

### **Core Algorithm**
```
lib/accounting/matching-engine.ts (354 lines)
├─ normalize() — Clean supplier names
├─ tiersScore() — Similarity scoring
├─ toMUR() — Currency conversion
├─ tryExactReference() — Strategy 1
├─ tryAmountAndTiers() — Strategy 2-3
├─ tryGroupedSum() — Strategy 4
├─ tryPartial() — Strategy 5
├─ findBestMatch() — Single transaction
└─ analyzeAllTransactions() — Batch processing
```

### **Journal Entries**
```
lib/accounting/ecritures-factures.ts (303 lines)
├─ createEcrituresForFacture() — Invoice entries
└─ createEcrituresForPayment() — Payment entries
```

### **Exchange Rates**
```
lib/taux-change.ts (136 lines)
├─ getTauxChangeFromDB()
├─ fetchAndStoreRates()
├─ getTauxChange()
└─ convertToMUR()
```

### **API Routes**
```
app/api/comptable/rapprochement/
├─ smart/route.ts (211 lines)
├─ smart/apply/route.ts (260 lines)
├─ agent/route.ts (559 lines)
├─ reset/route.ts (150 lines)
├─ consistency/route.ts
└─ route.ts (legacy)
```

### **User Interface**
```
app/client/rapprochement/page.tsx (1203 lines)
└─ UI for smart reconciliation + manual linking

app/comptable/rapprochement/page.tsx
└─ Accountant-specific features
```

### **Database**
```
supabase/migrations/ (23 files)
├─ 001_initial_schema.sql
├─ 010_financial_modules.sql
├─ 019_roles_rapprochement_lettrage.sql
├─ 021_grand_livre_etats_financiers.sql
└─ ... (19 more files)

Key tables:
├─ releves_bancaires
├─ factures
├─ ecritures_comptables_v2
├─ taux_change
└─ dossiers
```

### **UI Components**
```
components/ui/ (30+ shadcn/ui components)
├─ card.tsx, dialog.tsx, button.tsx, badge.tsx
├─ table.tsx, select.tsx, input.tsx, textarea.tsx
├─ tooltip.tsx, skeleton.tsx, etc.
└─ MonthPicker.tsx (custom)
```

---

## 🎓 Reading Paths

### **Path 1: Quick Understanding (30 min)**
1. START_HERE_RECONCILIATION.md (10 min)
2. QUICK_REFERENCE_RECONCILIATION.md (15 min)
3. Skip to implementation

### **Path 2: Moderate Understanding (2 hours)**
1. START_HERE_RECONCILIATION.md (10 min)
2. QUICK_REFERENCE_RECONCILIATION.md (15 min)
3. matching-engine.ts source code (45 min)
4. smart/route.ts (20 min)
5. smart/apply/route.ts (20 min)
6. PAGE.tsx UI (30 min)

### **Path 3: Complete Expertise (4 hours)**
1. START_HERE_RECONCILIATION.md (10 min)
2. QUICK_REFERENCE_RECONCILIATION.md (15 min)
3. FILE_MANIFEST_RECONCILIATION.md (15 min)
4. LEXORA_RAPPROCHEMENT_COMPLETE.md (90 min)
5. All source files (90 min)
6. Database migrations (30 min)

---

## 🔑 Key Takeaways

### **The 5 Matching Strategies**
1. Exact reference (100%) — Invoice # in bank description
2. Exact amount + tiers (95%) — Amount exact, names similar
3. Close amount + tiers (85%) — Amount within ±1-5%, names similar
4. Grouped sum (85%) — Multiple invoices sum to transaction
5. Partial payment (70%) — Payment is 10-90% of invoice

### **The Direction Rule**
- **DEBIT transaction** → Money going out → Supplier payment
- **CREDIT transaction** → Money coming in → Client payment
- **Always verify this before matching!**

### **Confidence Thresholds**
- ≥0.95 → Auto-apply immediately
- 0.85-95 → Auto-apply with stats reporting
- 0.65-85 → Show user for manual review
- <0.65 → Skip/ignore

### **5 Pre-Apply Checks**
1. Transaction not already reconciled
2. All invoices exist
3. Invoices not already paid
4. Amount within 5% tolerance
5. Direction matches (debit→supplier, credit→client)

### **Performance**
- Smart analyze: <5 seconds
- Smart apply: 15-30 seconds
- Agent loop: 10-55 seconds (max 4 iterations)

---

## 📚 Files Included in Documentation

✅ Full source code of:
- `lib/accounting/matching-engine.ts` (354 lines)
- `lib/accounting/ecritures-factures.ts` (303 lines)
- `lib/taux-change.ts` (136 lines)
- `app/api/comptable/rapprochement/smart/route.ts` (211 lines)
- `app/api/comptable/rapprochement/smart/apply/route.ts` (260 lines)
- `app/api/comptable/rapprochement/agent/route.ts` (559 lines)
- `app/api/comptable/rapprochement/reset/route.ts` (150 lines)
- `app/client/rapprochement/page.tsx` (partial: 200 + 100 lines)

✅ Directory structures and file listings for:
- `supabase/migrations/` (23 files)
- `components/ui/` (30+ components)
- `lib/accounting/` (2 files)
- `app/api/comptable/rapprochement/` (6 routes)

---

## 🚀 Next Steps

1. **Read** `START_HERE_RECONCILIATION.md` (start here!)
2. **Reference** `QUICK_REFERENCE_RECONCILIATION.md` (for lookups)
3. **Dive deep** into `LEXORA_RAPPROCHEMENT_COMPLETE.md` (when needed)
4. **Navigate** using `FILE_MANIFEST_RECONCILIATION.md` (to find things)

After these docs, you'll be able to:
- ✅ Understand the matching engine
- ✅ Build new matching strategies
- ✅ Modify confidence calculations
- ✅ Debug failed matches
- ✅ Add new UI features
- ✅ Extend the system

---

## ❓ FAQ

**Q: Where do I start?**  
A: Read `START_HERE_RECONCILIATION.md` — it's written for this purpose.

**Q: I need to understand a specific API route.**  
A: Check `FILE_MANIFEST_RECONCILIATION.md` Section 🔌, or look for the route in `LEXORA_RAPPROCHEMENT_COMPLETE.md`.

**Q: How do I modify the matching logic?**  
A: Read `matching-engine.ts` source code, then check `FILE_MANIFEST_RECONCILIATION.md` Section 🚀.

**Q: I need to debug why a match isn't working.**  
A: Check `FILE_MANIFEST_RECONCILIATION.md` Section 📞.

**Q: What database tables are involved?**  
A: See `LEXORA_RAPPROCHEMENT_COMPLETE.md` Section 6, or `QUICK_REFERENCE_RECONCILIATION.md`.

---

**All documentation generated April 10, 2026**  
**Status**: ✅ Complete and ready to use  
**Total files**: 4 comprehensive guides + full source code contents

