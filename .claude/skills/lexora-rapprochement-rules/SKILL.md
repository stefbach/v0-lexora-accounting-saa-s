---
name: lexora-rapprochement-rules
description: Apply Lexora's deterministic bank reconciliation rules for Mauritian accounting. Use when the user asks about bank transaction classification, automatic letterage, BNQ journal entries, payment matching to invoices, or the rapprochement automatique workflow. Covers rules R1-R7, salary payments to 4210, MRA payments (disabled), and cross-letterage paye/MRA/cotisations.
---

# Lexora — Rapprochement Bancaire skill

This skill encapsulates Lexora's deterministic reconciliation engine for
matching bank transactions to invoices/payments, creating BNQ journal entries,
and applying cross-letterage.

## When to invoke

Use this skill when the user mentions:
- "rapprochement", "rapprochement bancaire", "auto-rapprocher"
- "lettrage", "lettrer", "lettre", "lettre R001"
- "classer transaction", "classification écriture"
- "BNQ", "journal BNQ", "écriture banque"
- "agent déterministe", "RULE 1", "RULE 4"
- Account flow involving 411 (client), 401 (fournisseur), 4210 (paye), 512 (banque)

## Source of truth

The engine lives in:
- `app/api/comptable/rapprochement/route.ts` (main reconciliation logic)
- `app/api/comptable/rapprochement/agent/deterministic/route.ts` (rule-based agent)
- `lib/accounting/ecritures-factures.ts` (BNQ entry creation)

All entries go to `ecritures_comptables_v2` (V2 only since migration 230).

## The 7 rules (R1-R7)

| Rule | Match | Action |
|------|-------|--------|
| R1 | Bank credit ↔ unpaid client invoice (411) by amount + tiers + ±60j | Create BNQ, lettre, mark facture paye |
| R2 | Bank debit ↔ unpaid supplier invoice (401) by amount + tiers + ±60j | Create BNQ, lettre, mark facture paye |
| R3 | Bank debit ↔ payroll period (4210) by approximate net amount | Create BNQ on account 4210, cross-letterage with OD-PAIE |
| R4 | Bank debit ↔ MRA payment | **DISABLED** (sub-type unknown — PAYE/NSF/CSG/TDS — without OCR justificatif) |
| R5 | Bank ↔ internal transfer (transfer between own bank accounts) | Mark `interne`, no BNQ |
| R6 | Bank ↔ amortization / depreciation pattern | (not used for bank reconciliation) |
| R7 | Bank ↔ CCA (compte courant associé) | Create CCA entry, mark with `ref_folio CC-...` |

## Key invariants

1. **Salary BNQ uses 4210, never 641**. The charge 641 is already created by
   `OD-PAIE`. The BNQ only settles the debt 4210. Fix done in commit
   `15b10e1d` after a regression created phantom payroll charges.

2. **Anti-doublon BNQ par facture_id**. `createEcrituresForPayment` checks if
   a BNQ already exists for `facture_id` and refuses to create a duplicate.

3. **classer_transaction refuses re-classification** if `transactions_json.statut`
   is already `rapproche` or `interne` (HTTP 409). User must manually
   declassify first.

4. **Cross-letterage** is automatic for paye/MRA/cotisations: when a BNQ on
   4210/4330/43xx is created, the engine looks for matching OD-PAIE / SAL
   entries within ±60j and applies the same `lettre`.

## MRA classification (RULE 4 — disabled)

MRA payments from the bank can be PAYE, NSF, CSG, TDS, or income tax — each
goes to a different account. Without the OCR justificatif, classification is
ambiguous. Decision (May 2026):
- RULE 4 is **disabled** in the deterministic agent
- User must manually select the sub-type in the UI
- TODO: add a sub-type selector UI to re-enable RULE 4 (account 4330 PAYE,
  4311/4312 CSG/NSF, 4471 TDS)

Never auto-classify a generic "MRA" payment to 4330 or 4471 — the resulting
balance will be wrong.

## CCA (Compte Courant Associé) handling

The CCA is a dette envers associé. Lexora avoids double-counting between the
CCA page (`/client/compte-courant`) and rapprochement bancaire:
- CCA movements are marked with `ref_folio` starting with `CC-`
- The deterministic agent recognizes this prefix and skips the transaction
- Purge migration 231 cleaned historical duplicates

## Letterage uniqueness

A `lettre` is shared by a **group** of balanced entries (sum debit = sum credit).
Multiple entries can have the same letter — that's the whole point. The
index `idx_ecritures_v2_lettre_lookup` is intentionally **not unique** to
allow this. See migration 224 comments.

## When the user reports "duplicate" issues

Check in order:
1. Is the doublon on V1 (legacy view) or V2? Always read V2 only.
2. Is it from CCA + rapprochement double-counting? Check `ref_folio LIKE 'CC-%'`.
3. Is it an OCR collision on `numero_facture`? Auto-suffix `-2`, `-3` should kick in.
4. Is it a re-classification without prior declassification? Trigger HTTP 409 should prevent it.
5. Is it a SAL trigger + RPC `generer_ecritures_paie` running both? Migration 205 disables SAL trigger.

## API surface

`POST /api/comptable/rapprochement` with `action`:
- `auto_rapprocher` — runs all 7 rules on unmatched transactions
- `lettrer_multi` — manually letter multiple ecritures, creates BNQ
- `lettrer_manuel` — manual letterage with cross-paye matching
- `classer_transaction` — assign a category (refuses re-classification)
- `delettrer` — undo letterage

Webhook input: `releve_bancaire_id`, `transaction_ids[]`, `categorie`, etc.

## Common pitfalls

- **Don't read ecritures_comptables (V1 view) directly** — always V2.
- **Don't call createEcrituresForFacture from upload route** if facture has UNIQUE collision — auto-suffix happens BEFORE INSERT.
- **fetchAllPaginated is mandatory** for any read that may exceed 1000 rows (financial, grand-livre, rapprochement kpis).
- **Don't reactivate RULE 4** until there's a sub-type UI.
