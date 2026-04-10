# LEXORA Reconciliation — Quick Reference Card

## 🎯 Core Matching Strategies (Cascade Order)

| # | Strategy | Confidence | Trigger | Example |
|---|----------|-----------|---------|---------|
| 1️⃣ | **Exact Reference** | 100% | Invoice # in bank libelle | "INV-2024-001" found in "Paiement INV-2024-001" |
| 2️⃣ | **Exact Amount + Tiers** | 95% | Amount exact (0.5%), tiers match ≥75% | Tx: 50,000 MUR / ACME → Facture: 50,000 / ACME Ltd |
| 3️⃣ | **Close Amount + Tiers** | 85% | Amount ±1-5%, tiers match ≥40% | Tx: 50,000 / Client → Facture: 50,750 / Client (1.5% diff) |
| 4️⃣ | **Grouped Sum** | 85% | N factures (2-5) sum = transaction | Tx: 100,000 / ABC → Factures: 60k + 40k both from ABC |
| 5️⃣ | **Partial Payment** | 70% | Payment 10-90% of invoice | Tx: 5,000 / XYZ → Facture: 10,000 / XYZ (acompte) |

## 🧮 Key Math

```
Amount Tolerance:
  Same currency:     ±1%
  Cross-currency:    ±5% or 100 MUR (whichever is tighter)

Tiers Similarity (Jaccard):
  "Acme S.A.R.L." vs "ACME Ltd"
  → normalize both → "acme" vs "acme"
  → score = 1.0 (100% match)

FX Conversion:
  1 EUR = 46.50 MUR (fallback)
  amount_mur = amount_eur * 46.50

Confidence Modifiers:
  + 0.05 if payment within terms
  - 0.10 if payment >90 days late
```

## 📊 API Routes Map

```
POST /api/comptable/rapprochement/smart
├─ INPUT:  { societe_id, date_debut?, date_fin? }
├─ OUTPUT: { proposals[], stats }
└─ TIME:   <5s (pure heuristic)

POST /api/comptable/rapprochement/smart/apply
├─ INPUT:  { societe_id, proposals[], min_confidence=0.85 }
├─ OUTPUT: { applied, skipped, errors[] }
└─ ACTION: Update releves + factures + ecritures

POST /api/comptable/rapprochement/agent
├─ TOOLS:  [list_unmatched_transactions, list_unpaid_invoices, apply_match, ...]
├─ MODE:   Agentic loop (max 4 iterations, 55s timeout)
└─ DIRECT: { direct_action: { tool: "apply_match", input: {...} } }

POST /api/comptable/rapprochement/reset
└─ ACTION: Delete ALL FAC-*, BANK-*, clear lettrage (⚠️ destructive)
```

## 🔄 Direction Rule (CRITICAL!)

```
DEBIT (tx.debit > 0)          CREDIT (tx.credit > 0)
  ↓                             ↓
Money OUT                      Money IN
  ↓                             ↓
Supplier Payment              Client Payment
(fournisseur)                  (client)
  ↓                             ↓
Match to:                      Match to:
  Facture type='fournisseur'     Facture type='client'
  Journal: ACH                   Journal: VTE
  Accounts: 401, 607, 4456       Accounts: 411, 706, 4457
```

## 📝 Journal Entries Auto-Generated

**When Facture Created** (ref_folio=FAC-{id}):
```
CLIENT:                        SUPPLIER:
  DR 411 (Client)                DR 607 (Purchases)
  CR 706 (Sales)                 DR 4456 (VAT In)
  CR 4457 (VAT Out)              CR 401 (Supplier)
```

**When Transaction Matched** (ref_folio=BANK-{releve}-{idx}):
```
SUPPLIER PAYMENT:              CLIENT PAYMENT:
  DR 401 (Supplier)              DR 512 (Bank)
  CR 512 (Bank)                  CR 411 (Client)
```

## 🎛️ Confidence Thresholds

```
≥0.95     ✅ Auto-apply (no questions)
0.85-0.95 ✅ Auto-apply with stats
0.65-0.85 ⚠️  Needs review/arbitration
<0.65     ❌ Skipped/ignored
```

## 🏷️ Lettrage Codes

- `SM{timestamp}` — Smart engine match
- `AI{timestamp}` — AI agent match
- `RM{ref}` — Manual match (legacy)
- `RG{ref}` — Group match (legacy)

## 💾 Key DB Tables

| Table | Columns (relevant) | Purpose |
|-------|-------------------|---------|
| `releves_bancaires` | transactions_json (array), societe_id | Bank statements |
| `factures` | numero_facture, tiers, montant_ttc, montant_mur, type_facture, statut, rapproche_releve_id | Invoices |
| `ecritures_comptables_v2` | journal, ref_folio, numero_compte, debit_mur, credit_mur, lettre | General Ledger |
| `taux_change` | devise, taux, date_taux | FX rates |

## ✅ Pre-Apply Verifications (5 Checks)

```
BEFORE apply_match:

1. Transaction not already rapproche
   ✓ Check: tx.statut !== 'rapproche' && !tx.lettre

2. All factures exist & accessible
   ✓ Check: factures.length === facture_ids.length

3. Factures not already paid/matched
   ✓ Check: !facture.rapproche_releve_id && facture.statut !== 'paye'

4. Amount within tolerance
   ✓ Check: |tx_amount - sum_factures| / sum_factures ≤ 5%

5. Direction matches
   ✓ Check: (debit → fournisseur) && (credit → client)

IF ALL 5 PASS → Apply & generate entries
IF ANY FAIL  → Reject with error message
```

## 🛠️ Utility Functions

```typescript
// Normalize tiers name for comparison
normalize("ACME Ltd S.A.R.L. & Co.") 
  → "acme"

// Score similarity 0-1
tiersScore("Acme", "ACME Ltd")
  → 0.9 (substring match)

// Convert to MUR
toMUR(1000, "EUR", { EUR: 46.50 })
  → 46500

// Load latest rates (DB > fallback)
await getTauxChange()
  → { EUR: 46.50, GBP: 54.20, ... }
```

## ⚡ Performance Tips

- **Smart route**: <5s for 200 transactions (pure heuristic)
- **Smart apply**: Batch all writes (releves saved once)
- **Agent loop**: Max 4 iterations, soft timeout 55s
- **Grouped sum**: Limited to 5-facture subsets (avoid combinatorial explosion)
- **Pre-load releves**: Avoid N+1 queries

## 🚨 Common Pitfalls

❌ **Don't**: Match debit transaction to client facture
✅ **Do**: Match debit to supplier, credit to client

❌ **Don't**: Bypass server-side validation (apply/route.ts checks)
✅ **Do**: Trust the 5 verifications in smart/apply

❌ **Don't**: Compare tiers directly ("ACME" vs "ACME Ltd")
✅ **Do**: Normalize first, then use tiersScore()

❌ **Don't**: Use hardcoded FX rates
✅ **Do**: Call getTauxChange() to get DB rates

❌ **Don't**: Keep lettrage when unreconciling
✅ **Do**: Clear lettre, facture_ids, statut when reverting

## 📍 Statuses

**Factures**:
- `en_attente` — unpaid
- `retard` — overdue
- `partiel` — partially paid
- `paye` — fully paid
- `annule` — cancelled
- `brouillon` — draft

**Transactions**:
- `non_identifie` — unreconciled
- `rapproche` — reconciled
- `interne` — internal transfer
- `frais_bancaires` — bank fees
- `salaire_bulk` — payroll

## 🎨 UI Components (shadcn/ui)

All in `components/ui/`:
- Card, Dialog, Button, Badge, Table
- Select, Input, Textarea
- Tooltip, Dialog, Drawer
- MonthPicker (custom)

---

**Last Updated**: April 10, 2026  
**Maintained By**: Development Team
