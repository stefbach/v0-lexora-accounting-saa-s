---
name: lexora-ifrs9-ecl
description: Compute Expected Credit Loss (ECL) under IFRS 9 general approach for Mauritian SaaS Lexora. Use when the user asks about credit risk provision, stage classification, SICR detection, or counterparty PD/LGD parameters. Covers Stages 1/2/3, forward-looking macro adjustment, and IFRS 7 disclosure.
---

# Lexora — IFRS 9 ECL skill

This skill encapsulates the Lexora-specific implementation of IFRS 9 credit
loss provisioning (general approach) on top of the schema introduced in
migration 237.

## When to invoke

Use this skill when the user mentions:
- "ECL", "expected credit loss", "provision IFRS 9", "credit impairment"
- "Stage 1 / 2 / 3", "SICR", "significant increase in credit risk"
- "PD", "LGD", "EAD" for a counterparty or sector
- "Disclosure IFRS 7 §35M", "credit risk exposure"
- "forward-looking adjustment", "macro scenario", "PIB Maurice"
- Any analysis of `ifrs9_*` tables or RPCs in the Lexora database

Do NOT invoke for VAT, payroll, or general-purpose accounting questions.

## Conceptual model

IFRS 9 general approach uses a 3-stage classification per counterparty:

| Stage | Trigger | ECL horizon |
|-------|---------|-------------|
| 1 | Performing, no SICR | 12-month ECL |
| 2 | SICR detected (e.g., past due > 30 days) | Lifetime ECL |
| 3 | Credit-impaired / default (e.g., past due > 90 days) | Lifetime ECL |

Formula : `ECL = EAD × PD × LGD × macro_multiplier`

- `EAD` = Exposure At Default (current outstanding × ead_factor%)
- `PD`  = 12-month PD if Stage 1, lifetime PD otherwise
- `LGD` = Loss Given Default (default 45% — Basel II)
- `macro_multiplier` = Σ(scenario.pd_multiplier × scenario.weight_pct / 100)

## Lexora schema (migration 237)

Tables:
- `ifrs9_counterparty_params` — per-tiers PD/LGD/EAD (optional override)
- `ifrs9_sector_defaults` — fallback by sector (tourism, services, etc.)
- `ifrs9_stage_assignments` — current stage per (societe_id, tiers)
- `ifrs9_stage_history` — immutable audit trail (INSERT only)
- `ifrs9_macro_scenarios` — base/optimistic/pessimistic, weights sum to 100

RPCs:
- `ifrs9_compute_stage(societe_id, tiers, persist BOOLEAN)` → applies SICR
- `ifrs9_compute_ecl_full(societe_id)` → returns full ECL by counterparty
- `ifrs9_refresh_all_stages(societe_id?)` → batch refresh (cron quotidien)

View:
- `vw_ifrs9_disclosure` — exposure totals by stage for IFRS 7 §35M

## SICR rules (Lexora defaults)

```
IF max_age_days(unpaid invoices) >= 90 → Stage 3 (reason: 'past_due_90d')
ELSE IF max_age_days >= 30           → Stage 2 (reason: 'past_due_30d')
ELSE                                  → Stage 1 (reason: 'performing')

UNLESS manual_override = TRUE, in which case keep the user-set stage.
```

When recommending stage changes, always check:
1. Aging from `factures` (not just `vw_creances_aging` — it joins buckets)
2. Whether `manual_override` is set
3. Sector watchlist if Lexora introduces one in the future

## Forward-looking macro adjustment

`ifrs9_macro_scenarios` stores weighted scenarios per société:
- base: pd_multiplier=1.0, weight 60% (typical)
- optimistic: pd_multiplier=0.7, weight 20%
- pessimistic: pd_multiplier=1.5, weight 20%

The applied multiplier = Σ(pd_multiplier × weight_pct / 100). Σ weights MUST equal 100.

When the user wants to tune for Mauritius macro :
- BoM key rate increases → bump pessimistic weight up
- Tourism recovery (post-COVID, current cycles) → bump optimistic
- Sugar/textile decline → consider sector-level adjustments in `ifrs9_counterparty_params.secteur`

## API surface

Frontend route: `/client/ifrs9-ecl`

Backend:
- `GET  /api/comptable/ifrs9/ecl?societe_id=...&refresh=1`
- `POST /api/comptable/ifrs9/ecl` with body `{ action, ... }`:
  - `action: 'refresh'` — call RPC for one société
  - `action: 'override_stage'` — set stage, requires `tiers`, `stage`, `reason`
  - `action: 'set_params'` — set PD/LGD/EAD for a counterparty
  - `action: 'set_macro'` — set scenarios (validates Σ weight = 100)

## Audit trail expectations

Every stage transition MUST be traced:
- Automatic (cron/refresh) → reason = SICR rule name
- Manual (UI) → reason = user-supplied free text

Never delete from `ifrs9_stage_history`. Auditors check this table.

## Generating ECL accounting entries

When ECL provision is computed at period-end, the corresponding journal entry is:
- Debit 6817 (Dotations aux provisions ECL)
- Credit 491 (Provisions pour dépréciation des créances clients)

These accounts exist in plan_comptable since migration 222.

## Common pitfalls

- **Don't compute ECL on paid invoices**: only `statut IN ('en_attente', 'retard')` with positive `montant_mur`.
- **Don't aggregate across sociétés**: ECL is per-tenant; multi-société views are forbidden.
- **macro_multiplier must come from a valid_from ≤ today scenario** — older scenarios remain in history but aren't applied.
- **PD/LGD percentages are stored as percent (5.0 = 5%), not decimal (0.05)**. Always divide by 100 when computing.
