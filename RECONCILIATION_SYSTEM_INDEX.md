# Lexora Reconciliation System - Complete Index

**Last Updated**: April 10, 2026  
**Project**: Lexora Accounting Platform  
**Module**: Bank Reconciliation (Rapprochement)

---

## 📑 Document Index

This codebase exploration contains comprehensive documentation of the Lexora reconciliation system:

### Main Documentation Files (Created)
1. **CODEBASE_EXPLORATION_COMPLETE.md** - Full technical specification
   - All API endpoints with request/response formats
   - Database schema definitions
   - Matching engine algorithms
   - Key workflows

2. **FULL_FILE_CONTENTS.md** - Source code files
   - Complete smart/route.ts
   - Complete smart/apply/route.ts
   - Summary of matching-engine.ts
   - Complete taux-change.ts

3. **RECONCILIATION_SYSTEM_INDEX.md** - This file
   - Navigation guide
   - Quick reference
   - File locations

---

## 🗂️ Source Files Summary

### API Endpoints

#### 1. Smart Reconciliation Engine
**Location**: `app/api/comptable/rapprochement/smart/route.ts`
- **Purpose**: Fast, heuristic-based matching (no LLM)
- **Method**: POST
- **Duration**: 45 seconds max
- **Performance**: <5s for 200 transactions
- **Key Function**: Calls `analyzeAllTransactions()` from matching-engine

**Matching Strategies** (cascade order):
1. Exact Reference (100% confidence)
2. Exact Amount (95% confidence)
3. Close Amount (85% confidence)
4. Grouped Sum (87-96% confidence, TDS-aware)
5. Partial Payment (70% confidence)
6. Historical Patterns (80-99% confidence)

---

#### 2. Apply Smart Proposals
**Location**: `app/api/comptable/rapprochement/smart/apply/route.ts`
- **Purpose**: Batch-apply proposals with validation
- **Method**: POST
- **Duration**: 60 seconds max
- **Min Confidence Filter**: 0.85 (default)

**5-Step Verification**:
1. Transaction exists & not already reconciled
2. No in-batch duplicate factures
3. All factures exist & unreconciled
4. Amount tolerance ≤5%
5. Direction correct (debit→supplier, credit→client)

---

#### 3. Main Reconciliation Handler
**Location**: `app/api/comptable/rapprochement/route.ts`
- **Purpose**: Comprehensive reconciliation with multiple actions
- **Method**: GET (retrieve) / POST (execute actions)

**GET Returns**:
- Rapprochements
- Bank transactions (flattened)
- Unpaid factures
- Accounting entries (v1)
- Bank accounts

**POST Actions**:
- `auto_rapprocher` - Full reconciliation with pre-classification rules
- `lettrer_manuel` - Manual single transaction link
- `delettrer` - Remove lettering
- `creer` - Create rapprochement
- `valider` - Validate rapprochement
- `lettrer_multi` - Multi-facture lettering
- `generate_ecritures` - Generate BNQ entries
- `auto_lettrage_bnq` - Auto-letter ACH entries
- `lettrer_ecritures` - Letter accounting entries
- `paye_par_associe` - Mark paid by associate
- `compensation` - Reimbursement entry
- `paiement_employe` - Employee salary payment

---

### Frontend

#### Client Page
**Location**: `app/client/rapprochement/page.tsx`
- **Size**: ~1,388 lines
- **Key Components**:
  - Smart reconciliation interface
  - Manual linking dialogs
  - Transaction list with filters
  - Chat IA integration
  - Accounting entry lettering

**State Management**:
```typescript
- data: Main reconciliation data
- loading, autoMatching: Progress
- smartProposals: List of proposals
- aiProposals: Inline analysis results
- chatMessages: Conversation history
- rejectedProposals: Manual rejections
```

**Key Handlers**:
- `handleSmartRapprochement()` - Trigger smart engine
- `handleSmartApplyAll()` - Apply proposals in batch
- `handleAutoMatch()` - Run auto-rapprocher
- `handleManualLink()` - Single transaction linking
- `runAiAnalysis()` - Analyze unmatched transactions
- `sendChatMessage()` - Chat with agent

---

### Libraries

#### Matching Engine
**Location**: `lib/accounting/matching-engine.ts`
- **Size**: 454 lines
- **Purpose**: Core matching algorithm

**Type Definitions**:
```typescript
interface MatchingTransaction {
  releve_id: string
  transaction_idx: number
  date: string
  libelle: string
  tiers_detecte: string | null
  debit: number
  credit: number
  devise: string
}

interface MatchingFacture {
  id: string
  numero_facture: string | null
  tiers: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  date_facture: string | null
  date_echeance: string | null
  conditions_paiement: number | null
  type_facture: 'client' | 'fournisseur' | null
  statut: string | null
}

interface MatchProposal {
  transaction: MatchingTransaction
  facture_ids: string[]
  factures: MatchingFacture[]
  strategy: MatchStrategy
  confidence: number
  reasoning: string
  amount_diff: number
  delay_days: number
  within_terms: boolean
}

type MatchStrategy = 
  | 'exact_reference'
  | 'exact_amount'
  | 'close_amount'
  | 'grouped_sum'
  | 'partial'
  | 'historical'
```

**Key Exports**:
- `normalize(s: string): string` - Party name normalization
- `tiersScore(a: string, b: string): number` - Jaccard similarity
- `toMUR(amount, devise, rates?): number` - FX conversion
- `findBestMatch(tx, factures, rates?, patterns?): MatchProposal | null`
- `analyzeAllTransactions(transactions, factures, rates?, patterns?): MatchProposal[]`

---

#### Exchange Rate Management
**Location**: `lib/taux-change.ts`
- **Size**: 136 lines
- **Purpose**: FX rate handling & caching

**Fallback Rates** (Bank of Mauritius):
- EUR: 46.50 MUR
- GBP: 54.20 MUR
- USD: 44.80 MUR
- MUR: 1

**Key Functions**:
- `getTauxChangeFromDB()` - Query latest rates
- `fetchAndStoreRates()` - Fetch from ExchangeRate-API
- `getTauxChange()` - Main entry (DB→fallback)
- `convertToMUR(amount, devise, rates): number`

**API**: `https://v6.exchangerate-api.com/v6/{KEY}/latest/MUR`

---

## 🗄️ Database Schema

### releves_bancaires Table

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `compte_bancaire_id` | UUID | Link to bank account |
| `societe_id` | UUID | Link to company |
| `periode` | TEXT | e.g., "2025-06" |
| `date_debut` | DATE | Statement start |
| `date_fin` | DATE | Statement end |
| `solde_ouverture` | NUMERIC(15,2) | Opening balance |
| `solde_cloture` | NUMERIC(15,2) | Closing balance |
| `total_debits` | NUMERIC(15,2) | Sum debits |
| `total_credits` | NUMERIC(15,2) | Sum credits |
| **`transactions_json`** | JSONB | **Array of transactions** |
| `anomalies_json` | JSONB | Detected issues |
| `statut_rapprochement` | TEXT | Status |

### Transaction Object (transactions_json[])

```json
{
  "date": "2025-06-15",
  "libelle": "TRANSFER - ACME CORP",
  "debit": "5000.00",
  "credit": "0.00",
  "tiers_detecte": "ACME CORP",
  "tiers": "ACME Corporation",
  "devise": "MUR",
  "compte_comptable": null,
  "statut": "rapproche|interne|propose|non_identifie|a_verifier",
  "matched_type": "facture_unique|facture_groupee|transfert_interne|frais_bancaires|salaire_bulk|paiement_mra|partiel",
  "lettre": "R001|SM123456",
  "facture_id": "uuid-primary",
  "facture_ids": ["uuid1", "uuid2"],
  "ecriture_id": "uuid-of-ecriture",
  "match_confidence": "smart_95|engine_85",
  "note": "Reference INV-001 found in libelle",
  "rapproche_at": "2025-06-20T10:30:00Z",
  "rapprochement_multi": false,
  "nb_factures": 1,
  "ecart_montant": 0.00
}
```

### factures Table (Key Columns)

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `numero_facture` | TEXT | Invoice number |
| `tiers` | TEXT | Party name |
| `montant_ttc` | NUMERIC(15,2) | Amount with tax |
| `montant_mur` | NUMERIC(15,2) | Amount in MUR |
| `devise` | TEXT | Currency |
| `date_facture` | DATE | Invoice date |
| `date_echeance` | DATE | Due date |
| `conditions_paiement` | INTEGER | Terms (days) |
| `type_facture` | TEXT | 'client' OR 'fournisseur' |
| `statut` | TEXT | 'en_attente'\|'retard'\|'partiel'\|'paye' |
| **`rapproche_releve_id`** | UUID | **Bank statement link** |
| **`rapproche_transaction_idx`** | INTEGER | **Position in transactions_json** |
| **`rapproche_date`** | TIMESTAMPTZ | **When reconciled** |
| **`rapproche_source`** | TEXT | **How: auto\|ai\|manual\|smart** |

### rapprochement_patterns Table

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `societe_id` | UUID | Company link |
| `tiers_banque` | TEXT | Bank-detected party |
| `libelle_pattern` | TEXT | Optional pattern |
| `montant_min` | NUMERIC(15,2) | Min amount |
| `montant_max` | NUMERIC(15,2) | Max amount |
| `type_cible` | TEXT | Target type |
| `cible_tiers` | TEXT | Target party |
| `cible_compte` | TEXT | Target account |
| `confidence_cumul` | NUMERIC | 0-1 cumulative |
| `nb_utilisations` | INTEGER | Usage count |

---

## 🔄 Key Workflows

### Workflow 1: Smart Reconciliation (User-Initiated)

```
┌─ User clicks "Smart Rapprochement"
│
├─ POST /api/comptable/rapprochement/smart
│  ├─ Load unmatched transactions from releves_bancaires
│  ├─ Load unpaid factures (or fallback to 401/411 écritures)
│  ├─ Load FX rates via getTauxChange()
│  ├─ Load historical patterns
│  │
│  └─ Run analyzeAllTransactions()
│     ├─ Sort by reference presence (prioritize known refs)
│     ├─ For each transaction:
│     │  ├─ Try Strategy 1: Exact Reference
│     │  ├─ Try Strategy 2: Exact Amount
│     │  ├─ Try Strategy 3: Close Amount
│     │  ├─ Try Strategy 4: Grouped Sum
│     │  ├─ Try Strategy 5: Partial
│     │  └─ Try Strategy 6: Historical
│     │
│     └─ Return proposals ≥0.5 confidence
│
├─ Display proposals sorted by confidence
├─ User reviews (optional manual review)
│
├─ User clicks "Apply All"
│
├─ POST /api/comptable/rapprochement/smart/apply
│  ├─ Filter by min_confidence (0.85)
│  ├─ For each proposal:
│  │  ├─ Verify 1: Tx exists & not reconciled
│  │  ├─ Verify 2: No batch duplicates
│  │  ├─ Verify 3: Factures exist & unreconciled
│  │  ├─ Verify 4: Amount ≤5% diff
│  │  ├─ Verify 5: Direction correct
│  │  │
│  │  ├─ Update transaction in transactions_json
│  │  ├─ Update facture statut → "paye"
│  │  └─ Generate BNQ journal entries
│  │
│  └─ Consistency check: detect orphans
│
└─ Show summary: "150 applied, 30 skipped, 2 errors"
```

### Workflow 2: Auto-Rapprochement (Legacy Full)

```
┌─ User clicks "Rapprocher"
│
├─ POST /api/comptable/rapprochement (action: auto_rapprocher)
│  │
│  ├─ Load all releves + factures + écritures
│  ├─ Load FX rates
│  │
│  ├─ For each releve:
│  │  ├─ For each transaction:
│  │  │  │
│  │  │  ├─ RULE A: Internal transfer?
│  │  │  │  └─ Mark statut="interne", matched_type="transfert_interne"
│  │  │  │
│  │  │  ├─ RULE B: Bank fees?
│  │  │  │  ├─ Match to 627 account
│  │  │  │  └─ Mark statut="rapproche", matched_type="frais_bancaires"
│  │  │  │
│  │  │  ├─ RULE C: Bulk salary?
│  │  │  │  ├─ Verify against bulletins_paie
│  │  │  │  └─ Mark matched or non_verifie
│  │  │  │
│  │  │  ├─ RULE D: MRA payment?
│  │  │  │  ├─ Match to tax accounts (444, 431, 432, 4457)
│  │  │  │  └─ Mark statut="rapproche", matched_type="paiement_mra"
│  │  │  │
│  │  │  ├─ RULE E: Salary reversal?
│  │  │  │  └─ Mark matched
│  │  │  │
│  │  │  └─ STANDARD MATCHING: analyzeAllTransactions()
│  │  │     ├─ Confidence ≥0.85 → auto-apply (statut="rapproche")
│  │  │     ├─ 0.65-0.85 → propose (statut="propose")
│  │  │     └─ <0.65 → orphan
│  │  │
│  │  └─ Save updated transactions_json
│  │
│  └─ Return counts: matched, interne, frais, salaire, mra, propose, not_matched
│
└─ Show dashboard with classification breakdown
```

### Workflow 3: Manual Linking (User Action)

```
┌─ User selects unmatched transaction
├─ User selects facture from modal
│
├─ POST /api/comptable/rapprochement (action: lettrer_manuel)
│  ├─ Generate lettre code
│  ├─ Update transaction.lettre & statut
│  ├─ Update facture.statut → "paye"
│  └─ Link via rapproche_releve_id & rapproche_transaction_idx
│
└─ Reload data
```

---

## 🎯 Matching Algorithm Details

### Strategy 1: EXACT_REFERENCE
- **Confidence**: 100% if amount matches, 90% if within 5% diff
- **Logic**: Clean invoice number, search in bank libellé
- **Requirements**: Reference ≥3 alphanumeric chars

### Strategy 2: EXACT_AMOUNT
- **Confidence**: 95% (exact amount + strong tiers) to 60% (medium)
- **Amount Tolerance**: 
  - Cross-currency: 5%
  - Same currency: 1%
- **Party Match Threshold**: 0.40 (0.25 for short names ≤5 chars)
- **Bonuses**: +0.05 within terms, -0.10 if >90 days late

### Strategy 3: CLOSE_AMOUNT
- **Confidence**: 85% base, adjusted by factors
- **Amount**: Within 2% of invoice
- **Factors**: Party similarity, date proximity, terms compliance

### Strategy 4: GROUPED_SUM
- **Confidence**: 87% base, up to 96% with TDS boost
- **Logic**: Sum of N invoices = payment
- **Constraints**: 2-5 invoices per group, same normalized tiers
- **Tolerance**: 8% (covers 5% TDS + 3% bank fees)
- **TDS Boost**: +0.08 if diff 2-6% (typical withholding)
- **Formula**: `0.87 - (diff * 1.5) + bonuses`

### Strategy 5: PARTIAL
- **Confidence**: 70% base + modifiers
- **Logic**: Payment = 10-90% of invoice amount
- **Requirements**: Strong party match (≥0.7)
- **Formula**: `0.55 + (score * 0.15) + (ratio > 0.5 ? 0.05 : 0)`

### Strategy 6: HISTORICAL
- **Confidence**: 80-99%
- **Logic**: Learned patterns from previous matches
- **Validation**: Party score ≥0.7, libelle pattern, amount range
- **Formula**: `min(0.99, confidence_cumul + 0.01 * min(nb_uses, 10))`

### Party Name Matching (normalize function)
```typescript
1. Lowercase
2. Remove accents (NFD normalization)
3. Remove legal suffixes (Ltd, SARL, SAS, SA, etc.)
4. Remove punctuation
5. Collapse whitespace

Result: "ACME Corporation S.A.R.L." → "acme corporation"
```

### Jaccard Similarity (tiersScore)
```
Score = common_words / total_words
- Exact match = 1.0
- Substring containment = 0.9
- Words >2 chars = weighted
```

---

## 🔐 Validation & Safety

### Pre-Apply Checks (5-Step)
1. **Transaction Valid**: Exists in releve, not already reconciled
2. **No Batch Duplicates**: Same facture not used twice in batch
3. **Factures Exist**: All factures found, unreconciled
4. **Amount Tolerance**: tx_amount vs sum_factures ≤5% diff
5. **Direction Correct**: Debit→supplier, credit→client

### Consistency Checks
- **Orphan Detection**: Factures marked "paye" but not linked
- **Missing References**: Transactions without proposal
- **Double-Booking**: Facture linked to multiple transactions

---

## 📊 Response Statistics

### Smart Endpoint Returns
```json
{
  "stats": {
    "total": 250,
    "proposed": 180,
    "auto_apply": 150,
    "needs_arbitration": 30,
    "orphans": 70,
    "by_strategy": {
      "exact_reference": 20,
      "exact_amount": 85,
      "close_amount": 45,
      "grouped_sum": 25,
      "partial": 5,
      "historical": 0
    }
  },
  "duration_ms": 3500
}
```

---

## 🚀 Performance Notes

- **Max 250 transactions** per smart request (cap to prevent timeout)
- **Typical speed**: <5 seconds for 200 transactions
- **Max duration**: 45 seconds (smart), 60 seconds (apply)
- **DB queries**: Minimized via caching and batch loads
- **Combinatorial limit**: Max 5 invoices per grouped sum (2^6-1 subsets = 63 max)

---

## ✅ Key Features

### ✨ Multi-Currency Support
- FX rates from ExchangeRate-API (or fallback)
- All amounts converted to MUR for comparison
- Tolerance adjusted for cross-currency (5% vs 1%)

### 🎓 Machine Learning (Historical Patterns)
- Learns from successful matches
- Tracks confidence per pattern
- Uses learned tiers → target mapping

### 🧮 Smart Math
- TDS (Tax Deducted at Source) detection
- Bank fee tolerance (+3%)
- Terms-based confidence adjustment

### 🔄 Batch Processing
- N+1 query prevention via pre-loads
- Atomic updates (all-or-nothing per transaction)
- Consistency checks post-apply

### 📋 Comprehensive Logging
- Step-by-step reasoning
- Amount differences tracked
- Delay calculation (invoice date → payment date)

---

## 📞 Support & Maintenance

### Key Contacts/Files
- Matching logic: `lib/accounting/matching-engine.ts`
- FX rates: `lib/taux-change.ts`
- Smart endpoint: `app/api/comptable/rapprochement/smart/route.ts`
- Apply endpoint: `app/api/comptable/rapprochement/smart/apply/route.ts`

### Common Issues
1. **Low confidence matches**: Check party name normalization
2. **TDS not detected**: Verify 2-6% range in grouped_sum
3. **FX rates stale**: Check exchangerate-api endpoint
4. **Timeout errors**: Reduce transaction count, increase max duration

---

## 📝 Version History

- **Current**: April 10, 2026
- Multi-strategy matching engine fully documented
- Smart endpoint: 45s max, <5s typical
- Apply endpoint: 60s max, with 5-step validation

