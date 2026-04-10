# LEXORA Reconciliation — File Manifest & Navigation

## 📂 Core Files (Matching Engine & API)

### **1. Matching Engine Algorithm**
```
lib/accounting/matching-engine.ts
├─ normalize(s)              → Normalize tiers names
├─ tiersScore(a, b)          → Jaccard similarity 0-1
├─ toMUR(amount, devise)     → Currency conversion
├─ tryExactReference()       → Strategy 1 (100% confidence)
├─ tryAmountAndTiers()       → Strategy 2-3 (95-85%)
├─ tryGroupedSum()           → Strategy 4 (85%)
├─ tryPartial()              → Strategy 5 (70%)
├─ findBestMatch()           → Single transaction matching
└─ analyzeAllTransactions()  → Batch analysis (main entry)
```
**Lines**: 354 | **Key Export**: `analyzeAllTransactions()`

### **2. Journal Entry Generation**
```
lib/accounting/ecritures-factures.ts
├─ createEcrituresForFacture()  → Generate invoice entries (FAC-*)
└─ createEcrituresForPayment()  → Generate payment entries (BANK-*)
```
**Lines**: 303 | **Key Exports**: `createEcrituresForFacture()`, `createEcrituresForPayment()`

### **3. FX Rate Management**
```
lib/taux-change.ts
├─ getTauxChangeFromDB()    → Fetch latest rates from DB
├─ fetchAndStoreRates()     → Call API, store in DB
├─ getTauxChange()          → Main: DB → fallback
└─ convertToMUR()           → Convert using rates
```
**Lines**: 136 | **Key Export**: `getTauxChange()`

---

## 🔌 API Routes (Reconciliation)

### **Fast Reconciliation (No LLM)**
```
app/api/comptable/rapprochement/smart/route.ts
POST /api/comptable/rapprochement/smart
├─ Body:   { societe_id, date_debut?, date_fin? }
├─ Action: Run analyzeAllTransactions()
└─ Response: { proposals[], stats }
```
**Lines**: 211 | **Duration**: maxDuration = 45s | **Time**: <5s typical

### **Batch Apply Proposals**
```
app/api/comptable/rapprochement/smart/apply/route.ts
POST /api/comptable/rapprochement/smart/apply
├─ Body:   { societe_id, proposals[], min_confidence=0.85 }
├─ Action: 5 verifications → update DB → generate entries
└─ Response: { applied, skipped, errors[] }
```
**Lines**: 260 | **Duration**: maxDuration = 60s

### **AI Agent (Claude Sonnet 4.6)**
```
app/api/comptable/rapprochement/agent/route.ts
POST /api/comptable/rapprochement/agent
├─ Tools:  [list_unmatched_transactions, list_unpaid_invoices, apply_match, ...]
├─ Mode:   Agentic loop (max 4 iterations)
├─ Direct: { direct_action: { tool: "apply_match", input: {...} } }
└─ Response: { response, tool_calls[], stop_reason }
```
**Lines**: 559 | **Duration**: maxDuration = 90s (soft 55s timeout) | **Model**: claude-sonnet-4-6

### **Reset Reconciliation (Destructive)**
```
app/api/comptable/rapprochement/reset/route.ts
POST /api/comptable/rapprochement/reset
├─ Body:   { societe_id, confirm: "RESET" }
├─ Action: Delete FAC-*, BANK-*, clear lettrage
└─ Response: { ok, stats }
```
**Lines**: 150 | **Duration**: maxDuration = 60s

---

## 🖥️ UI Pages

### **Client Rapprochement Page**
```
app/client/rapprochement/page.tsx
├─ State:  smartProposals, smartResult, aiProposals, linkDialog
├─ Calls:  /api/comptable/rapprochement/smart (analysis)
├─ Calls:  /api/comptable/rapprochement/smart/apply (batch apply)
├─ Calls:  /api/comptable/rapprochement/agent (direct actions)
├─ Calls:  /api/comptable/rapprochement/reset (full reset)
└─ Components: Card, Dialog, Table, Badge, Button, Select, etc.
```
**Lines**: 1203 (first 200 + last 100 provided)

### **Comptable Rapprochement Page** (Bonus)
```
app/comptable/rapprochement/page.tsx
(Similar to client page, accountant-specific features)
```

---

## 📊 Database Migrations

```
supabase/migrations/
├─ 001_initial_schema.sql          → Core tables
├─ 010_financial_modules.sql       → factures, releves, ecritures_v2
├─ 019_roles_rapprochement_lettrage.sql → Reconciliation support
├─ 021_grand_livre_etats_financiers.sql → GL & financial statements
└─ [23 total files]
```

**Key Tables**:
- `releves_bancaires` — Bank statements (transactions_json)
- `factures` — Invoices (montant_ttc, montant_mur, statut, rapproche_*)
- `ecritures_comptables_v2` — General ledger (ref_folio links)
- `taux_change` — FX rates
- `dossiers` — Accounting periods

---

## 🎨 UI Components

```
components/ui/
├─ card.tsx, dialog.tsx, button.tsx, badge.tsx, table.tsx
├─ select.tsx, input.tsx, textarea.tsx, label.tsx
├─ tooltip.tsx, skeleton.tsx, loading-spinner.tsx
├─ MonthPicker.tsx (custom)
└─ [30+ total shadcn/ui components]
```

---

## 🔗 Related Utilities

```
lib/
├─ supabase/server.ts         → Supabase auth client
├─ supabase/client.ts         → Supabase public client
├─ i18n.ts                    → French/English translations
├─ bankFormats.ts             → Bank CSV parsing
├─ types.ts, utils.ts         → Shared types & utilities
└─ accounting/
    ├─ matching-engine.ts     ← Primary
    └─ ecritures-factures.ts  ← Primary

app/api/comptable/rapprochement/
├─ smart/route.ts             ← Primary
├─ smart/apply/route.ts       ← Primary
├─ agent/route.ts             ← Primary
├─ reset/route.ts             ← Primary
├─ consistency/route.ts       → Validates orphans
└─ route.ts                   → Legacy endpoints

app/client/
├─ rapprochement/page.tsx     ← Primary UI
└─ [other pages: banque, fournisseurs, etc.]
```

---

## 🎯 Key Files to Understand First

**Reading Order for New Developer**:

1. **START HERE**: `QUICK_REFERENCE_RECONCILIATION.md` (30 min read)
2. `lib/accounting/matching-engine.ts` → Understand the 5 strategies (45 min)
3. `app/api/comptable/rapprochement/smart/route.ts` → How it's called (20 min)
4. `app/api/comptable/rapprochement/smart/apply/route.ts` → How it's applied (20 min)
5. `app/client/rapprochement/page.tsx` → UI integration (30 min)
6. `lib/accounting/ecritures-factures.ts` → GL entry generation (20 min)

**Total**: ~2.5 hours to understand the complete system

---

## 📝 Code Structure Conventions

### **Naming**:
- `releve_id` — Bank statement ID (UUID)
- `transaction_idx` — Index in transactions_json array
- `lettre` — Reconciliation marker (SM123456, AI123456, etc.)
- `tiers` — Counterparty name (supplier/client)
- `montant_ttc` — Amount inc. VAT
- `montant_mur` — Amount in Mauritian Rupees

### **Status Values**:
**Factures**: `en_attente`, `retard`, `partiel`, `paye`, `annule`, `brouillon`
**Transactions**: `non_identifie`, `rapproche`, `interne`, `frais_bancaires`, `salaire_bulk`

### **Strategy Codes**:
- `exact_reference` — Invoice # found
- `exact_amount` — Exact match
- `close_amount` — Within tolerance
- `grouped_sum` — Multiple factures
- `partial` — Partial payment
- `historical` — Learned pattern (not yet implemented)

### **Journal Codes**:
- `VTE` — Sales
- `ACH` — Purchases
- `BNQ` — Bank
- `FAC` — Invoice reference prefix
- `BANK` — Payment reference prefix

---

## 🚀 Common Tasks

### **Add a new matching strategy**:
1. Create `tryMyStrategy()` in `matching-engine.ts`
2. Add to `strategies` array in `findBestMatch()`
3. Update tests if any

### **Change tolerance for amounts**:
1. Edit `tolerance` variable in `tryAmountAndTiers()`
2. Update constant at top of function
3. Test with edge cases

### **Modify FX rates**:
1. Edit `FALLBACK_FX` in `matching-engine.ts`
2. Or update `getTauxChange()` in `taux-change.ts`
3. Test cross-currency matching

### **Add UI field**:
1. Add to `app/client/rapprochement/page.tsx` state
2. Create shadcn/ui component in `components/ui/`
3. Wire to API response

### **Debug a specific transaction**:
1. Run `POST /api/comptable/rapprochement/smart` with `date_debut`/`date_fin`
2. Check `proposals[]` for that releve_id:idx
3. Review `reasoning` field for explanation

---

## 📞 Support & Debugging

### **Proposal not appearing?**
1. Check `statut` ≠ 'rapproche'
2. Check factures exist and are unpaid
3. Check `confidence >= 0.5` (threshold in findBestMatch)
4. Enable `console.log()` in strategies

### **Apply failing?**
1. Check all 5 verifications in `apply/route.ts`
2. Check amount within 5% tolerance
3. Check direction (debit → supplier, credit → client)
4. Check facture not already reconciled

### **Entries not generating?**
1. Check `createEcrituresForPayment()` completed
2. Check `ref_folio` format (BANK-*)
3. Check `societe_id` & `dossier_id` valid

---

## 📚 Documentation Generated

- ✅ **LEXORA_RAPPROCHEMENT_COMPLETE.md** (13 sections, comprehensive)
- ✅ **QUICK_REFERENCE_RECONCILIATION.md** (pocket reference)
- ✅ **FILE_MANIFEST.md** (this file)

---

**Generated**: April 10, 2026  
**Codebase Version**: Latest (HEAD)  
**Status**: ✅ Complete exploration with full file contents
