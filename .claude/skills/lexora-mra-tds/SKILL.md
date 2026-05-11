---
name: lexora-mra-tds
description: Generate Mauritian tax filings (MRA PAYE/NSF/CSG) and Tax Deducted at Source (TDS) calculations for Lexora SaaS. Use when the user asks about MRA declarations, payroll tax filing, TDS withholding, income tax form 3, or NSF/CSG contributions for Mauritius.
---

# Lexora — MRA / TDS skill

This skill encapsulates Mauritian Revenue Authority (MRA) tax compliance
logic implemented in Lexora.

## When to invoke

Use this skill when the user mentions:
- "MRA", "Mauritius Revenue Authority", "declaration MRA"
- "PAYE", "NSF", "CSG", "Social Contributions" (Mauritius)
- "TDS", "Tax Deducted at Source", "tax withholding"
- "IT Form 3", "annual income tax return"
- "income tax 15%", "corporate tax Mauritius"
- "remittance form", "bordereau MRA"
- Account numbers 4471 (TDS), 4421/4422 (APS), 4330 (PAYE), 4311/4312 (CSG/NSF salarié), 4321-4324 (CSG/NSF patronal)

## Key Mauritian rates (2025)

| Item | Rate | Source |
|------|------|--------|
| Corporate tax | 15 % | Income Tax Act 1995 §44A |
| VAT | 15 % (or 0% offshore) | VAT Act 1998 |
| TDS — professional fees | 3 % to 10 % | Income Tax Act 1995 §111 |
| CSG — salarié <50k MUR | 1.5 % | Social Contributions Act 2021 |
| CSG — salarié ≥50k MUR | 3 % | Social Contributions Act 2021 |
| CSG — patronal | 3 % | Social Contributions Act 2021 |
| NSF — salarié | 1 % (capped) | mig 212 (Lexora baremes) |
| NSF — patronal | 2.5 % (capped) | mig 212 |

CSG/NSF baremes are stored in `nsf_baremes` table (mig 212) and parameters in `params_paie_mra`.

## PAYE — Pay As You Earn

Mauritian PAYE bands (per Income Tax Act, indexed annually):
- 0 - 390,000 MUR: 0%
- 390,001 - 700,000: 10%
- 700,001+: 15%

Implementation: `lib/rh/paie.ts:calculerBulletin()` (calls into `params_paie_mra`).

Account flow per payroll cycle (RPC `generer_ecritures_paie`):
- Debit 6411 (Salaires bruts) + 6451-6454 (charges patronales)
- Credit 4210 (Personnel — dettes), 4311/4312 (CSG/NSF salarié), 4321-4324 (CSG/NSF patronal), 4330 (PAYE)

## TDS — Tax Deducted at Source

TDS applies on payments to suppliers for specific services (professional fees,
rent, royalties). Lexora auto-deducts via:
- Account 4471 (TDS dû — passif)
- Trigger: when supplier invoice journalized, check TDS rate per `tiers` config
- Net payment to supplier = invoice_amount × (1 - tds_rate/100)
- Lexora bookkeeping: Debit 401 (full), Credit 512 (net), Credit 4471 (TDS)

Important: account 444 historically was used by mistake — migration 226 corrected
this to 4471. Never reintroduce account 444 for MRA payments.

## MRA declarations supported in Lexora

| Form | Frequency | Lexora endpoint |
|------|-----------|-----------------|
| PAYE remittance | Monthly | (TODO route) |
| NSF/CSG remittance | Monthly | (TODO route) |
| VAT return | Monthly/Quarterly | `/api/comptable/tva/export` |
| IT Form 3 (TDS annual) | Annual (Sept 30) | `/api/comptable/it-form3` |
| Annual Income Tax | Annual | (manual via Excel export) |

## Generating a declaration

For PAYE/NSF/CSG (monthly):
1. Filter `ecritures_comptables_v2` by `journal='OD-PAIE'` for the period
2. Sum credits on accounts 4311/4312, 4321-4324, 4330
3. Compute net payable = sum
4. Generate bordereau (PDF + Excel) with totals per category
5. After remittance, record payment via `createEcrituresForPayment` with `lettre` to clear 43xx

For IT Form 3 (annual TDS):
1. Filter `ecritures_comptables_v2` by account `4471` for the fiscal year
2. Aggregate by supplier (tiers)
3. Generate IT Form 3 with TDS withheld per supplier

## Common pitfalls

- **Don't classify MRA payments automatically without sub-type** (RULE 4 of
  deterministic agent is intentionally disabled, see
  `/api/comptable/rapprochement/agent/deterministic/route.ts`). MRA paid via
  bank can be PAYE / NSF / CSG / TDS — the agent can't tell which without
  the receipt. Always ask the user or read the OCR justificatif.
- **CSG rate switch at 50k MUR threshold** is on the gross salary, not the net.
- **NSF cap applies to a base salary cap**, not to the contribution itself.
- **15% corporate tax** is on accounting profit adjusted for tax-inefficient
  expenses (entertainment, donations cap, etc.). Use `app/api/comptable/ifrs15-overtime` and the IT Form 3 wizard for accurate computation.

## See also

- Migration 222: comptes IFRS/TDS/APS
- Migration 226: TDS sous-comptes auxiliaires
- Migration 212: NSF baremes 2025
- Migration 213: bulletins paie base CSG/NSF
- `lib/rh/paie.ts` — payroll computation
