# LEXORA Codebase Exploration Summary
**Date**: April 10, 2026  
**Purpose**: Understanding reconciliation matching engine and UI for building next features

---

## 1. OVERALL DIRECTORY STRUCTURE (TOP-LEVEL)

```
/home/work/.openclaw/workspace/lexora/
├── app/                          # Next.js app directory
│   ├── api/                     # API routes
│   ├── client/                  # Client routes (/app/client/...)
│   ├── comptable/               # Accountant routes (/app/comptable/...)
│   ├── admin/, auth/, login/, etc.
│   └── layout.tsx, page.tsx
├── components/                   # React components
│   ├── ui/                      # shadcn/ui components
│   ├── client/, dashboard/, pdf/, tva/, etc.
│   └── CerveauTIBOK.tsx, etc.
├── lib/                         # Utilities & business logic
│   ├── accounting/              # Accounting-specific: matching-engine.ts, ecritures-factures.ts
│   ├── supabase/                # Supabase client helpers
│   ├── rh/, juridique/, ai/     # Domain modules
│   ├── taux-change.ts           # FX rate management
│   ├── bankFormats.ts, i18n.ts, etc.
│   └── types.ts, utils.ts
├── hooks/                        # React hooks
├── public/                       # Static assets
├── supabase/                     # Database
│   └── migrations/              # SQL migrations (23 files, 001_*.sql to 022_*)
├── styles/                       # CSS
├── middleware.ts                 # Next.js auth middleware
├── tsconfig.json, next.config.mjs, package.json
└── [docs] LEXORA_MASTER_PLAN.md, CODEBASE_ANALYSIS.md, etc.
```

---

## 2. KEY FILES: MATCHING ENGINE

### **lib/accounting/matching-engine.ts** (354 lines)
**Purpose**: Professional multi-strategy bank reconciliation matching engine

**Core Types**:
- `MatchingFacture` - Invoice with ID, number, tiers, amounts (ttc/mur), date, payment terms, type (client/fournisseur)
- `MatchingTransaction` - Bank transaction with releve_id, idx, date, libelle, tiers_detecte, debit/credit, devise
- `MatchProposal` - Result: transaction + matched factures + strategy + confidence + reasoning
- `MatchStrategy` - Union: 'exact_reference' | 'exact_amount' | 'close_amount' | 'grouped_sum' | 'partial' | 'historical'

**Key Functions**:
1. **`normalize(s: string): string`** 
   - Lowercase, NFD normalize, remove accents, remove legal entity suffixes (Ltd, SARL, SA, etc.), strip punctuation
   - Example: "ACME Ltd S.A.R.L." → "acme"

2. **`tiersScore(a: string, b: string): number`** 
   - Exact match → 1.0
   - Substring → 0.9
   - Jaccard similarity on >2 char words → 0 to 1
   - Returns similarity 0-1

3. **`toMUR(amount, devise, rates): number`** 
   - Converts foreign currency to MUR using FX rates
   - Fallback rates if not provided: EUR=46.50, GBP=54.20, USD=44.80, MUR=1

4. **`findBestMatch(tx, candidateFactures, rates): MatchProposal | null`** 
   - Tries strategies in order (cascade):
     1. Exact reference (100%) — invoice number in bank libelle
     2. Exact amount + tiers (95%)
     3. Close amount + tiers (85%) — 2% tolerance
     4. Grouped sum (85%) — N invoices sum = payment
     5. Partial payment (70%) — payment < invoice
   - Returns first match with confidence ≥ 0.5 (or best if all fail)

5. **`analyzeAllTransactions(transactions, factures, rates): MatchProposal[]`** 
   - Processes all unmatched transactions
   - Sorts by presence of invoice references (high confidence first)
   - Avoids double-matching factures
   - Returns array of proposals

**Strategy Details**:

**Strategy 1: Exact Reference**
- Cleans invoice number and libelle (uppercase, remove non-alphanumeric)
- If invoice number found in libelle → confidence 1.0 (or 0.9 if amount diff >5%)
- Checks invoice is close in date (within payment terms + 10 days)

**Strategy 2 & 3: Amount + Tiers**
- Amount tolerance: 1% if same currency, 5% if cross-currency
- Tiers similarity threshold: 0.40 for normal names, 0.25 for short names (e.g., "MCB")
- Confidence formula:
  - Exact amount + strong tiers (≥0.75) → 0.95
  - Exact amount only → 0.85
  - Strong tiers only → 0.80
  - Weak match → 0.60 + (score * 0.15)
  - +0.05 if within payment terms
  - -0.10 if >90 days late

**Strategy 4: Grouped Sum**
- Groups factures by normalized tiers
- Tries subsets (2-5 factures) whose sum matches transaction amount
- Tiers must match bank libelle with ≥0.50 similarity
- 5% tolerance on grouped sum (cross-currency)
- Confidence: 0.85 - (diff * 2) + (0.05 if within terms)

**Strategy 5: Partial Payment (Acompte)**
- Payment < invoice amount by 10-90% → flags as partial
- Requires strong tiers match (≥0.7)
- Confidence: 0.55 + (score * 0.15) + (0.05 if >50%)

---

## 3. API ROUTES: RAPPROCHEMENT

### **app/api/comptable/rapprochement/smart/route.ts** (211 lines)
**Endpoint**: `POST /api/comptable/rapprochement/smart`

**Purpose**: Fast heuristic reconciliation (NO LLM call, pure matching engine)

**Flow**:
1. Fetch unmatched bank transactions (limit 250)
2. Fetch unpaid factures (statut ∈ {en_attente, retard, partiel})
3. Fallback: if no factures, fetch écritures_comptables_v2 with 401/411 non-lettrées (GL fallback)
4. Load FX rates via `getTauxChange()`
5. Run `analyzeAllTransactions()` from matching-engine
6. Format & return proposals with stats

**Response**:
```json
{
  "proposals": [
    {
      "releve_id": "...",
      "transaction_idx": 0,
      "transaction": { "date", "libelle", "tiers", "debit", "credit" },
      "facture_ids": ["..."],
      "factures": [{ "id", "numero_facture", "tiers", "montant_mur", "devise", "date_facture" }],
      "match_type": "facture_unique" | "facture_groupee" | "partiel",
      "strategy": "exact_reference" | "exact_amount" | ...,
      "confidence": 0.85,
      "reasoning": "...",
      "amount_diff": 1500,
      "delay_days": 15,
      "within_terms": true,
      "needs_arbitration": false  // if confidence < 0.85
    }
  ],
  "stats": {
    "total": 50,
    "proposed": 48,
    "auto_apply": 35,
    "needs_arbitration": 13,
    "orphans": 2,
    "by_strategy": { "exact_reference": 5, "exact_amount": 15, ... }
  },
  "duration_ms": 1250
}
```

### **app/api/comptable/rapprochement/smart/apply/route.ts** (260 lines)
**Endpoint**: `POST /api/comptable/rapprochement/smart/apply`

**Purpose**: Batch apply smart-engine proposals (filtered by min_confidence)

**Body**:
```json
{
  "societe_id": "...",
  "proposals": [{ "releve_id", "transaction_idx", "facture_ids", "confidence", "reasoning" }],
  "min_confidence": 0.85  // default
}
```

**Verifications**:
1. Transaction not already reconciled
2. Check for in-batch duplicate facture usage
3. All factures exist & not already reconciled
4. Amount within 5% tolerance
5. Direction match (debit→fournisseur, credit→client)

**Actions**:
- Mark transaction as `statut='rapproche'`, add `lettre=SM{timestamp}`
- Mark factures as `statut='paye'`, add `rapproche_releve_id`, `rapproche_date`, `rapproche_source='smart'`
- Generate BNQ journal entries via `createEcrituresForPayment()`
- Track used factures to avoid double-applying in batch

**Response**:
```json
{
  "applied": 35,
  "skipped": 13,
  "errors": [{ "releve_id", "transaction_idx", "error" }],
  "stats": { "total_proposals", "above_threshold", "applied", "skipped_low_confidence", "consistency" }
}
```

### **app/api/comptable/rapprochement/agent/route.ts** (559 lines)
**Endpoint**: `POST /api/comptable/rapprochement/agent`

**Purpose**: AI agent (Claude Sonnet 4.6) with agentic loop for reconciliation

**Tools Available**:
- `list_unmatched_transactions` - Get 50 most recent unmatched txs
- `list_unpaid_invoices` - Get unpaid factures (up to 40)
- `propose_match` - Propose a match with confidence & reasoning
- `apply_match` - Apply a confirmed match (with same 5 verifications as smart/apply)
- `get_reconciliation_stats` - Overall stats (total, matched, unpaid)
- `run_consistency_check` - Check for orphaned factures
- `generate_journal_entries` - Backfill missing BNQ entries

**System Prompt**: Emphasizes:
- DEBIT = supplier (fournisseur), CREDIT = client
- 5% amount tolerance or 100 MUR
- Grouped payments allowed
- Verify 4 criteria before apply_match (sum, type, not-already-paid, tiers match)
- apply_match does server-side validation — don't bypass
- apply with confidence ≥0.90, propose with 0.65-0.90, skip <0.65

**Agentic Loop**:
- Max 4 iterations (stay under 55s serverless timeout)
- Each iteration: Claude calls tools → results fed back → new response

**Direct Action Mode**:
- Can call `apply_match` tool directly without Claude (from UI)
- Body: `{ direct_action: { tool: "apply_match", input: {...} } }`

### **app/api/comptable/rapprochement/reset/route.ts** (150 lines)
**Endpoint**: `POST /api/comptable/rapprochement/reset`

**Purpose**: Complete reset of reconciliation for a société

**Actions**:
1. Delete FAC-* entries (invoice journal entries)
2. Delete BANK-* and PAY-* entries (payment entries)
3. Delete legacy BNQ entries (journal='BNQ', ref_folio=null)
4. Reset all factures to statut='en_attente', clear rapproche_*
5. Clear lettrage on all bank transactions (but preserve 'interne' transfers)

**Response**:
```json
{
  "ok": true,
  "stats": {
    "ecritures_factures_supprimees": 150,
    "ecritures_paiements_supprimees": 120,
    "ecritures_legacy_supprimees": 5,
    "factures_reset": 250,
    "transactions_reset": 180
  }
}
```

---

## 4. ACCOUNTING UTILITIES

### **lib/accounting/ecritures-factures.ts** (303 lines)

**Function 1: `createEcrituresForFacture(supabase, facture)`**
- Generates journal entries for an invoice
- CLIENT (type_facture='client'):
  - Debit 411 Clients = montant_ttc
  - Credit 706 Prestations = montant_ht
  - Credit 4457 TVA collectee = montant_tva
- FOURNISSEUR:
  - Debit 607 Achats = montant_ht
  - Debit 4456 TVA deductible = montant_tva
  - Credit 401 Fournisseurs = montant_ttc
- ref_folio = `FAC-{facture_id}` (for later matching)
- Idempotent: deletes existing entries first

**Function 2: `createEcrituresForPayment(supabase, payment)`**
- Generates payment offsetting entries when transaction matches invoice
- SUPPLIER payment (debit bancaire):
  - Debit 401 Fournisseurs = amount
  - Credit 512 Banque = amount
- CLIENT payment (credit bancaire):
  - Debit 512 Banque = amount
  - Credit 411 Clients = amount
- journal='BNQ', ref_folio=`BANK-{releve_id}-{idx}`
- Idempotent: deletes existing payment entries first

### **lib/taux-change.ts** (136 lines)

**Functions**:
- `getTauxChangeFromDB()` - Fetch latest rates from taux_change table
- `fetchAndStoreRates()` - Call ExchangeRate-API, store in DB
- `getTauxChange()` - Main: DB first, fallback to hardcoded
- `convertToMUR(amount, devise, rates)` - Convert using provided rates

**Fallback Rates** (Bank of Mauritius):
- EUR: 46.50
- GBP: 54.20
- USD: 44.80
- MUR: 1

---

## 5. UI: RAPPROCHEMENT PAGE

### **app/client/rapprochement/page.tsx** (1203 lines)

**Key State**:
- `smartProposals`: Results from smart matching engine
- `smartResult`: Stats (auto_apply, needs_arbitration, orphans)
- `aiProposals`: Proposals indexed by `releve_id:idx`
- `linkDialog`: Dialog state for manual linking

**Key Functions**:
- `handleSmartRapprochement()` - Call `/api/comptable/rapprochement/smart`
- `handleSmartApplyAll()` - Call `/api/comptable/rapprochement/smart/apply` with min_confidence=0.85
- `runAiAnalysis()` - Call smart endpoint (heuristic only, fast)
- `applyAiProposal(key)` - Apply single proposal via `direct_action` mode
- `applyAllHighConfidence()` - Batch apply high-confidence proposals
- `rejectAiProposal(key)` - Mark proposal as rejected
- `handleResetAll()` - Call `/api/comptable/rapprochement/reset` with double confirmation

**UI Features**:
- **Smart Dialog Summary** - Shows stats: auto (green), arbitration (orange), orphans (gray)
- **Smart Dialog List** - Shows all proposals with confidence badges, strategies, reasoning
- **Link Dialog** - Manual matching UI: select factures or écritures, handle "paye par associé"
- **Tooltip on truncated cells** - Shows full text on hover
- **Month/Periode selector** - Filter by fiscal year (2025-2026, 2024-2025, or tout)

**UI Components Used**:
- shadcn/ui: Card, Button, Badge, Table, Dialog, Select, Input, Label, Textarea, MonthPicker, Tooltip

---

## 6. DATABASE

### **supabase/migrations/** (23 files)

**Key Tables** (relevant to reconciliation):
- `releves_bancaires` - Bank statements, JSON: `transactions_json` (array of transactions)
  - Each transaction: id, date, libelle, tiers_detecte, debit, credit, devise, statut, lettre, facture_id(s), matched_type, rapproche_at
- `factures` - Invoices
  - Columns: id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, date_facture, date_echeance, conditions_paiement, statut
  - Rapprochement columns: rapproche_releve_id, rapproche_transaction_idx, rapproche_date, rapproche_source
- `ecritures_comptables_v2` - General ledger entries
  - Columns: id, journal, ref_folio, numero_compte, debit_mur, credit_mur, lettre, date_ecriture, description
- `taux_change` - Exchange rates
  - Columns: devise, taux, date_taux, source
- `dossiers` - Accounting folders (FK from ecritures)

**Statuts for Factures**:
- `en_attente` - Pending
- `retard` - Late
- `partiel` - Partially paid
- `paye` - Paid
- `annule` - Cancelled
- `brouillon` - Draft

**Statuts for Transactions**:
- `non_identifie` - Not identified
- `rapproche` - Reconciled
- `interne` - Internal transfer
- `frais_bancaires` - Bank fees
- `salaire_bulk` - Bulk payroll

---

## 7. SHADCN/UI COMPONENTS AVAILABLE

Located in `components/ui/`:
- accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, button-group
- calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog
- drawer, dropdown-menu, empty, field, form, hover-card, input, input-group, input-otp
- label, loading-spinner, menu-bar, month-picker, pagination, popover, progress, radio-group
- resizable, scroll-area, search-input, select, separator, sheet, skeleton, slider
- sonner (toast), sonner-base, spacer, switch, table, tabs, textarea, toggle, toggle-group
- tooltip, use-toast
- **Custom**: MonthPicker.tsx

---

## 8. UTILITY FUNCTIONS & PATTERNS

**Formatting**:
```typescript
fmt(n) → n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
formatDate(d) → d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
```

**Reconciliation Key Generation**:
```typescript
proposalKey(releve_id, idx) → `${releve_id}:${idx}`
```

**Lettre Generation**:
- Smart: `SM{Date.now().toString().slice(-6)}` (e.g., SM123456)
- Agent: `AI{Date.now().toString().slice(-6)}` (e.g., AI123456)

---

## 9. KEY PATTERNS & CONVENTIONS

### **Debit/Credit Direction**:
- **DEBIT** (transaction.debit > 0) → Money going OUT → Supplier payment (fournisseur)
- **CREDIT** (transaction.credit > 0) → Money coming IN → Client payment (client)

### **Amount Tolerance**:
- Same currency: 1%
- Cross-currency: 5% or 100 MUR
- Applied after FX conversion to MUR

### **Tiers Normalization**:
1. Lowercase
2. NFD normalize (decompose accents)
3. Remove accents ([\u0300-\u036f])
4. Remove legal suffixes: Ltd, Limited, SARL, SAS, SA, EURL, Co, Inc, LLC, PLC, Pvt
5. Remove punctuation: .,;:!?()\/\-
6. Collapse whitespace
7. Trim

### **Confidence Thresholds**:
- ≥0.95: Auto-apply without question
- 0.85-0.95: High confidence, auto-apply with stats reporting
- 0.65-0.85: Needs human review/arbitration
- <0.65: Ignored/skipped

### **Journal Codes**:
- **VTE**: Sales (Ventes)
- **ACH**: Purchases (Achats)
- **BNQ**: Bank (Banque)

### **Chart of Accounts (Mauritius)**:
- 401: Fournisseurs (Suppliers)
- 411: Clients (Clients)
- 4456: TVA Deductible (Purchase VAT)
- 4457: TVA Collectee (Sales VAT)
- 512: Banque (Bank)
- 607: Achats (Purchases)
- 706: Prestations (Services/Sales)

---

## 10. DATA FLOW: COMPLETE RECONCILIATION WORKFLOW

```
1. Bank statement import → releves_bancaires.transactions_json
2. User clicks "Smart Rapprochement"
   ↓
3. POST /api/comptable/rapprochement/smart
   - Fetch unmatched transactions
   - Fetch unpaid factures
   - Run matching-engine.analyzeAllTransactions()
   ↓
4. UI shows proposals with confidence & strategy
   ↓
5. User clicks "Appliquer tout (≥85%)"
   ↓
6. POST /api/comptable/rapprochement/smart/apply
   - Filter by min_confidence
   - Verify each proposal
   - Update releves_bancaires.transactions_json (lettre, facture_ids, statut)
   - Update factures (statut='paye', rapproche_releve_id, rapproche_date)
   - Generate payment entries via createEcrituresForPayment()
   ↓
7. GL is automatically updated (ecritures_comptables_v2)
   ↓
8. Consistency check (detect orphaned factures)
```

---

## 11. ERROR HANDLING & EDGE CASES

**In Matching Engine**:
- If no rates provided, use FALLBACK_FX
- If tiers is null/empty, assign tiersScore = 0
- If dates are invalid, daysBetween returns 0
- If amount is 0, skip that strategy

**In Smart Apply**:
- Transaction already reconciled → skip
- Facture not found → error
- Facture already paid → error
- Amount difference >5% → error
- Direction mismatch (supplier facture with credit tx) → error

**In UI**:
- If societe_id not set, disable buttons
- If societe_id changes, reload data
- If proposal count is 0, show empty message
- Tooltips for truncated cells (max-w-[300px])

---

## 12. PERFORMANCE CONSIDERATIONS

**Smart Engine**:
- Fast: pure heuristic, <5s for 200 transactions
- Caps unmatched transactions at 250 (limit processing)
- Grouped sum: limited to 2-5 factures per subset (avoid combinatorial explosion)

**Smart Apply**:
- Pre-loads all releves for société (avoid N+1)
- Tracks used factures in-batch (avoid double-applying)
- Batch saves releves at end

**Serverless Timeout**:
- `/smart`: maxDuration = 45s
- `/smart/apply`: maxDuration = 60s
- `/agent`: maxDuration = 90s, soft timeout 55s
- Agent loop: max 4 iterations (avoid exceeding timeout)

---

## 13. NEXT STEPS FOR BUILDING NEW FEATURES

**Current Capabilities**:
✅ Multi-strategy matching with confidence scoring
✅ Cross-currency FX conversion
✅ Grouped payment detection
✅ Partial payment detection
✅ AI agent with tool use
✅ Batch reconciliation
✅ Journal entry auto-generation
✅ Consistency checking

**Possible Enhancements**:
- 🔲 Fuzzy matching on bank libelle (Levenshtein distance)
- 🔲 Historical pattern learning ("same tiers was matched this way before")
- 🔲 Blacklist/whitelist management
- 🔲 Recurring transaction detection
- 🔲 Bank fee auto-matching
- 🔲 Multi-currency payment splitting
- 🔲 Scheduled reconciliation automation
- 🔲 Reconciliation audit trail / undo

---

**CRITICAL NOTES FOR DEVELOPERS**:
1. **Always verify direction**: debit → supplier, credit → client
2. **Never bypass server-side validation** in apply_match (apply/route.ts has 5 verifications)
3. **Always normalize tiers** before similarity comparison
4. **Use FX rates from getTauxChange()**, not hardcoded
5. **Clear lettre/facture_ids** when unreconciling
6. **Generate payment entries** after apply_match (auto in apply/route.ts, but check in agent/route.ts)
7. **Orphaned factures detection** should run at end of batch operations
