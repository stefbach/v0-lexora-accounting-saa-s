---
name: lexora-gbc-ifrs-complete
description: Build and reason about Mauritian Global Business Companies (GBC) compliance with Full IFRS (not IFRS for SMEs). Covers Partial Exemption Regime (PER 80%), substance requirements (CIGA), Transfer Pricing, Beneficial Ownership, CRS/FATCA, BEPS Pillar Two GloBE, consolidation IFRS 10, IFRS 16 leases, functional currency IAS 21. Use whenever the user mentions GBC, Authorised Company, FSC, Global Business, Pillar Two, full IFRS, holding structure, cross-border, or Mauritius offshore.
---

# Lexora — GBC + Full IFRS skill

This skill encapsulates the knowledge required to extend Lexora from a
domestic-SME accounting SaaS into a tool that can also serve **Mauritian
Global Business Companies** (GBC1, Authorised Companies, and holdings).

## When to invoke

Trigger keywords:
- "GBC", "Global Business Company", "Authorised Company"
- "FSC", "Financial Services Commission Mauritius"
- "Full IFRS" (as opposed to IFRS for SMEs)
- "Partial Exemption Regime", "PER", "80% exemption"
- "Substance", "CIGA", "Core Income Generating Activities"
- "Transfer Pricing", "TP documentation", "arm's length"
- "Beneficial Owner", "UBO", "beneficial ownership register"
- "CRS", "FATCA", "automatic exchange of information"
- "BEPS Pillar Two", "GloBE", "Global Minimum Tax", "DMTT"
- "IFRS 10 consolidation", "holding", "subsidiary"
- "IFRS 16 leases", "right of use", "lease liability"
- "functional currency" (IAS 21)
- "Foreign Tax Credit", "FTC"
- "Tax Residency Certificate", "TRC"

## Conceptual model

### Two regulatory universes

| Aspect | Domestic Mauritius PME | GBC / Authorised Company |
|---|---|---|
| Regulator | MRA + Companies Act 2001 | **FSC** + MRA + Companies Act |
| Accounting framework | IFRS for SMEs OR Full IFRS | **Full IFRS mandatory** (FSC Rules) |
| Functional currency | MUR | Usually **USD, EUR, GBP, ZAR** — rarely MUR |
| Corporate tax | 15 % flat | 15 % × 20 % = **3 %** effective (with PER) on qualifying income |
| Audit | Mostly not required (under thresholds) | **Always required** (FSC obligation) |
| Substance | N/A | **CIGA + minimum spend + employees + premises** |
| Transfer Pricing | Only if related party transactions | **Always** (mandatory documentation Maurice TP Act 2023) |
| UBO register | Companies Act only | FSC + AML + ML Act + automatic exchange |

### Key principle for Lexora architecture

A `societes` row has a **`regime`** field (mig 258, Phase K) with values:
- `domestic` (default)
- `gbc1`, `authorised_company`, `holding`, `branch_foreign_pe`

**Canonical helper** : `lib/accounting/regime.ts` exports
`getActiveModules({ regime, devise_fonctionnelle })` which returns a
`ModuleActivation` object (per_active, substance_required, ubo_required,
tp_required, consolidation_active, crs_fatca_active, pillar_two_eligible,
ias21_translation_active, ifrs16_leases_active).

**Sidebar** is dynamic : section "GBC & Full IFRS" hidden if `regime === 'domestic'`
via `requiredRegime` in `ClientSidebarFull.tsx`.

**Dashboard** filters tiles via `getActiveModules()` — only relevant phases appear.

**Société form** (`/client/societes`) has a "Type de société" dropdown with
5 options that pre-fills suggested functional currency and conditionally
shows FSC license fields for gbc1/authorised_company.

Always branch GBC-specific logic on `societe.regime` via `getActiveModules()` —
avoid ad-hoc `devise_fonctionnelle !== 'MUR'` checks.

## The 9 phases (implementation roadmap)

### Phase A — Functional Currency (FX primary, MUR secondary)

**Why it matters**: A GBC operates in USD. Today Lexora forces MUR
everywhere — wrong per IAS 21 §9-14.

**What to build**:
1. Add `societes.devise_fonctionnelle` (TEXT, default 'MUR').
2. New columns on `ecritures_comptables_v2`:
   - `debit_fonctionnelle` NUMERIC — amount in functional currency
   - `credit_fonctionnelle` NUMERIC
   - `taux_fonct_vers_mur` NUMERIC — rate used for translation
   - Existing `debit_mur` / `credit_mur` become **translation columns** for MRA reporting.
3. Translation methodology (IAS 21 §38-49):
   - Monetary items: closing rate
   - Non-monetary items at cost: historical rate
   - P&L items: rate at transaction date
   - Translation differences → OCI ("Cumulative Translation Adjustment" account 1078)
4. Display toggle in UI: "Vue MUR / Vue fonctionnelle".

**Migration**: `2XX_functional_currency.sql`.

### Phase B — Partial Exemption Regime (PER 80%) + Foreign Tax Credit

**Why it matters**: A GBC1 earning foreign dividends taxes at 3% effective,
not 15%. Today Lexora computes 15% flat → overstates the tax liability.

**Decision tree** (Income Tax Act §50C):
```
For each revenue item:
  is_per_eligible? (foreign dividends, foreign-source interest, profits
                    of foreign PE, foreign-source royalties on IP held in MU)
    AND substance_requirements_met?
    → exempt 80% → effective tax 3%
  else
    → full tax 15%
```

**What to build**:
1. Tag each revenue line with `per_eligible` boolean (per ligne facture or
   per écriture compte produit).
2. RPC `compute_tax_liability(societe_id, exercice)` returning:
   - Income breakdown: PER-eligible vs non-eligible
   - Tax liability = (non_eligible × 15%) + (eligible × 3%)
   - Foreign Tax Credit applied (Income Tax Act §77 — credit up to MU tax rate)
3. New page `/client/tax-computation` with audit trail.
4. New comptes: 695 (impôt 3% PER), 6951 (FTC applied).

### Phase C — Substance Tracking (CIGA)

**Why it matters**: PER requires substance. If not met, retroactive 15% +
penalties.

**Substance requirements per activity** (FSC Guidelines):
| Activity | Min annual expenditure (MUR) | Min employees | Premises |
|---|---|---|---|
| Investment holding | 4,800,000 | 1 qualified | Yes |
| Headquartering | Higher | 3+ | Yes |
| Fund management | Higher | Investment managers | Yes |
| ICT / IP holding | Stricter | Tech-qualified | Yes |
| Other | 600,000 | 1+ | Yes |

**What to build**:
1. New table `gbc_substance_tracking`:
   - societe_id, exercice, activite_principale
   - min_expenditure_required, actual_expenditure_mur
   - min_employees_required, actual_employees, employees_qualified
   - premises_address, premises_verified
   - ciga_activities_in_mauritius (JSON: board meetings, decisions, etc.)
   - compliance_status (compliant / at_risk / non_compliant)
2. Auto-calculate from existing data:
   - actual_expenditure: SUM(charges classe 6) WHERE compte LIKE '6%' AND on Mauritian counterparty
   - actual_employees: COUNT(employes WHERE active AND not_offshore)
3. Page `/client/gbc-substance` with traffic-light status.

### Phase D — Transfer Pricing Documentation

**Why it matters**: Maurice TP Act 2023 — mandatory documentation for all
related-party transactions. Non-compliance → 10% penalty + tax adjustment.

**Required deliverables per FY**:
- **Local file**: each transaction > MUR 5,000,000 with related parties
  - Description, amount, parties, method (CUP, RPM, CPM, TNMM, PSM)
  - Benchmarking analysis (arm's length range)
- **Master file** (if part of MNE > MUR 875M turnover):
  - Group structure, business overview, intangibles, financing, financial pos
- **CbCR**: only ultimate parent if group > €750M
  - Per-jurisdiction revenue, profit, taxes, employees, assets

**What to build**:
1. Mark `tiers` as `related_party BOOLEAN` with relationship type.
2. Auto-extract intragroup transactions from `factures` + `ecritures`.
3. Wizard for benchmarking (link to public DBs or manual entry).
4. PDF generator: Local File + Master File templates.

### Phase E — Beneficial Ownership Register

**Why it matters**: FSC AML Act — declare UBOs holding ≥10% with full
identification. Penalty: MUR 1M + license suspension.

**What to build**:
1. Table `beneficial_owners`:
   - societe_id
   - prenom, nom, date_naissance, nationalite, residence_address
   - id_type (passport/national_id), id_number, id_expiry
   - pct_detention (%), nature_controle (shares/voting/board/contract)
   - is_pep (Politically Exposed Person)
   - declared_at, last_verified_at
2. Page `/client/beneficial-owners` with KYC docs upload.
3. Yearly attestation workflow (UBO unchanged confirmation).
4. Export FSC declaration format.

### Phase F — Consolidation IFRS 10

**Why it matters**: A Mauritian holding with foreign subsidiaries must
present **consolidated** financial statements (IFRS 10 §4).

**What to build**:
1. Table `societes_relationships`:
   - parent_societe_id, child_societe_id
   - pct_detention, pct_voting_rights
   - relationship_type (subsidiary / associate / joint_venture)
   - acquisition_date, acquisition_cost_mur, fair_value_at_acquisition
2. RPC `consolidate_statements(parent_id, exercice)`:
   - Aggregate all entities in scope
   - Eliminate intercompany transactions (revenue/cost, AR/AP, loans)
   - Compute goodwill (IFRS 3): Cost − FV net assets at acquisition
   - Compute NCI (Non-Controlling Interest): for partial subs
   - Translation differences for foreign subs (IAS 21)
3. Page `/client/consolidation`.

### Phase G — CRS / FATCA Reporting

**Why it matters**: Maurice signed CRS (auto exchange) + FATCA IGA (US).
GBC holding financial accounts for non-residents must report annually.

**What to build**:
1. Table `crs_accounts` (each account held for non-MU resident):
   - account_holder_name, country_of_residence, TIN
   - account_balance_eoy, interest_paid, dividends_paid, sale_proceeds
2. Export XML format (CRS schema 2.0 + FATCA IGA Model 1A).
3. Submit to MRA via online filing.

### Phase H — BEPS Pillar Two GloBE

**Why it matters**: Maurice implements Pillar Two in 2025. Groups with
consolidated revenue > €750M (~MUR 36B) face 15% minimum effective tax
per jurisdiction. If MU rate < 15% (e.g. 3% PER), Domestic Minimum
Top-up Tax (DMTT) bridges the gap.

**What to build**:
1. Computation engine:
   - GloBE Income = Financial accounting profit + adjustments (OECD rules)
   - Covered Taxes = current + deferred tax
   - Effective Tax Rate (ETR) = Covered Taxes / GloBE Income
   - Top-up Tax = (15% − ETR) × Excess Profit (if ETR < 15%)
   - Substance-Based Income Exclusion (SBIE): 5% payroll + 5% tangible assets
2. Report GloBE Information Return (GIR) per OECD schema.

**Note**: Only for clients in MNE groups > €750M. Most GBC clients won't
trigger this. Build last.

### Phase I — IFRS 16 Leases (cross-cutting, applies to ALL companies)

**Why it matters**: IFRS 16 §22-28 — recognise Right-of-Use asset + Lease
Liability for all leases > 12 months. Maurice has many commercial /
vehicle leases. Today Lexora books rent as expense (account 6132) — wrong
under IFRS 16.

**What to build**:
1. Table `leases`:
   - societe_id, lessor, asset_description, asset_category
   - commencement_date, term_months, monthly_payment, currency
   - implicit_rate_pct (or incremental borrowing rate)
   - initial_direct_costs, restoration_obligation
   - lease_modification_history JSONB
2. RPC `generate_lease_entries(lease_id)`:
   - At inception: Dr 2151 (Right of Use), Cr 1751 (Lease Liability LT), 1752 (CT)
   - Monthly: Dr 6811 (Amortisation RoU), Cr 28151 (Acc. amortisation)
   - Monthly: Dr 1751/1752, Dr 6611 (Interest), Cr 512 (Bank)
3. Disclosures (IFRS 16 §51-60).

## Key new account codes to add to PCM Maurice

| Account | Description | Type |
|---|---|---|
| 1078 | Cumulative Translation Adjustment (CTA) | Equity |
| 1751 / 1752 | Lease Liability LT / ST (IFRS 16) | Liability |
| 2151 | Right-of-Use Asset (IFRS 16) | Asset |
| 28151 | Accumulated amortisation RoU | Asset (contra) |
| 695 | Impôt sur bénéfices PER 3% | Expense |
| 6951 | Foreign Tax Credit applied | Expense (contra) |
| 6811 | Amortisation RoU | Expense |
| 6611 | Lease interest expense | Expense |

## Critical compliance dates (Maurice GBC)

| Obligation | Deadline | Penalty if missed |
|---|---|---|
| FSC annual licence fee | Anniversary of license | License revocation |
| Audited financial statements | 6 months after year-end | MUR 100k + license review |
| Tax return (CIT) | 6 months after year-end | 5% per month interest |
| Substance attestation | At license renewal | Loss of PER → 15% retroactive |
| Beneficial ownership update | Within 30 days of change | MUR 1M |
| CRS / FATCA filing | 31 July following year-end | MUR 100k |
| TP documentation | Available at audit | 10% penalty + adjustment |
| GloBE Information Return | 18 months after year-end (first year) | OECD rules |

## Common pitfalls to avoid

1. **Confusing IFRS for SMEs with Full IFRS**. The PCM mapping in Lexora is
   built around IFRS for SMEs. Full IFRS has more disclosures (IFRS 7 detailed,
   IFRS 13 fair value hierarchy, IFRS 15 detailed performance obligations,
   IFRS 16 leases, IAS 36 impairment).

2. **Using MUR as functional currency for a GBC**. Almost always wrong. Use
   the currency in which the entity generates revenue and incurs costs
   (IAS 21 §9).

3. **Applying 15% flat tax on all GBC income**. Always check PER eligibility
   first. Foreign dividends / interest are usually 80% exempt → 3%.

4. **Forgetting substance attestation**. PER without substance = treated as
   non-eligible income retroactively. Track CIGA / employees / expenses
   throughout the year, not at audit time.

5. **Treating leases as expense (account 6132)**. Wrong under IFRS 16. Even
   for domestic Lexora users, IFRS 16 applies if they claim Full IFRS.

6. **Mixing domestic and GBC sociétés in consolidated reports**. They have
   different functional currencies, different tax regimes, different
   disclosure requirements. Branch on `regime` field.

7. **Ignoring related party transactions**. Maurice TP Act 2023 requires
   documentation for ALL related-party transactions in a GBC. Default
   posture: assume TP documentation required, prove otherwise.

8. **Misusing the GBC1 vs Authorised Company distinction**:
   - GBC1 (Global Business License): tax resident in Mauritius, PER applies,
     full audit obligation, FSC supervision.
   - Authorised Company: NOT tax resident in Mauritius, taxed in country of
     control, simpler regime but cannot benefit from MU tax treaties.

## Lexora module/page mapping

When extending Lexora for GBC support, the new modules go under:

```
app/
  client/
    gbc-substance/          # Phase C
    beneficial-owners/      # Phase E
    consolidation/          # Phase F
    leases/                 # Phase I
    tax-computation/        # Phase B
  api/
    comptable/
      gbc/
        substance/route.ts
        per-computation/route.ts
        consolidation/route.ts
      leases/route.ts
      transfer-pricing/route.ts
      beneficial-owners/route.ts
      crs-fatca/route.ts
      pillar-two/route.ts
lib/
  accounting/
    functional-currency.ts  # Phase A helpers
    per.ts                  # PER eligibility rules
    consolidation.ts        # Phase F engine
    leases-ifrs16.ts        # Phase I engine
supabase/
  migrations/
    2XX_functional_currency.sql       # Phase A
    2XX_per_foreign_tax_credit.sql    # Phase B
    2XX_gbc_substance_tracking.sql    # Phase C
    2XX_transfer_pricing.sql          # Phase D
    2XX_beneficial_owners.sql         # Phase E
    2XX_consolidation_relationships.sql # Phase F
    2XX_crs_fatca_accounts.sql        # Phase G
    2XX_pillar_two_globe.sql          # Phase H
    2XX_leases_ifrs16.sql             # Phase I
```

## References

- **IFRS for SMEs** (current) vs **Full IFRS** (target for GBC) — IASB
- **FSC Rules and Guidelines** (https://www.fscmauritius.org)
- **Income Tax Act 1995** §50C (PER), §77 (FTC), §73A (Substance)
- **Maurice TP Act 2023**
- **IAS 21** Functional currency
- **IFRS 9** Financial instruments (already covered by `lexora-ifrs9-ecl` skill + mig 237)
- **IFRS 10** Consolidated financial statements
- **IFRS 16** Leases
- **OECD BEPS Pillar Two** GloBE Model Rules (Dec 2021)
- **CRS** OECD Common Reporting Standard
- **FATCA** US-Mauritius IGA Model 1A

## Decision rule for invocation priority

When the user asks "should I build feature X for GBC?", check in order:
1. Is the user's société `domestic`? → defer GBC features
2. Is `regime` in (`gbc1`, `authorised_company`, `holding`)? → applies
3. What's the company size?
   - Single GBC < MUR 36B turnover: skip Pillar Two (Phase H)
   - Holding with subs: prioritize Phase F (consolidation)
   - Single entity: prioritize Phase B (PER) + Phase C (substance)
4. Is the auditor pushing for IFRS 16? → prioritize Phase I

Default sequence for a new GBC client onboarding:
**Phase A → B → C → I → E** in this order (functional, then tax, then
substance, then leases for audit, then UBO). Phase D/F/G/H on demand.
