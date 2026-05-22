# MANUAL DE CONTROLES COMPTABLES - LEXORA SaaS
## Financial Control Procedures for Big 4 Audit Compliance

**Document Version**: 1.0 PHASE 3 Initial Release  
**Status**: AUDIT READY (Sections 1-3)  
**Prepared for**: DDS (Des Dunes Sarl) + OCC (Obesity Care Clinic)  
**Date**: 22 May 2026  
**Classification**: CONFIDENTIAL - FOR AUDITOR USE ONLY  

---

## DOCUMENT SCOPE & STRUCTURE

This manual documents **all material control procedures** for Lexora's accounting system, including:
- General controls (system architecture, user access, audit trails)
- Transaction-level controls (invoice-to-GL, payroll, bank reconciliation)
- Segregation of duties and exception handling
- Mauritian MRA compliance (PAYE, NSF, CSG, VAT)

**Audit Reference**: Created per Big 4 standards (SOX 404, ISACA, COSO framework)

**Total Estimated Pages**: 40 pages (8 sections)  
**Current Release**: Sections 1-3 (14 pages) - Foundation phase

---

# SECTION 1: SYSTEM OVERVIEW (3 PAGES)

## 1.1 System Architecture Diagram

**Lexora Technical Stack:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (Next.js 15)                    │
│  ┌───────────────┬───────────────┬───────────────────────────┐  │
│  │ Facturation   │ Comptabilité  │ Paie & RH     │ Rapports   │  │
│  │ • Ventes      │ • Grand Livre │ • Salaires    │ • Bilan    │  │
│  │ • Achats      │ • Journal     │ • Impôts      │ • Balance  │  │
│  │ • Devis       │ • Lettrage    │ • Déclarations│ • TVA      │  │
│  │ • Avoirs      │ • OCR upload  │ • Dossier RH  │ • GBC      │  │
│  └───────────────┴───────────────┴───────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS REST API
                             │ JWT Token Auth
┌────────────────────────────▼─────────────────────────────────────┐
│                 API LAYER (Next.js Route Handlers)               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ /api/comptable/*        (GL, reconciliation, lettrage)     │  │
│  │ /api/client/factures/*  (invoice CRUD + GL posting)        │  │
│  │ /api/rh/*               (payroll import, salary posting)    │  │
│  │ /api/admin/*            (repair, audit, reconciliation)     │  │
│  │ /api/mra/*              (tax filings, declarations)         │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ SQL Queries
                             │ RLS Policies
┌────────────────────────────▼─────────────────────────────────────┐
│            DATABASE LAYER (PostgreSQL + Supabase RLS)            │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ TRANSACTION TABLES:                                       │   │
│  │ • ecritures_comptables_v2 (GL entries - single source)    │   │
│  │ • factures + factures_lignes (invoices + line items)      │   │
│  │ • transactions_bancaires (bank tx in JSON)                │   │
│  │ • releves_bancaires (monthly bank statements)             │   │
│  │ • bulletins_paie (payroll slips)                          │   │
│  │ • lettrages (bank reconciliation matches)                 │   │
│  │ • employes (staff master data)                            │   │
│  │ • comptes_bancaires (bank account registry)               │   │
│  └───────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ REFERENCE TABLES:                                         │   │
│  │ • plan_comptable_mauricien (Mauritian COA)                │   │
│  │ • classification_rules (auto-matching rules R01-R06)      │   │
│  │ • taux_change_historique (frozen FX rates)                │   │
│  │ • societes (company registry)                             │   │
│  │ • audit_logs (change tracking - PLANNED)                  │   │
│  └───────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐      ┌──────▼────┐      ┌──────▼────┐
    │  n8n    │      │   MRA     │      │ External  │
    │Workflows│      │   API     │      │Integration│
    │(OCR,PDF)│      │(PAYE,NSF) │      │(Banks)    │
    └─────────┘      └───────────┘      └───────────┘
```

**Key Design Principles:**
1. **Single Source of Truth**: `ecritures_comptables_v2` is the GL master table
2. **Multi-Tenant Isolation**: Every transaction scoped by `societe_id` (UUID)
3. **Audit Trail Ready**: All mutations captured (audit_logs planned for Phase 2)
4. **Mauritian Compliance**: PCM canonical codes (4-digit: 4210, 706, 6400, etc.)
5. **FX Tracking**: Exchange rates frozen at transaction time (not live)

---

## 1.2 Database Schema Overview

### Core Transaction Tables

**ecritures_comptables_v2** (Source of Truth)
```
Table: ecritures_comptables_v2

┌─────────────────────────────────────────────────────────────────┐
│ IDENTITY & SCOPE                                                │
├─────────────────────────────────────────────────────────────────┤
│ id (UUID PK)                    Unique entry ID                 │
│ societe_id (UUID FK)            Multi-tenant scope (required)   │
│ dossier_id (UUID FK, nullable)  Legacy v1 compatibility         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ TRANSACTION DATING & REFERENCE                                  │
├─────────────────────────────────────────────────────────────────┤
│ date_ecriture (DATE)            Accounting date                 │
│ journal (TEXT)                  VTE|ACH|BNQ|SAL|OD|CLS          │
│ ref_folio (TEXT, unique idx)    Idempotency key:               │
│                                 FAC-<facture_id>               │
│                                 BANK-<releve>-<tx>             │
│                                 SAL-<YYYY-MM>                  │
│ numero_piece (TEXT)             Invoice/doc number (audit trail)│
│ exercice (TEXT YYYY)            Fiscal year                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ACCOUNT & AMOUNTS (ALWAYS IN MUR)                               │
├─────────────────────────────────────────────────────────────────┤
│ numero_compte (TEXT 4-digit)    PCM code: 4210, 706, 6400, etc. │
│ nom_compte (TEXT)               Account label (e.g., "Clients") │
│ libelle (TEXT, 80 chars)        Line description                │
│ debit_mur (NUMERIC 15,2)        Debit amount in MUR             │
│ credit_mur (NUMERIC 15,2)       Credit amount in MUR            │
│                                 NOTE: Exactly ONE is >0         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ FOREIGN CURRENCY (MIGRATION 172)                                │
├─────────────────────────────────────────────────────────────────┤
│ devise_origine (TEXT nullable)  EUR|USD|GBP|MUR (source curr)   │
│ montant_origine (NUMERIC null)  Amount in source currency       │
│ taux_change_applique (NUMERIC)  Frozen FX rate at time of entry│
│                                 (NOT live - prevents revaluation)
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ RECONCILIATION & TRACKING                                       │
├─────────────────────────────────────────────────────────────────┤
│ lettre (TEXT nullable)          Matching code (CLI-12345, etc)  │
│ date_lettrage (DATE nullable)   Date reconciled                 │
│ facture_id (UUID FK nullable)   Links to source invoice         │
│ created_at (TIMESTAMP)          Audit trail                     │
│ updated_at (TIMESTAMP)          Last modification               │
└─────────────────────────────────────────────────────────────────┘

CRITICAL CONSTRAINT (R1 - Balance Rule):
├─ SUM(debit_mur) = SUM(credit_mur) for every (societe_id, date, journal)
└─ Enforced via trigger tr_balance_check_insert (Migration 168)

CRITICAL INDEX (Deduplication + Idempotency):
├─ UNIQUE (societe_id, ref_folio, numero_compte) WHERE ref_folio IS NOT NULL
└─ Prevents accidental duplicate posting from API retries
```

**factures** (Customer + Supplier Invoices)
```
Table: factures

KEY FIELDS:
│ id (UUID PK)
│ societe_id (UUID FK)           Multi-tenant scope
│ type_facture                   'client' | 'fournisseur'
│ type_document                  'facture' | 'avoir' | 'devis' | 'note_debit'
│ numero_facture (TEXT)          Sequential number (MRA requirement)
│ date_facture (DATE)
│ date_echeance (DATE)           Due date
│ tiers (TEXT)                   Customer/Supplier name
│ 
│ montant_ht (NUMERIC)           Net amount
│ montant_tva (NUMERIC)          VAT amount
│ montant_ttc (NUMERIC)          Total inc. VAT
│ taux_tva (NUMERIC)             VAT rate
│ devise (TEXT, default 'MUR')   Currency (MUR|EUR|USD|GBP)
│ taux_change (NUMERIC)          Exchange rate (MUR per unit)
│ montant_mur (NUMERIC)          Amount in MUR (for GL posting)
│
│ statut                         'en_attente'|'partiel'|'paye'|'retard'|'annule'
│ rapproche_releve_id (UUID)     Bank statement matched to
│ rapproche_transaction_idx      Index in transaction_json
│ rapproche_date                 Date matched
│
│ facture_origine_id (UUID)      For credit notes (links to original)

GL POSTING RULES (automatic via createEcrituresForFacture):
├─ Customer Invoice (type_facture='client'):
│  ├─ DEBIT   4210 (Receivables)         = montant_mur (TTC)
│  ├─ CREDIT  706  (Sales Revenue)       = montant_mur - VAT
│  └─ CREDIT  4412 (VAT Payable)         = montant_tva
│
├─ Supplier Invoice (type_facture='fournisseur'):
│  ├─ DEBIT   601  (Purchase Expense)    = montant_mur - VAT
│  ├─ DEBIT   4411 (VAT Recoverable)     = montant_tva
│  └─ CREDIT  4020 (Payables)            = montant_mur (TTC)
│
└─ Credit Note (type_document='avoir'):
   └─ Reverse the above journal entries
```

**transactions_bancaires & releves_bancaires** (Bank Reconciliation)
```
Table: releves_bancaires

KEY FIELDS:
│ id (UUID PK)
│ societe_id (UUID FK)
│ compte_bancaire_id (FK)       Links to bank account
│ periode (TEXT YYYY-MM)        Statement month
│ date_debut / date_fin         Period boundaries
│ solde_ouverture / solde_cloture  Opening/closing balances
│ transactions_json (JSONB[])   Array of transactions
│ statut                         'en_attente'|'traite'|'erreur_ocr'
│
TRANSACTION OBJECT (within transactions_json):
├─ date (DATE)                  Booking date
├─ libelle (TEXT)               Description (e.g., "TRANSFER IB")
├─ debit / credit               Amounts (only one is >0)
├─ devise (TEXT)                Transaction currency (EUR|USD)
├─ montant_origine (NUMERIC)    Amount in source currency
├─ tiers_detecte (TEXT)         Auto-detected party name (OCR)
├─ statut                       'non_identifie'|'rapproche'|'propose'
├─ matched_type                 'client'|'fournisseur'|'frais'|'interne'|'compte_courant'
├─ facture_id (UUID)            Matched to single invoice
├─ facture_ids (UUID[])         Matched to multiple invoices
├─ lettre (TEXT)                Reconciliation code (AUTO0001, CLI-12345)
└─ rapproche_at (ISO datetime)  When matched
```

---

## 1.3 User Roles & Access Control Matrix

**Current Role Structure** (Evolving - See Phase 2 for SOD enforcement)

| Role | Responsibilities | System Permissions | Invoice Creation | GL Entry Post | Approval | Bank Reconcil | Notes |
|------|------------------|-------------------|-----------------|---------------|----------|---------------|-------|
| **Comptable** (Accountant) | Daily GL posting, reconciliation, month-end | All read, GL write, bank match | View only | POST to GL | View only | Full match | Primary accounting operator |
| **Directeur** (Owner) | Review, approval, strategic decisions | All read, GL review | Can create | Cannot post | APPROVE | Review only | Segregation of duties: owner approves but doesn't post |
| **Administrateur Paie** (Payroll Admin) | Salary calculation, PAYE filings | Employees read, payroll full access | N/A | SAL journal only | N/A | N/A | Cannot access GL |
| **Agent RH** (HR Officer) | Employee master data, leave | Employees full, leave full | N/A | N/A | N/A | N/A | HR-only access |
| **Propriétaire SaaS** (Lexora ops) | System admin, security, client support | ALL (superuser) | N/A | N/A | N/A | N/A | Limited to Lexora team |

**Critical Access Control Rules:**
1. ✅ **Multi-Tenant Isolation** (RLS active): User from Société A cannot see Société B data
2. ✅ **Row-Level Security**: All queries filtered by `WHERE societe_id = $1`
3. ⚠️ **Segregation of Duties** (Planned Phase 2): Comptable posts GL, Directeur approves
4. ⚠️ **Audit Logging** (Planned Phase 2): All GL changes logged with user + timestamp

**Access Control Enforcement Points:**
```typescript
// EXAMPLE: How POST /api/client/factures enforces access control
async function POST(req: Request) {
  // 1. Extract JWT from Authorization header
  const jwt = extractBearerToken(req.headers);
  const { sub: userId } = await verifyJWT(jwt);
  
  // 2. Get target societe_id from request
  const { societe_id } = JSON.parse(await req.text());
  
  // 3. ASSERT: User has access to this societe
  await assertSocieteAccess(userId, societe_id);
  
  // 4. ASSERT: User role has 'facture_create' permission
  const user = await getUser(userId);
  if (!user.permissions.includes('facture_create')) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // 5. Proceed with facture creation
  // Database RLS will also filter by societe_id at SQL layer
}
```

---

# SECTION 2: GENERAL ACCOUNTING CONTROLS (8 PAGES)

## 2.1 Chart of Accounts - Mauritian IFRS Structure

**Lexora uses the Mauritian Chart of Accounts (Plan Comptable Mauricien - PCM)**, compliant with:
- ✅ IFRS standards (full IFRS for large entities, IFRS SMEs for smaller)
- ✅ Mauritian MRA (Ministry of Revenue Authority) requirements
- ✅ Mauritian Companies Act 2001

**Account Classes (1-7):**

```
CLASS 1 - EQUITY (Capitaux Propres)
├─ 1000-1099  Capital stock (actions)
├─ 1100-1199  Retained earnings (réserves)
├─ 1200-1299  Profit/loss for year (résultat)
└─ 1300-1399  Revaluation reserves (IFRS adjustments)

CLASS 2 - FIXED ASSETS (Immobilisations)
├─ 2000-2099  Tangible PP&E (land, buildings, equipment)
│              └─ 2010 Land, 2020 Buildings, 2030 Equipment
├─ 2100-2199  Intangible assets (goodwill, software)
├─ 2200-2299  Financial assets (shares in subsidiaries)
├─ 2300-2399  Accumulated depreciation (contra-assets)
└─ 2400-2499  Lease ROU assets (IFRS 16)

CLASS 3 - CURRENT ASSETS & WORKING CAPITAL (Actif circulant)
├─ 3000-3099  Inventory (matières premières, goods)
├─ 3100-3199  Work in progress (WIP)
├─ 3200-3299  Finished goods
└─ 3300-3399  Slow-moving inventory reserves

CLASS 4 - RECEIVABLES & PAYABLES (Tiers & Débiteurs/Créditeurs)
├─ CLASS 41: Receivables (Créances)
│  ├─ 4100  Sundry debtors (misc receivables)
│  ├─ 4110  Supplier credits (receivables from suppliers)
│  ├─ 4210  CLIENT RECEIVABLES *** (Customer AR - VTE journal)
│  │         THIS IS THE PRIMARY A/R ACCOUNT FOR INVOICES
│  ├─ 4300  Dividends receivable
│  └─ 4310  Interest receivable
│
├─ CLASS 42: Payables (Dettes)
│  ├─ 4020  SUPPLIER PAYABLES *** (Vendor AP - ACH journal)
│  │         THIS IS THE PRIMARY A/P ACCOUNT FOR INVOICES
│  ├─ 4210  [see above - can be AR OR AP depending on context]
│  ├─ 4220  Dividends payable
│  └─ 4310  Interest payable
│
├─ CLASS 43: VAT & Tax Accounts
│  ├─ 4410  VAT PAYABLE (TPS/TVA due to MRA) *** VAT journal entry
│  ├─ 4411  VAT RECOVERABLE *** Input VAT from purchases
│  ├─ 4420  PAYE WITHHELD (impôt retenu from salaries)
│  ├─ 4421  PAYE PAYABLE TO MRA *** (employer withheld tax)
│  ├─ 4430  CSG (Contribution Sociale Généralisée - employee)
│  ├─ 4431  CSG PATRONAL (employer CSG contribution)
│  ├─ 4440  NSF (National Savings Fund - employee)
│  └─ 4441  NSF PATRONAL (employer NSF)
│
├─ CLASS 44: Salary Accounts
│  ├─ 4500  Accrued salaries (end-of-month accrual)
│  └─ 4510  Salary payable
│
├─ CLASS 45: Employee Reimbursements & Advances
│  ├─ 4600  Employee advances (short-term loans)
│  └─ 4610  Expense reimbursements due
│
└─ CLASS 46: Associate Accounts (Compte Courant Associés)
   ├─ 4700  Associate current accounts (CCA debit)
   └─ 4710  Associate current accounts (CCA credit)

CLASS 5 - BANK & CASH ACCOUNTS (Comptes bancaires & Caisse)
├─ 5100-5199  Bank accounts (by currency)
│  ├─ 5121  MUR Bank Account (Mauritian Rupees)
│  ├─ 5122  EUR Bank Account (Euros - if multi-currency)
│  ├─ 5123  USD Bank Account (US Dollars)
│  └─ 5124  GBP Bank Account (British Pounds)
├─ 5200-5299  Cash in hand
├─ 5300-5399  Cash floats
├─ 5800-5899  TEMPORARY RECONCILIATION ACCOUNT ***
│  └─ 5800  Used for unmatched bank transactions pending reconciliation
│          (Should be zero after month-end close)
└─ 5900-5999  Petty cash / short-term funds

CLASS 6 - EXPENSES (Charges)
├─ CLASS 60: Materials & Services
│  ├─ 6010  Raw materials purchased (production)
│  ├─ 6020  Consumables
│  ├─ 6030  Office supplies
│  └─ 6040  Maintenance & repairs
│
├─ CLASS 61: Utilities & Occupancy
│  ├─ 6101  Electricity
│  ├─ 6102  Water
│  ├─ 6103  Telephone & internet
│  ├─ 6104  Rent
│  └─ 6105  Rates & taxes (property tax)
│
├─ CLASS 62: Personnel Expenses
│  ├─ 6200  Gross salaries & wages (before tax) *** SAL journal
│  ├─ 6201  [unused - net salaries handled elsewhere]
│  ├─ 6210  Employer CSG (6431 at MRA level)
│  ├─ 6211  Employer NSF
│  ├─ 6212  Employer training levy
│  ├─ 6220  Staff welfare & amenities
│  ├─ 6230  Professional development
│  └─ 6240  Staff recruitment
│
├─ CLASS 63: Professional Services
│  ├─ 6301  Audit & accountancy fees
│  ├─ 6302  Legal fees
│  ├─ 6303  Consulting fees
│  ├─ 6304  Recruitment fees
│  └─ 6305  IT services
│
├─ CLASS 64: Finance Costs
│  ├─ 6401  Bank interest & charges *** (often linked to bank rec)
│  ├─ 6402  Loan interest
│  ├─ 6403  Currency losses (FX revaluation)
│  └─ 6404  Debt write-offs
│
├─ CLASS 65: Depreciation & Provisions
│  ├─ 6510  Depreciation - buildings
│  ├─ 6511  Depreciation - equipment
│  ├─ 6512  Depreciation - other
│  ├─ 6520  Amortization - intangibles
│  └─ 6530  Provisions (doubtful debts, warranty, etc.)
│
├─ CLASS 66: Other Expenses
│  ├─ 6601  Donations & charity
│  ├─ 6602  Insurance
│  ├─ 6603  Subscriptions & memberships
│  └─ 6604  Miscellaneous
│
└─ CLASS 67: Tax Expenses
   ├─ 6701  PAYE tax expense (employer portion) *** [differs from 6200]
   ├─ 6702  CSG expense
   ├─ 6703  NSF expense
   ├─ 6710  VAT expense (if not recoverable input VAT)
   └─ 6720  Income tax provision

CLASS 7 - REVENUE (Produits)
├─ CLASS 70: Operating Revenue
│  ├─ 7000  Sales of goods (retail / wholesale)
│  ├─ 7010  Sales of products (manufacturing)
│  ├─ 7020  Service fees *** (primary for service companies)
│  ├─ 7030  Rental income
│  ├─ 7040  License fees & royalties
│  └─ 7050  Commission income
│
├─ CLASS 71: Interest & Investment Income
│  ├─ 7101  Interest on bank deposits
│  ├─ 7102  Interest on loans given
│  └─ 7103  Dividend income
│
├─ CLASS 72: Foreign Exchange Gains
│  ├─ 7201  Currency gains (FX revaluation)
│  └─ 7202  Currency conversion gains
│
├─ CLASS 73: Other Income
│  ├─ 7301  Rental of equipment
│  ├─ 7302  Miscellaneous income
│  └─ 7303  Reversal of provisions
│
└─ CLASS 77: ACCOUNTING ADJUSTMENTS (Journal CLS - Closing)
   ├─ 7700  Reclassification entries
   ├─ 7701  Consolidation adjustments
   ├─ 7702  Intercompany eliminations
   └─ 7703  Year-end accruals & reversals
```

**Key Account Mapping for Common Transactions:**

| Transaction Type | Debit Account | Credit Account | Journal | Notes |
|------------------|--------------|----------------|--------|-------|
| Customer Invoice (Vente) | 4210 | 706/7000 | VTE | Revenue recognized at invoice |
| Sales VAT | 4210 | 4412 | VTE | VAT payable to MRA |
| Supplier Invoice (Achat) | 601/6030 | 4020 | ACH | Expense recognized at receipt |
| Input VAT | 4411 | 4020 | ACH | VAT recoverable (within grace period) |
| Bank Deposit (collect payment) | 5121 | 4210 | BNQ | Receivable reduced when paid |
| Bank Payment (pay supplier) | 4020 | 5121 | BNQ | Payable reduced when paid |
| Salary Posting | 6200 | 4500 | SAL | Gross salary (before tax) |
| PAYE Withholding | 4420 | 4421 | SAL | Employer withholds for MRA |
| CSG/NSF Contrib. | 6210/6211 | 4430/4431 | SAL | Employer contributions |
| Bank Interest Charge | 6401 | 5121 | BNQ | Finance cost from statement |
| Depreciation | 6510 | 2300 | OD | Monthly straight-line |
| Month-End Close | 706/7000 | 1200 | CLS | Revenue to retained earnings |

---

## 2.2 Journal Entry Creation Process (GL Entry Workflow)

**Lexora supports 7 journal types, each with specific business rules:**

### Journal Types & Creation Workflows

**VTE Journal (Ventes - Customer Invoices)**
```
TRIGGER: Customer invoice created via /api/client/factures POST
AUTOMATIC GL POSTING (via trigger createEcrituresForFacture):

For Invoice: "FAC-2026-0001" dated 2026-05-20, 10,000 MUR TTC, 1,602 VAT

Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 4210    | Clients - Invoice FAC-0001     | 10,000  | FAC-0001
       | C      | 706     | Sales Revenue                  | 8,398   | FAC-0001
       | C      | 4412    | VAT Payable to MRA             | 1,602   | FAC-0001

BALANCE CHECK: 10,000 = 8,398 + 1,602 ✅

Business Rules Enforced:
├─ Debit account must be 4210 or 4110 (A/R)
├─ Credit account must be in Class 7 (Revenue) - typically 706, 7020
├─ VAT calculated: amount_ht × rate (typically 15%)
├─ Entry date = invoice date
├─ Numbering: Invoice must be sequential (MRA requirement)
└─ Status: Entry marked 'posted' on invoice.statut = 'en_attente'|'paye'|'retard'

REVERSAL (if invoice cancelled):
└─ Reverse all GL entries automatically (debit↔credit swap)
```

**ACH Journal (Achats - Supplier Invoices)**
```
TRIGGER: Supplier invoice created via /api/client/factures POST

For Invoice: "FAC-FOU-001" dated 2026-05-20, 10,000 MUR TTC, 1,602 VAT

Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 601     | Materials & Services Expense   | 8,398   | FAC-FOU-001
D      |        | 4411    | VAT Recoverable                | 1,602   | FAC-FOU-001
       | C      | 4020    | Supplier Payables              | 10,000  | FAC-FOU-001

BALANCE CHECK: (8,398 + 1,602) = 10,000 ✅

Business Rules:
├─ Debit accounts typically 601-664 (Expense classes)
├─ VAT Recoverable: Only if supplier is MRA-registered
├─ If supplier NOT MRA-registered: VAT treated as unrecoverable expense
├─ Credit must be 4020 (A/P)
└─ Multi-line invoices: Multiple expense accounts possible (e.g., split 601+6303)
```

**BNQ Journal (Bank Transactions)**
```
TRIGGER: Bank statement imported via /api/documents/upload (OCR pipeline)
AUTOMATIC GL POSTING (via auto_rapprochement or manual lettrage):

SCENARIO 1: Payment IN (received)
Date: 2026-05-25, 10,000 MUR credited to account 5121

Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 5121    | Bank MUR Account               | 10,000  | BANK-RV1-TX0001
       | C      | 4210    | Clients AR (matched invoice)   | 10,000  | BANK-RV1-TX0001

Journal Entry Source:
├─ Debit always 5121-5199 (bank accounts)
├─ Credit is the matched account:
│  ├─ If matched to customer invoice → 4210
│  ├─ If matched to supplier invoice → 4020
│  ├─ If unmatched bank fee → 6401
│  └─ If matched to internal transfer → 4700 (CCA)
├─ ref_folio = "BANK-<releve_id>-<tx_index>"
└─ Lettre code = "AUTO0001" (auto-matched) or "CLI-XXXX" (manual)

SCENARIO 2: Payment OUT (debited)
Date: 2026-05-27, 8,000 MUR debited from account 5121

Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 4020    | Supplier Payables              | 8,000   | BANK-RV1-TX0005
       | C      | 5121    | Bank MUR Account               | 8,000   | BANK-RV1-TX0005

Status & Matching:
├─ If matched to supplier invoice = "rapproche"
├─ If auto-matched via rule = "auto_rapprochement"
├─ If unmatched = "non_identifie" (held in 5800 temporary account)
└─ Manual review required before month-end close
```

**SAL Journal (Payroll - Aggregate Monthly)**
```
TRIGGER: Payroll run approved via /api/rh/import-paie

SCENARIO: 3 employees, May 2026 payroll
├─ Employee 1: Gross 30,000, Net 23,500 (6,500 tax)
├─ Employee 2: Gross 20,000, Net 15,500 (4,500 tax)
└─ Employee 3: Gross 15,000, Net 11,800 (3,200 tax)
TOTAL: 65,000 Gross, 50,800 Net, 14,200 Deductions

AGGREGATE PAYROLL ENTRY:

Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 6200    | Gross Salaries & Wages         | 65,000  | SAL-2026-05
       | C      | 4420    | PAYE Withheld (Employee)       | 8,900   | SAL-2026-05
       | C      | 4421    | PAYE Payable to MRA            | 5,300   | SAL-2026-05
       | C      | 4430    | CSG Employee                   | (see calc)| SAL-2026-05
       | C      | 4431    | CSG Employer (Patronal)        | (see calc)| SAL-2026-05
       | C      | 4440    | NSF Employee                   | (see calc)| SAL-2026-05
       | C      | 4441    | NSF Employer (Patronal)        | (see calc)| SAL-2026-05
       | C      | 4500    | Salaries Payable (Net)         | 50,800  | SAL-2026-05

DETAILED BREAKDOWN (with MRA bareme):
├─ Gross Salary: 65,000
├─ LESS: PAYE tax (employee withheld): 8,900 (barème MRA 2026)
├─ LESS: CSG employee contribution: ~2,925 (4.5% of gross)
├─ LESS: NSF employee contribution: ~3,250 (5% of gross)
├─ = NET PAY: 50,800
│
├─ PLUS: Employer contributions (not deducted from net):
│  ├─ PAYE employer share: 5,300
│  ├─ CSG employer: 2,925
│  └─ NSF employer: 3,250
│
└─ TOTAL COST TO EMPLOYER: 65,000 + 5,300 + 2,925 + 3,250 = 76,475

MRA Compliance Notes:
├─ PAYE withheld (4420): 8,900 paid to MRA monthly via TDS return
├─ Employer share (4421): 5,300 paid to MRA on salary due date
├─ CSG/NSF: Employer pays full (4431/4441)
└─ Records retained for MRA audit (2-7 years)

JOURNAL BALANCE: 65,000 = 8,900 + 5,300 + 2,925 + 3,250 + 2,925 + 3,250 + 50,800 ✅
```

**OD Journal (Miscellaneous/Manual Entries)**
```
TRIGGER: Manual entry posted by Comptable via /api/comptable/ecritures POST

SCENARIO: Depreciation accrual at month-end

Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 6510    | Depreciation Expense           | 2,500   | OD-2026-05-DEP
       | C      | 2300    | Accumulated Depreciation       | 2,500   | OD-2026-05-DEP

Creation Process:
1. Comptable navigates to /client/ecritures
2. Clicks "New Manual Entry"
3. Selects Journal: "OD" (Diverses)
4. Fills form:
   ├─ Date: 2026-05-31 (month-end)
   ├─ Description: "Depreciation accrual"
   ├─ Debit: Account 6510, Amount 2,500
   ├─ Credit: Account 2300, Amount 2,500
   └─ Supporting document: [optional attachment]
5. Reviews: Debit = Credit = 2,500 ✅
6. Submits to Directeur for approval
7. Upon approval, entry posts to GL

Business Rules:
├─ Requires manual review (cannot be auto-posted)
├─ Must have supporting documentation
├─ Balance check enforced (debit ≠ credit = REJECTED)
├─ Audit trail captures: creator, timestamp, approval, any modifications
└─ Segregation of duty: Creator ≠ Approver
```

**CLS Journal (Month-End Close)**
```
TRIGGER: Month-end close process (planned Phase 2)

PURPOSE: Close revenue/expense accounts to retained earnings

SCENARIO: May 2026 close

Revenue Summary:
├─ 706 Sales Revenue: 125,000 (credit)
├─ 7020 Service Revenue: 45,000 (credit)
└─ 7101 Interest Income: 2,500 (credit)
SUBTOTAL: 172,500

Expense Summary:
├─ 601 Materials: 45,000 (debit)
├─ 6200 Salaries: 65,000 (debit)
├─ 6301 Professional Fees: 8,500 (debit)
├─ 6401 Bank Interest: 3,200 (debit)
└─ 6510 Depreciation: 2,500 (debit)
SUBTOTAL: 124,200

NET INCOME: 172,500 - 124,200 = 48,300

CLOSING ENTRIES:

Entry 1 - Close Revenue:
Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 706     | Sales Revenue                  | 125,000 | CLS-2026-05-REV1
D      |        | 7020    | Service Revenue                | 45,000  | CLS-2026-05-REV1
D      |        | 7101    | Interest Income                | 2,500   | CLS-2026-05-REV1
       | C      | 1200    | Profit/Loss for Year           | 172,500 | CLS-2026-05-REV1

Entry 2 - Close Expenses:
Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 1200    | Profit/Loss for Year           | 124,200 | CLS-2026-05-EXP1
       | C      | 601     | Materials                      | 45,000  | CLS-2026-05-EXP1
       | C      | 6200    | Salaries                       | 65,000  | CLS-2026-05-EXP1
       | C      | 6301    | Professional Fees              | 8,500   | CLS-2026-05-EXP1
       | C      | 6401    | Bank Interest                  | 3,200   | CLS-2026-05-EXP1
       | C      | 6510    | Depreciation                   | 2,500   | CLS-2026-05-EXP1

Result: P&L = 172,500 - 124,200 = 48,300 (moved to 1200 for distribution)
```

---

## 2.3 Month-End Close Procedures (Control Step-by-Step)

**Timeline: 25th-31st of each month**

### Step 1: GL Verification (25-27th)

**ACTION 1a: Run Trial Balance Report**
```
Navigate: /client/grand-livre → "Trial Balance" → Select Month & Year
Report Shows:
├─ Account Number (4-digit PCM code)
├─ Account Name
├─ Debit Total (MUR)
├─ Credit Total (MUR)
├─ Balance (Debit - Credit, signed)

CONTROL ASSERTION:
├─ Total Debits = Total Credits (fundamental GL rule - see Rule R1)
├─ ACTUAL: 1,245,678.50 DR = 1,245,678.50 CR ✅
└─ If not equal: STOP and investigate (see troubleshooting section 2.5)

EXAMPLE OUTPUT:
┌─────────┬──────────────────────┬──────────┬──────────┬────────┐
│Account  │ Name                 │ Debit    │ Credit   │Balance │
├─────────┼──────────────────────┼──────────┼──────────┼────────┤
│1000     │ Capital Stock        │          │400,000   │(400)   │
│4210     │ Clients Receivables  │325,650   │          │325,650 │
│4020     │ Supplier Payables    │          │145,320   │(145)   │
│5121     │ Bank MUR             │475,300   │          │475,300 │
│706      │ Sales Revenue        │          │625,000   │(625)   │
│6200     │ Salaries             │165,000   │          │165,000 │
│...      │ ... (other accounts) │          │          │        │
├─────────┼──────────────────────┼──────────┼──────────┼────────┤
│TOTALS   │                      │1,245,679 │1,245,679 │   0    │
└─────────┴──────────────────────┴──────────┴──────────┴────────┘

Unreconciled (unbalanced) example:
├─ ACTUAL: 1,245,679 DR ≠ 1,245,675 CR
├─ Difference: 4 MUR missing on credit side
├─ IMMEDIATE ACTION: Find the missing 4 MUR before closing
└─ See troubleshooting section 2.5 (likely: data entry error in OD entry)
```

**ACTION 1b: Review Journal Entries for Current Month**
```
Navigate: /client/ecritures → Filter by Date Range (2026-05-01 to 2026-05-31)
Export: CSV of all entries for review

CONTROL STEPS:
1. Verify no entries dated in PREVIOUS month (dated 2026-04-30 or earlier)
   └─ If found: Reverse and re-post in correct month
2. Verify all entries have complete documentation:
   ├─ Description (80 characters minimum)
   ├─ Supporting document reference or link
   └─ Valid account codes (4-digit format)
3. Scan for unusual patterns:
   ├─ Entries with very large amounts (>1M MUR) without supporting docs
   ├─ Entries with generic descriptions ("adjustment", "misc", "fix")
   └─ Entries posted by user NOT typically responsible
4. Check for proper authorization:
   ├─ OD journal entries: Only Comptable can create, Directeur must approve
   ├─ Manual BNQ entries: Must be documented (unmatched tx explanation)
   └─ SAL journal: Import process, not manual

EXAMPLE REVIEW SHEET (from Comptable checklist):
Date        | Account | Description           | Debit  | Credit | Creator  | Status | ✓
2026-05-01  | 5121    | Opening Balance       | 50,000 |        | System   | POSTED | ✓
2026-05-05  | 4210    | Invoice #001          | 10,000 |        | Compta   | POSTED | ✓
2026-05-10  | 6401    | Bank Interest May     |        | 250    | System   | POSTED | ✓
2026-05-15  | 6510    | Depreciation May      | 2,500  |        | Compta   | PENDING APPROVAL
2026-05-20  | 6200    | Salaries May          | 65,000 |        | RH       | POSTED | ✓
2026-05-25  | 4020    | Invoice SUP-001       |        | 8,000  | Compta   | POSTED | ✓
...
```

---

### Step 2: Receivables Aging & Doubtful Debts (27-28th)

**ACTION 2a: Generate Receivables Aging Report**
```
Navigate: /client/factures → Filter type_facture='client' → "Aging Report"

REPORT SHOWS:
├─ Invoice Number
├─ Customer Name
├─ Invoice Date
├─ Amount TTC (MUR)
├─ Amount Received (MUR)
├─ Balance Due (MUR)
├─ Days Overdue (0, 1-30, 31-60, 61-90, 90+)
├─ Statut: paye, partiel, en_attente, retard, annule

CONTROL ASSERTION - MATCH TO GL:
Sum of (Balance Due) in report = Account 4210 Clients balance in trial balance

EXAMPLE:
Total AR Balance Due: 325,650 MUR
GL Account 4210: 325,650 MUR
Match? YES ✅

ACTION 2b: Review Doubtful Debts
STEP 1: Identify invoices >90 days overdue without payment arrangement
STEP 2: For each doubtful account:
├─ Contact customer (email, phone call - documented)
├─ Assess recoverability (likelihood of payment within next 6 months)
├─ Document assessment (memo in invoice record)
└─ Post provision if deemed uncollectible
   
PROVISION EXAMPLE (for 2,000 MUR invoice deemed uncollectible):
Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 6530    | Doubtful Debt Provision        | 2,000   | OD-2026-05-PROV1
       | C      | 4210    | Clients AR (contra-asset)      | 2,000   | OD-2026-05-PROV1

NOTE: This is a "contra-asset" entry—it reduces the reported AR balance but doesn't
remove the underlying invoice (which may still be pursued legally).

GL IMPACT: 4210 now shows NET AR (gross AR - doubtful allowance)
```

---

### Step 3: Reconcile All Bank Accounts (27-29th)

**ACTION 3a: Import Latest Bank Statements**
```
Navigate: /client/banque → Upload statements for all accounts

FOR EACH ACCOUNT:
1. Download statement from bank (PDF or CSV)
2. Upload via /api/documents/upload
3. System extracts OCR: date, amount, description
4. Review OCR accuracy (sometimes Debit/Credit reversed)
5. Confirm import (moves status to 'traite' once reconciled)

CONTROL: Statement dates must be complete (no gaps between months)
```

**ACTION 3b: Automatic & Manual Matching**
```
Navigate: /client/rapprochement → For each bank account

SCREEN SHOWS:
├─ Statement Transactions (left panel)
│  ├─ Date | Amount | Description | Status
│  ├─ 2026-05-01 | 50,000 | Opening Balance | MATCHED
│  ├─ 2026-05-05 | 10,000 | Client payment | AUTO-MATCHED (invoice #001)
│  ├─ 2026-05-10 | 8,000 | Supplier payment | PENDING MATCH
│  └─ 2026-05-31 | 250 | Interest | MATCHED (manually)
│
└─ GL Transactions (right panel)
   ├─ Shows unmatched GL entries that could be paired
   
WORKFLOW:
For EACH unmatched bank tx:
 1. Auto-match via rules (R01-R06): If rule matches, click "Accept"
    └─ Example: "SALARY PAYMENT ICTA" → auto-matches to salary journal
 2. Manual match: If no rule, manually select GL entry
    └─ Example: Select invoice #001 AR entry
 3. Reconcile: Click "Reconcile" → system creates matching GL entry
    └─ Creates BNQ journal entry linking 5121 (bank) to matched account

EXAMPLE MATCH:
Bank Tx: "Payment from Customer ABC Ltd" - 10,000 MUR
GL Entry: Invoice #001 to ABC Ltd - 10,000 MUR A/R
Action: Click "Match" → System creates:

Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 5121    | Bank MUR Account               | 10,000  | BANK-RV1-TX0005
       | C      | 4210    | Clients AR (matched to FAC-001)| 10,000  | BANK-RV1-TX0005

GL Impact: 4210 Clients balance decreases by 10,000 (invoice now fully paid)

CONTROL ASSERTIONS:
├─ Bank balance (stmt) = Bank GL balance (5121) within 1 day
├─ ALL customer invoices matched to payments within 60 days
├─ ALL supplier invoices matched to payments within 30 days
├─ 5800 (temp account for unmatched tx) = 0 at month-end
└─ Missing: Unmatched tx = documented reason (e.g., "pending from supplier confirmation")
```

**ACTION 3c: Reconciliation Sign-Off**
```
RECONCILIATION CHECKLIST FOR EACH ACCOUNT:

Account: 5121 (Bank MUR) - May 2026
Statement Period: 01-May-2026 to 31-May-2026
Statement Balance at 31-May: 475,300 MUR

GL Balance at 31-May (Account 5121): 475,300 MUR
Difference: 0 MUR ✅ RECONCILED

Prepared by: Jean-Paul (Comptable)
Date Prepared: 27-May-2026
Reviewed by: Marie (Directrice)
Date Reviewed: 28-May-2026

RECONCILIATION MEMO:
├─ Opening balance: 50,000 MUR
├─ Deposits: +625,000 (20 customer payments)
├─ Withdrawals: -185,000 (22 supplier payments, salary run)
├─ Interest: +250 MUR
├─ Charges: -15,000 MUR (5 wire fees, 1 service charge)
├─ Closing balance: 475,300 MUR ✅

UNMATCHED ITEMS (if any):
├─ None outstanding
└─ All transactions reconciled

SIGN-OFF: Reconciliation completed and verified.
          No discrepancies found. Bank statement matches GL.
          
⚠ ESCALATION EXAMPLE (if mismatch):
  Bank states: 475,300 MUR
  GL shows: 475,304 MUR
  Difference: 4 MUR (debit side)
  
  Investigation:
  ├─ Check last 3 transactions: All matched correctly
  ├─ Check pending bank charges: Fee of 4 MUR not yet received from bank
  ├─ Resolution: 4 MUR fee expected in June statement
  ├─ Action: Post expected fee as June entry (or hold as suspense)
  └─ Escalate to Directeur for approval of reconciling entry
```

---

### Step 4: Payroll & Tax Accruals (28-29th)

**ACTION 4a: Verify Payroll Posted**
```
Navigate: /client/salaires-compta → May 2026

ASSERTION: Payroll GL entries exist and are balanced

EXPECTED ENTRIES (from Section 2.2):
├─ Account 6200 (Salaries): 65,000 MUR DEBIT
├─ Account 4420 (PAYE Withheld): 8,900 MUR CREDIT
├─ Account 4421 (PAYE Payable): 5,300 MUR CREDIT
├─ Account 4430 (CSG Employee): 2,925 MUR CREDIT
├─ Account 4431 (CSG Employer): 2,925 MUR CREDIT
├─ Account 4440 (NSF Employee): 3,250 MUR CREDIT
├─ Account 4441 (NSF Employer): 3,250 MUR CREDIT
└─ Account 4500 (Salaries Payable/Net): 50,800 MUR CREDIT

BALANCE CHECK: 65,000 = 8,900 + 5,300 + 2,925 + 2,925 + 3,250 + 3,250 + 50,800 ✅

VERIFICATION STEPS:
1. Cross-check with payroll system (n8n workflow or manual spreadsheet)
2. Verify employee counts: Are 3 employees posting correctly?
3. Review MRA compliance:
   └─ PAYE withheld (4420) vs actual withheld from payslips
   └─ Employer contribution rates align with 2026 MRA barème
4. Confirm payment status:
   └─ Salaries payable (4500): When will net be paid? (check 4500 ≤ 5121 bank balance)

ACTION: If amounts don't match, review payroll logs and re-import
```

**ACTION 4b: VAT Accrual (if using accrual accounting)**
```
Navigate: /client/tva → Monthly VAT Report

VAT SUMMARY:
├─ Output VAT (Collected from customers - Sales journal 4412): 38,750 MUR
├─ Input VAT (Paid for purchases - Purchases journal 4411): 12,200 MUR
├─ NET VAT Owed to MRA: 38,750 - 12,200 = 26,550 MUR

GL ACCOUNTS CHECK:
├─ 4412 (VAT Payable - credit balance): 38,750 ✅
├─ 4411 (VAT Recoverable - debit balance): 12,200 ✅

ACTION: 
1. If balance not due until month-end → no additional entry needed
2. If balance due mid-month → verify payment made (check BNQ entries)
3. Document VAT liabilities for MRA compliance (see Section 5: MRA Compliance)

EXAMPLE IF VAT NOT YET PAID:
GL shows 4412 (VAT due): 26,550 MUR
Confirmation from bank: No payment made yet
Status: PENDING (due by 5th of following month per MRA rules)
```

---

### Step 5: Accruals & Adjustments (29-30th)

**ACTION 5a: Utilities & Monthly Charges**
```
Checklist:
├─ Electricity bill for May received? If yes:
│  └─ Post journal entry debiting 6101 (Electricity)
│  └─ If invoice not yet received but month has passed: Accrue estimate
│
├─ Rent for May: typically paid in advance (no accrual needed)
│
├─ Internet/phone: Monthly bill accrued? Check 6103
│
└─ Insurance: Annual or quarterly, check policy dates

EXAMPLE ACCRUAL ENTRY (estimated electricity not yet invoiced):
Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 6101    | Electricity Expense            | 1,500   | OD-2026-05-UTIL
       | C      | 4020    | Accrued Expense Payable        | 1,500   | OD-2026-05-UTIL

Status: Mark as "estimate to be reversed when invoice received"
When invoice received: Reverse above and post actual
```

**ACTION 5b: Depreciation Accrual**
```
Fixed Assets Schedule (should be maintained):
┌──────────┬─────────────┬──────────┬──────────────┐
│Asset     │ Cost        │ Life(yrs)│ Monthly Depr │
├──────────┼─────────────┼──────────┼──────────────┤
│Computer  │ 60,000      │ 5        │ 1,000        │
│Furniture │ 20,000      │ 10       │ 167          │
│Vehicle   │ 300,000     │ 5        │ 5,000        │
└──────────┴─────────────┴──────────┴──────────────┘

TOTAL MONTHLY DEPRECIATION: 1,000 + 167 + 5,000 = 6,167 MUR

DEPRECIATION ENTRY (at month-end):
Debit  | Credit | Account | Description                    | Amount  | ref_folio
-------|--------|---------|--------------------------------|---------|----------
D      |        | 6510    | Depreciation - Equipment       | 6,000   | OD-2026-05-DEP
D      |        | 6511    | Depreciation - Furniture       | 167     | OD-2026-05-DEP
       | C      | 2300    | Accumulated Depreciation       | 6,167   | OD-2026-05-DEP

Requires: Directeur approval before posting
```

---

### Step 6: Final Review & Closure (31st)

**ACTION 6a: GL Final Balance Check**
```
Navigate: /client/grand-livre → Final Trial Balance

CRITICAL ASSERTION: Trial Balance balances (Debit Total = Credit Total)

If NOT balanced:
├─ Run transaction log for past 24 hours
├─ Look for high-value entries that might be one-sided
├─ Check for partial entries (one side posted, other missing)
├─ Run reconciliation report for each major account
└─ Escalate to Directeur if difference > 1,000 MUR

If balanced:
└─ Proceed to closure
```

**ACTION 6b: Closure Sign-Off**
```
MONTH-END CLOSURE CHECKLIST:

☑ Trial balance verified (Debit = Credit)
☑ Bank reconciliations completed and signed by Comptable + Directeur
☑ AR aging reviewed and doubtful debts provisioned
☑ AP aging reviewed (no old outstanding invoices)
☑ Payroll posted and verified
☑ VAT liability calculated and documented
☑ Accruals posted (utilities, depreciation, etc.)
☑ Journal entries reviewed for supporting documentation
☑ Manual adjustments approved by Directeur
☑ No unmatched bank transactions in 5800 account
☑ All 2026-05 entries dated within May 2026
☑ GL account balances reasonable (no negative asset accounts, etc.)

CLOSURE SIGN-OFF:
Prepared by: Jean-Paul Compta, Date: 31-May-2026
Reviewed by: Marie Directrice, Date: 31-May-2026
Auditor: [To be signed by external auditor in Phase 2]

DELIVERABLES FOR MONTH END:
├─ Trial Balance Report (PDF)
├─ Bank Reconciliation Summary (for all accounts)
├─ VAT Report (for MRA filing)
├─ Payroll Summary (for RH records)
└─ Journal Entry Detail (for audit trail)

FINAL STATUS: May 2026 Month-End CLOSED ✅

Next Steps:
└─ June 2026 accounting cycle begins 1-June
└─ Any adjustments to May require reversing/re-posting in June
```

---

## 2.4 Trial Balance Verification (Control Rule R1)

**Rule R1: Double-Entry Bookkeeping - Universal Balance Rule**

```
FUNDAMENTAL PRINCIPLE:
For every transaction in the GL, the sum of all debits MUST equal the sum of all credits.

FORMULA:
∑ DEBIT entries = ∑ CREDIT entries

ENFORCEMENT:
├─ Trigger: tr_balance_check_insert (Migration 168)
├─ When: Every INSERT or UPDATE to ecritures_comptables_v2
├─ Scope: By (societe_id, date_ecriture, journal)
│  └─ All entries for a given date + journal must balance
├─ Action if fails: REJECT with error message "GL balance failure"
└─ Cannot bypass: Even Lexora admin must fix error, not override

EXAMPLE:
Attempting to post:
  6200 (Salary): 65,000 DR
  4420 (PAYE):    5,000 CR
  4421 (PAYE):    3,000 CR
  4430 (CSG):     2,000 CR
  TOTAL: 65,000 DR vs 10,000 CR ❌ FAILS

Error message: "GL unbalanced by 55,000 MUR. Must balance to post."
Resolution: Add missing credit entries to make 65,000 CR total

RE-POST with fixes:
  6200 (Salary): 65,000 DR
  4420 (PAYE):    8,900 CR
  4421 (PAYE):    5,300 CR
  4430 (CSG):     2,925 CR
  4431 (CSG):     2,925 CR
  4440 (NSF):     3,250 CR
  4441 (NSF):     3,250 CR
  4500 (Payable): 50,800 CR
  TOTAL: 65,000 DR = 65,000 CR ✅ ACCEPTED
```

---

# SECTION 3: INVOICE-TO-GL PROCESS (6 PAGES)

## 3.1 Invoice Creation Workflow

**Diagram: From Customer/Supplier Invoice to GL Posting**

```
┌─────────────────────────────────────────────────────────────────┐
│ START: Create Invoice in Lexora                                 │
│ Navigate: /client/factures → "New Invoice" OR /client/nouvelle-facture │
└────────────┬────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│ STEP 1: FILL INVOICE FORM                                       │
├─────────────────────────────────────────────────────────────────┤
│ type_facture: [ CLIENT ] or [ FOURNISSEUR ]                    │
│ type_document: [ FACTURE ] [ AVOIR ] [ DEVIS ] [ NOTE_DEBIT ]   │
│ numero_facture: [AUTO or MANUAL] ← MRA requires sequential      │
│ date_facture: 2026-05-20                                        │
│ date_echeance: 2026-06-19 (payment term 30 days)               │
│                                                                 │
│ TIERS (Customer/Supplier):                                      │
│  ├─ Name: "ABC Limited"                                         │
│  ├─ BRN: (if known)                                            │
│  ├─ Address: (optional)                                         │
│  └─ VRN: (if VAT-registered supplier)                          │
│                                                                 │
│ LINE ITEMS (factures_lignes table):                            │
│  Line 1:                                                        │
│  ├─ Description: "Consulting services - May 2026"              │
│  ├─ Quantity: 1                                                │
│  ├─ Unit Price: 8,000 MUR                                      │
│  ├─ Account (optional): 706 (Sales) or 601 (Purchases)         │
│  └─ VAT Rate: 15%                                              │
│  Line 2:                                                        │
│  ├─ Description: "Support services"                            │
│  ├─ Quantity: 1                                                │
│  ├─ Unit Price: 2,000 MUR                                      │
│  └─ VAT Rate: 15%                                              │
│                                                                 │
│ TOTALS (calculated automatically):                             │
│  Net Amount (HT): 10,000 MUR (8,000 + 2,000)                  │
│  VAT (@15%): 1,500 MUR (10,000 × 0.15)                        │
│  Total TTC: 11,500 MUR (10,000 + 1,500)                       │
│                                                                 │
│ CURRENCY:                                                       │
│  ├─ Default: MUR (Mauritian Rupees)                            │
│  ├─ If EUR/USD/GBP: Enter exchange rate to MUR                 │
│  │  └─ Example: 1 EUR = 45 MUR → 11,500 MUR equivalent         │
│  └─ FX Rate is FROZEN at invoice date (not live-updated)       │
│                                                                 │
│ SUPPORTING DOCUMENT:                                            │
│  └─ [UPLOAD PDF or link to OCR'd invoice]                      │
│                                                                 │
│ CHECKBOX: "Ready to post GL?" (default: NO)                    │
│  └─ If NO: Save as draft, GL NOT posted yet                    │
│  └─ If YES: Continue to GL posting in next step                │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│ STEP 2: REVIEW & APPROVE (Requires Directeur signature)         │
├─────────────────────────────────────────────────────────────────┤
│ Invoice preview shows:                                          │
│ ├─ All line items                                              │
│ ├─ Calculated totals (must verify)                             │
│ ├─ Payment terms                                               │
│ └─ Due date                                                    │
│                                                                 │
│ Approval workflow:                                              │
│ ├─ Comptable prepares invoice (draft)                          │
│ ├─ Clicks "Submit for Approval"                                │
│ ├─ Invoice marked as "pending_approval"                        │
│ ├─ Directeur receives notification                             │
│ ├─ Directeur reviews and "APPROVES" or "REJECTS"               │
│ │  └─ If rejected: Returns to Comptable with comments          │
│ ├─ Upon approval: Status changes to "en_attente" (awaiting)    │
│ └─ GL posting triggered automatically                          │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│ STEP 3: GL ENTRY AUTO-GENERATION                               │
├─────────────────────────────────────────────────────────────────┤
│ Trigger: createEcrituresForFacture RPC (auto-executed)         │
│ Called by: API on invoice status change to 'en_attente'|'paye' │
│                                                                 │
│ IF type_facture = 'CLIENT' (Sales Invoice):                    │
│  Entry 1 - Receivable:                                         │
│  ├─ Debit: 4210 (Client Receivables): 11,500 MUR               │
│  └─ Credit: (none - matched with revenue below)                │
│                                                                 │
│  Entry 2 - Revenue:                                            │
│  ├─ Credit: 706 (Sales Revenue): 10,000 MUR                    │
│  └─ Debit: (none - matched with receivable above)              │
│                                                                 │
│  Entry 3 - VAT:                                                │
│  ├─ Credit: 4412 (VAT Payable to MRA): 1,500 MUR              │
│  └─ Debit: (none - balanced with entries above)                │
│                                                                 │
│  Journal: VTE (Ventes/Sales)                                   │
│  ref_folio: FAC-0001 (prevents duplicate posting)              │
│  Total DR: 11,500 = Total CR: 11,500 ✅                        │
│                                                                 │
│ IF type_facture = 'FOURNISSEUR' (Purchase Invoice):             │
│  Entry 1 - Expense:                                            │
│  ├─ Debit: 601 (Materials/Services): 10,000 MUR                │
│  └─ Credit: (none - matched with payable below)                │
│                                                                 │
│  Entry 2 - Payable:                                            │
│  ├─ Credit: 4020 (Supplier Payables): 11,500 MUR               │
│  └─ Debit: (none - matched with expense above)                 │
│                                                                 │
│  Entry 3 - Input VAT:                                          │
│  ├─ Debit: 4411 (VAT Recoverable): 1,500 MUR                  │
│  └─ Credit: (none - balanced with entries above)               │
│                                                                 │
│  Journal: ACH (Achats/Purchases)                               │
│  ref_folio: FAC-FOU-0001                                       │
│  Total DR: 11,500 = Total CR: 11,500 ✅                        │
│                                                                 │
│ IF type_document = 'AVOIR' (Credit Note):                      │
│  └─ All entries from original invoice are REVERSED:            │
│     ├─ Debit becomes Credit                                    │
│     └─ Credit becomes Debit                                    │
│     └─ Result: Original transaction undone                     │
│                                                                 │
│ IF type_document = 'DEVIS' (Quotation):                        │
│  └─ NO GL entries generated (devis are non-binding proposals)  │
│     Only when converted to actual facture do entries post       │
│                                                                 │
│ Idempotency Check:                                             │
│ ├─ Index on (societe_id, ref_folio, numero_compte)             │
│ └─ If same invoice posted twice, system detects UNIQUE         │
│    constraint violation and rejects (prevents duplicates)       │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│ STEP 4: INVOICE STATUS TRACKING                                 │
├─────────────────────────────────────────────────────────────────┤
│ After GL posting, invoice.statut updates:                       │
│                                                                 │
│ 'en_attente' (Awaiting Payment)                                │
│ ├─ Invoice issued, payment deadline not yet passed              │
│ ├─ AR account (4210) shows unpaid amount                        │
│ └─ Customer due 2026-06-19 (30 days)                           │
│                                                                 │
│ 'partiel' (Partially Paid)                                     │
│ ├─ Payment received but less than TTC amount                    │
│ ├─ Occurs when customer overpayment or split payment            │
│ └─ AR still outstanding for balance                             │
│                                                                 │
│ 'paye' (Fully Paid)                                            │
│ ├─ Payment received = Invoice TTC amount                        │
│ ├─ Triggered by bank reconciliation match                       │
│ ├─ AR account (4210) reduced to zero                            │
│ └─ "Lettered" with matching bank transaction (code: CLI-XXXX)   │
│                                                                 │
│ 'retard' (Overdue)                                             │
│ ├─ Payment deadline passed, no payment yet                      │
│ ├─ Automatic flag (date_echeance < TODAY)                       │
│ ├─ Triggers "Relance" (dunning notice)                          │
│ └─ Risk of doubtful debt provision                              │
│                                                                 │
│ 'annule' (Cancelled)                                            │
│ ├─ Invoice voided (e.g., issued in error)                       │
│ ├─ GL entries REVERSED (all debits become credits, vice versa)  │
│ └─ Original document retained for audit trail                   │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│ STEP 5: PAYMENT & RECONCILIATION                                │
├─────────────────────────────────────────────────────────────────┤
│ When customer pays (deposit in bank account 5121):               │
│                                                                 │
│ 1. Bank statement imported (/api/documents/upload)              │
│ 2. OCR extracts: Date 2026-06-05, Amount 11,500 MUR             │
│ 3. System auto-matches via rule or manual match:                │
│    ├─ Bank TX: 11,500 CR to 5121 (deposit)                      │
│    ├─ Matched to: Invoice #0001 in AR (4210 debit 11,500)      │
│    └─ Reconciliation match code: "CLI-0001"                     │
│                                                                 │
│ 4. GL posting for payment:                                      │
│    ├─ Journal: BNQ (Banque)                                    │
│    ├─ Debit: 5121 (Bank): 11,500 MUR                            │
│    ├─ Credit: 4210 (Clients AR): 11,500 MUR                     │
│    ├─ ref_folio: "BANK-RV1-TX0005"                              │
│    └─ Lettre code: "CLI-0001" (links to invoice)                │
│                                                                 │
│ 5. Lettering (Lettrage):                                        │
│    ├─ AR entry dated 2026-05-20 for 11,500 is now LETTERED     │
│    ├─ Invoice.statut changes from 'en_attente' → 'paye'         │
│    ├─ Invoice.rapproche_releve_id = RV1 (statement ID)          │
│    ├─ Invoice.rapproche_date = 2026-06-05                       │
│    └─ Invoice.rapproche_source = 'bank_match'                   │
│                                                                 │
│ 6. GL Reconciliation View:                                      │
│    ├─ 4210 (Clients AR): Balance now 0 (was 11,500)            │
│    ├─ 5121 (Bank): Balance up 11,500                            │
│    ├─ Audit trail: Shows both entries linked by "CLI-0001"      │
│    └─ Status: ✅ RECONCILED                                    │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│ STEP 6: MONTH-END AUDIT & CLOSE (See Section 2.3 for details)   │
├─────────────────────────────────────────────────────────────────┤
│ • AR aging: All invoices classified by payment status          │
│ • Doubtful debts: >90 days overdue reviewed                    │
│ • Trial balance: 4210 total matches sum of invoices             │
│ • Invoice detail file: Export for external audit                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3.2 Automatic GL Posting Rules

**Rules Table: Invoice → GL Account Mapping**

| Invoice Type | Line Item Account | Debit | Credit | VAT Debit | VAT Credit | Journal | Notes |
|--------------|-------------------|-------|--------|-----------|------------|--------|-------|
| **CLIENT INVOICE** | | | | | | VTE | |
| Sale of goods/services | 706 or 7020 | 4210 | 706 | - | 4412 | VTE | Revenue recognized at invoice date, not payment |
| Sale of goods (alternate) | 7000 | 4210 | 7000 | - | 4412 | VTE | If code 7000 used instead of 706 |
| Multi-line invoice | Various (706, 6301, etc.) | 4210 | Sum(each) | - | 4412 | VTE | Line-item detail captured in transaction_json |
| **SUPPLIER INVOICE** | | | | | | ACH | |
| Purchase of materials | 601 | 601 | 4020 | 4411 | - | ACH | Expense recognized at receipt, not payment |
| Consulting/professional | 6303 | 6303 | 4020 | 4411 | - | ACH | If supplier is VAT-registered |
| Consulting (non-VAT) | 6303 | 6303 | 4020 | - | - | ACH | If supplier NOT MRA-registered (document evidence) |
| Multi-line purchase | Various (601, 6303) | Sum(each) | 4020 | 4411 | - | ACH | Split across multiple accounts |
| **CREDIT NOTES / AVOIRS** | | | | | | VTE or ACH | |
| Customer credit note | 706 (reversed) | 706 | 4210 | 4412 | - | VTE | All amounts reversed from original |
| Supplier credit note | 601 (reversed) | 4020 | 601 | - | 4411 | ACH | Reduces payable and expense |

---

## 3.3 Invoice Approval Workflow with Segregation of Duties (SOD)

**Current Implementation** (Phase 1) - Manual review
**Planned Enhancement** (Phase 2) - Enforce via database constraints

```
WORKFLOW DIAGRAM:

  ┌─────────────────────────────────────┐
  │ Comptable creates draft invoice     │
  │ • Fills all fields                  │
  │ • Verifies math (HT, VAT, TTC)      │
  │ • Attaches supporting doc (PDF)     │
  │ Status: "brouillon" (draft)         │
  └────────────┬────────────────────────┘
               │
               ▼
  ┌─────────────────────────────────────┐
  │ Comptable clicks "Submit"           │
  │ Status changes: "pending_approval"  │
  │ Notification sent to Directeur      │
  │ Comptable cannot modify after this  │
  └────────────┬────────────────────────┘
               │
               ▼
  ┌─────────────────────────────────────┐
  │ Directeur reviews:                  │
  │ ✓ Amount reasonable?                │
  │ ✓ Customer/supplier legitimate?     │
  │ ✓ Invoice date makes sense?         │
  │ ✓ Supporting documentation present? │
  │ ✓ GL accounts selected correctly?   │
  └────────────┬────────────────────────┘
               │
           ┌───┴───┐
           ▼       ▼
    ┌─────────┐ ┌──────────┐
    │APPROVE  │ │  REJECT  │
    └────┬────┘ └────┬─────┘
         │           │
         ▼           ▼
    ✅ Posted    Status: "rejected"
    to GL       Notification to Comptable
    Status:     Comptable revises + resubmits
    "en_attente"
```

**SOD Control Points** (to be enforced Phase 2):
```
SEGREGATION MATRIX:

Action                  | Comptable | Directeur | RH Admin | Auditor
                        | Can Create| Can Approve| Can Post | View Only
────────────────────────┼──────────┼──────────┼─────────┼──────
Customer Invoice        | YES      | YES      | NO      | YES
Post to GL              | No*      | YES      | NO      | YES
Approve Invoice         | NO       | YES      | NO      | YES
Delete Invoice          | NO       | YES      | NO      | YES
Supplier Invoice        | YES      | YES      | NO      | YES
Payroll Import          | NO       | NO       | YES     | YES
Post Salary to GL       | NO       | YES      | NO      | YES
Manual GL Entry (OD)    | YES      | YES      | NO      | YES
Bank Reconciliation     | YES      | YES      | NO      | YES
Export AR Aging         | YES      | YES      | NO      | YES
Delete GL Entry         | NO       | YES      | NO      | YES

*Note: GL posting is automatic trigger. Comptable prepares, Directeur approves invoice,
which then triggers GL posting (no separate "post" button for Comptable).

MISSING IN PHASE 1:
- No audit log of who changed what
- No formal approval workflow enforcement
- Comptable could theoretically modify record after approval
- Database constraints not enforcing SOD
→ Phase 2 will add audit_logs table and RLS-based permissions
```

---

## 3.4 Traceability Example: Invoice #001 → GL Entries

**WORKED EXAMPLE: Complete Transaction Trace**

```
INVOICE DETAILS:
───────────────────────────────────────────────────────────────────
Type:             Customer Invoice (type_facture = 'client')
Invoice #:        2026-0001 (MRA-compliant sequential)
Date:             2026-05-20
Customer:         "ABC Limited" (BRN: 001234567, VAT-registered)
Description:      Consulting services for business process review
Amount HT:        10,000 MUR
VAT @ 15%:        1,500 MUR
Amount TTC:       11,500 MUR
Currency:         MUR (Mauritian Rupees)
Payment Terms:    Net 30 (due 2026-06-19)
Supporting Doc:   PDF uploaded: "ABC_Invoice_20260520.pdf"
Prepared by:      Jean-Paul (Comptable)
Approved by:      Marie (Directrice)
Approval Date:    2026-05-21

DATA IN DATABASE:
───────────────────────────────────────────────────────────────────

factures TABLE:
┌─────────┬────────────┬──────────────┬────────────┬──────────┬─────┐
│ id      │ societe_id │ numero_factu │ type_fact  │ montant_ │ stat│
│         │            │ re           │ ure        │ ttc      │ ut  │
├─────────┼────────────┼──────────────┼────────────┼──────────┼─────┤
│ abc123  │ dds001     │ 2026-0001    │ client     │ 11,500   │ en_ │
│         │            │              │            │ (MUR)    │ atte│
│         │            │              │            │          │ nte │
└─────────┴────────────┴──────────────┴────────────┴──────────┴─────┘

factures_lignes TABLE (Line Item Detail):
┌──────┬──────────┬──────────────────────────────────┬──────┬─────────┐
│ id   │ facture_ │ description                      │ qty  │ unit_pr │
│      │ id       │                                  │      │ ice_mur │
├──────┼──────────┼──────────────────────────────────┼──────┼─────────┤
│ l001 │ abc123   │ Consulting services - May 2026   │ 1    │ 10,000  │
└──────┴──────────┴──────────────────────────────────┴──────┴─────────┘

AUTOMATIC GL POSTING (triggered at approval):
───────────────────────────────────────────────────────────────────

ecritures_comptables_v2 TABLE - ENTRY 1 (Receivable):
┌────────┬───────────┬──────────────┬─────────────┬───────────┬──────┐
│ id     │ societe_id│ date_ecriture│ numero_comp │ debit_mur │ cred │
│        │           │              │ te          │           │ it_m │
│        │           │              │             │           │ ur   │
├────────┼───────────┼──────────────┼─────────────┼───────────┼──────┤
│ ve001  │ dds001    │ 2026-05-20   │ 4210        │ 11,500    │ 0    │
│        │           │              │ (Clients)   │           │      │
└────────┴───────────┴──────────────┴─────────────┴───────────┴──────┘

ecritures_comptables_v2 TABLE - ENTRY 2 (Revenue):
┌────────┬───────────┬──────────────┬─────────────┬───────────┬──────┐
│ id     │ societe_id│ date_ecriture│ numero_comp │ debit_mur │ cred │
│        │           │              │ te          │           │ it_m │
│        │           │              │             │           │ ur   │
├────────┼───────────┼──────────────┼─────────────┼───────────┼──────┤
│ ve002  │ dds001    │ 2026-05-20   │ 706         │ 0         │ 10,00│
│        │           │              │ (Sales)     │           │ 0    │
└────────┴───────────┴──────────────┴─────────────┴───────────┴──────┘

ecritures_comptables_v2 TABLE - ENTRY 3 (VAT Payable):
┌────────┬───────────┬──────────────┬─────────────┬───────────┬──────┐
│ id     │ societe_id│ date_ecriture│ numero_comp │ debit_mur │ cred │
│        │           │              │ te          │           │ it_m │
│        │           │              │             │           │ ur   │
├────────┼───────────┼──────────────┼─────────────┼───────────┼──────┤
│ ve003  │ dds001    │ 2026-05-20   │ 4412        │ 0         │ 1,500│
│        │           │              │ (VAT Due)   │           │      │
└────────┴───────────┴──────────────┴─────────────┴───────────┴──────┘

LINKING COLUMNS (Audit Trail):
All 3 entries above also contain:
├─ journal: "VTE" (Ventes)
├─ ref_folio: "FAC-abc123" (UNIQUE constraint prevents duplicates)
├─ numero_piece: "2026-0001" (invoice number)
├─ libelle: "Consulting services" (description)
├─ facture_id: "abc123" (FK to source invoice)
├─ created_at: "2026-05-21 10:30:45" (when approved)
├─ updated_at: "2026-05-21 10:30:45" (last modified)
└─ [PHASE 2] audit_log_id: References entry in audit_logs table (who, when, why)

GL BALANCE VERIFICATION:
───────────────────────────────────────────────────────────────────
Total Debit:  11,500 (4210)
Total Credit: 10,000 (706) + 1,500 (4412) = 11,500 ✅ BALANCED

PAYMENT RECEIVED (Example: 2026-06-05):
───────────────────────────────────────────────────────────────────

Bank Statement (releves_bancaires):
Period: June 2026
Transaction: 2026-06-05, Credit 11,500 MUR, Description "Payment from ABC Ltd"

UPON BANK RECONCILIATION (Manual or Auto-Matched):

ecritures_comptables_v2 TABLE - ENTRY 4 (Bank Deposit):
┌────────┬───────────┬──────────────┬─────────────┬───────────┬──────┐
│ id     │ societe_id│ date_ecriture│ numero_comp │ debit_mur │ cred │
│        │           │              │ te          │           │ it_m │
│        │           │              │             │           │ ur   │
├────────┼───────────┼──────────────┼─────────────┼───────────┼──────┤
│ bq001  │ dds001    │ 2026-06-05   │ 5121        │ 11,500    │ 0    │
│        │           │              │ (Bank MUR)  │           │      │
└────────┴───────────┴──────────────┴─────────────┴───────────┴──────┘

ecritures_comptables_v2 TABLE - ENTRY 5 (AR Reduction):
┌────────┬───────────┬──────────────┬─────────────┬───────────┬──────┐
│ id     │ societe_id│ date_ecriture│ numero_comp │ debit_mur │ cred │
│        │           │              │ te          │           │ it_m │
│        │           │              │             │           │ ur   │
├────────┼───────────┼──────────────┼─────────────┼───────────┼──────┤
│ bq002  │ dds001    │ 2026-06-05   │ 4210        │ 0         │ 11,50│
│        │           │              │ (Clients AR)│           │ 0    │
└────────┴───────────┴──────────────┴─────────────┴───────────┴──────┘

LETTERING (Reconciliation Link):
├─ Both entries bq001 & bq002 marked with lettre code: "CLI-0001"
├─ date_lettrage: 2026-06-05
└─ Indicates: Both transactions reconciled as payment for same invoice

factures TABLE - Updated:
┌──────────────────────────┬─────────────────────────────────┐
│ Column                   │ Value                           │
├──────────────────────────┼─────────────────────────────────┤
│ statut                   │ 'paye' (was 'en_attente')       │
│ rapproche_releve_id      │ releve_id_june_001              │
│ rapproche_transaction_idx│ 0 (first tx in statement)       │
│ rapproche_date           │ 2026-06-05                      │
│ rapproche_source         │ 'bank_match'                    │
└──────────────────────────┴─────────────────────────────────┘

FINAL GL STATE (After Payment):
───────────────────────────────────────────────────────────────────
Account 4210 (Clients AR):
├─ Balance before payment: 11,500 MUR (from 2026-05-20 invoice)
├─ Payment on 2026-06-05: -11,500 MUR
└─ Balance after payment: 0 MUR (invoice fully paid) ✅

Account 5121 (Bank MUR):
├─ Previous balance: [from prior transactions]
├─ Deposit on 2026-06-05: +11,500 MUR
└─ New balance: [increased by 11,500]

AUDIT TRAIL RECONSTRUCTION:
───────────────────────────────────────────────────────────────────
To trace invoice #2026-0001 through system:

1. Start at: factures.numero_facture = '2026-0001'
2. Find linked GL entries: WHERE facture_id = 'abc123'
   → Results: ve001, ve002, ve003 (invoice posting)
   → Verify: 11,500 debit = 10,000 + 1,500 credit ✅
3. Find payment match: WHERE lettre = 'CLI-0001'
   → Results: bq001, bq002 (payment on 2026-06-05)
   → Verify: 11,500 debit (bank) = 11,500 credit (AR reduction) ✅
4. Verify completeness:
   ├─ Invoice issued: ✅ (2026-05-20)
   ├─ GL posted: ✅ (ve001-ve003)
   ├─ Payment received: ✅ (bq001-bq002 on 2026-06-05)
   ├─ Reconciled: ✅ (lettre code CLI-0001 links all)
   └─ Customer AR: ✅ (4210 reduced from 11,500 to 0)

SUPPORTING DOCUMENTATION TRAIL:
├─ factures.attachment_url → "ABC_Invoice_20260520.pdf"
├─ approval_log.created_by → "Marie (Directrice)"
├─ approval_log.created_at → "2026-05-21 10:30:45"
├─ releves_bancaires.ocr_file → "BNQ_June_Statement.pdf"
└─ [PHASE 2] audit_logs.changes → {"statut": "en_attente→paye", "timestamp": "..."}

MRA COMPLIANCE CHECKPOINTS:
───────────────────────────────────────────────────────────────────
Invoice #2026-0001:
├─ ✅ Sequential numbering: YES (not gaps/jumps from prior invoice)
├─ ✅ VAT properly treated: 15% @ 10,000 = 1,500 ✅
├─ ✅ Customer BRN registered: YES (verified MRA lookup)
├─ ✅ Invoice documented: PDF on file
├─ ✅ Payment matched within 30 days: YES (due 19-Jun, paid 05-Jun)
└─ ✅ Audit trail: All GL entries linked to original invoice

READY FOR EXTERNAL AUDIT:
→ Auditor can trace: Invoice → GL Posting → Payment → Bank Statement
→ All supporting docs available (PDF, approval, reconciliation)
→ No gaps or missing transactions
→ GL balance verified (debit = credit)
```

---

## 3.5 MRA Compliance for Invoices (Mauritian Specifics)

**MRA Requirements per Companies Act 2001 & VAT Act:**

```
INVOICE NUMBERING (Mandatory):
├─ Sequential: Invoices must be numbered sequentially (no gaps/jumps)
│  └─ EXAMPLE: 001, 002, 003 OK; 001, 002, 004 = VIOLATION
│             (If 003 cancelled, document it: "CANCELLED - 003")
├─ Format: Can be:
│  ├─ Simple: "001", "002", "003"
│  ├─ With year: "2026-001", "2026-002"
│  ├─ With prefix: "FAC-2026-001", "INV-001"
│  └─ [Current Lexora] Uses: "numero_facture" field in factures table
├─ Storage: Must be retained for 6 years (minimum)
└─ Proof: Export invoice register for auditor review

VAT TREATMENT (IF CUSTOMER IS VAT-REGISTERED):
├─ Invoice MUST show:
│  ├─ Our VRN (VAT Registration Number)
│  ├─ Customer VRN (if they are VAT-registered)
│  ├─ Net amount (HT)
│  ├─ VAT amount (15% standard rate)
│  └─ Total TTC
├─ GL Impact:
│  ├─ Credit 706 (Sales): 10,000 MUR (excl. VAT)
│  ├─ Credit 4412 (VAT Due): 1,500 MUR
│  └─ Debit 4210 (AR): 11,500 MUR (incl. VAT)
└─ MRA Filing: VAT amounts reported in monthly VAT return

VAT TREATMENT (IF CUSTOMER IS NOT VAT-REGISTERED):
├─ Invoice may NOT show VAT line item
├─ Instead: Total amount is treated as price (no separate VAT)
├─ GL Impact:
│  ├─ Credit 706 (Sales): 10,000 MUR (entire amount)
│  ├─ Debit 4210 (AR): 10,000 MUR
│  └─ NO 4412 entry (no VAT to MRA)
└─ MRA Filing: Amount reported as non-VAT sale

SUPPLIER INVOICES (PURCHASES):
├─ Only claim VAT recovery IF:
│  ├─ Supplier is VAT-registered (VRN on invoice), AND
│  ├─ Invoice is authentic (not cash/informal), AND
│  ├─ Purchase is for business purposes (not personal), AND
│  └─ Invoice retained (full 6 years)
├─ GL Impact:
│  ├─ Debit 601 (Expense): 10,000 MUR
│  ├─ Debit 4411 (VAT Recoverable): 1,500 MUR
│  └─ Credit 4020 (Payable): 11,500 MUR
├─ Recovery Rules:
│  ├─ Can claim within 4 fiscal years of purchase
│  ├─ VAT on capital purchases (equipment): 5-year write-off
│  └─ VAT on operating expenses: Full immediate recovery
└─ MRA Audit: VAT recovery claims can trigger detailed examination

DOCUMENT RETENTION (MRA Requirement):
├─ Invoices (issued): 6 years minimum
├─ Invoices (received): 6 years minimum
├─ Supporting docs (orders, delivery notes): 6 years
├─ Packing slips / proof of delivery: 2 years minimum
└─ [Lexora Implementation]:
   ├─ factures.attachment_url → PDF storage (must be 6yr compliant)
   ├─ factures.created_at → Timestamp of record creation
   └─ [PHASE 2] Document lifecycle: Archive to cold storage after 7 years

CASH INVOICES (Informal Sales):
├─ Definition: Invoices <1,000 MUR, NO credit terms
├─ Allowed by MRA: YES (without VAT registration)
├─ GL Treatment:
│  ├─ Debit 5121 (Bank): Amount
│  └─ Credit 706 (Sales): Amount
│     (Skip 4210 AR account, recorded directly as income)
├─ Compliance:
│  ├─ Each invoice must have: Date, description, amount, issued by (name)
│  ├─ NO customer name required
│  └─ May be issued via cash register or receipt book
└─ [Lexora]: Mark as type_document='cash_receipt', record in separate journal

MULTI-CURRENCY INVOICES:
├─ Allowed: YES (EUR, USD, GBP acceptable)
├─ MRA Requirement: Must show:
│  ├─ Amount in foreign currency
│  ├─ Exchange rate used (date-of-invoice rate)
│  ├─ Equivalent amount in MUR
│  └─ Source of exchange rate (Central Bank, XE.com, etc.)
├─ GL Treatment:
│  ├─ All GL entries in MUR (functional currency)
│  ├─ Exchange rate FROZEN at invoice date (no live revaluation)
│  ├─ FX gain/loss calculated at payment (not at invoice)
│  └─ Example: Invoice 1,000 EUR @ 45 MUR/EUR = 45,000 MUR
│     │ If paid later @ 46 MUR/EUR: 46,000 MUR paid
│     └─ FX loss of 1,000 MUR recorded (diff between GL & payment)
└─ [Lexora Implementation]:
   ├─ factures.devise (EUR|USD|GBP|MUR)
   ├─ factures.taux_change (frozen at invoice date)
   ├─ factures.montant_mur (calculated: amount × rate)
   └─ ecritures_comptables_v2.devise_origine + taux_change_applique (Phase 2+)

REVISED INVOICES & ADJUSTMENTS:
├─ If invoice amount error discovered:
│  ├─ Option 1: Issue credit note (avoir) for difference + reissue corrected invoice
│     │ GL: Reverse original + post corrected amount
│     └─ MRA: Report both notes (original + adjustment)
│  └─ Option 2: Issue revised invoice (reissued with same #, marked "REVISED")
│     └─ MRA: Retain both (original + revised) for audit trail
├─ MRA Audit Risk: Frequent revisions suggest poor control
└─ [Lexora Control]: Require Directeur approval for revision

CREDIT NOTES (AVOIRS):
├─ When Issued:
│  ├─ Customer return / quality issue
│  ├─ Overpayment / price adjustment
│  ├─ Discount / promotional allowance
│  └─ Cancelled invoice (replacement)
├─ Numbering:
│  ├─ Option 1: Sequential "AC-001", "AC-002" (separate from invoices)
│  ├─ Option 2: Reverse sequence "999", "998" (negative amounts)
│  └─ [Current Lexora] Uses: "type_document='avoir'" flag + sequential "numero_facture"
├─ GL Treatment:
│  ├─ Reverse ALL entries from original invoice:
│  │  ├─ Original: DR 4210 11,500 / CR 706 10,000 + CR 4412 1,500
│  │  └─ Credit note: CR 4210 11,500 / DR 706 10,000 + DR 4412 1,500
│  └─ VAT Treatment:
│     ├─ Reduces output VAT (4412) for original period
│     ├─ Or reported in following period (depending on when invoice issued)
│     └─ MRA: Reported as negative VAT sale
├─ [Lexora Control]:
│  ├─ factures.facture_origine_id (links to original invoice)
│  ├─ factures.type_document = 'avoir' (triggers reversal logic)
│  └─ GL entries auto-reversed (all debits ↔ credits)
└─ Retention: Both original + credit note kept for 6 years

ZERO-RATED SUPPLIES (Exports):
├─ Definition: Sales to overseas customers (outside Mauritius)
├─ VAT Treatment: 0% VAT (not 15%)
├─ Requirements:
│  ├─ Proof of export (shipping docs, bill of lading)
│  ├─ Customer address outside Mauritius
│  └─ Supporting documentation on file
├─ GL Treatment:
│  ├─ Credit 706 (Sales): Full amount (no VAT)
│  ├─ Debit 4210 (AR): Full amount
│  └─ NO 4412 entry (VAT = 0)
│  └─ But: Can recover input VAT on costs for export supplies
├─ MRA Compliance:
│  ├─ Export sales must be declared separately in VAT return
│  ├─ Input VAT can be recovered (claimed for refund)
│  ├─ Export documentation must be retained (6 years)
│  └─ MRA auditors may challenge export claims → proof required
└─ [Lexora]: Mark invoice with "export_flag=true" for tracking

INTRA-COMPANY INVOICES (INTERCOMPANY):
├─ Between related entities (same owner, consolidated group)
├─ VAT Treatment:
│  ├─ IF NORMAL SALE: Apply 15% VAT (transfer pricing)
│  ├─ IF COST RECOVERY: Usually 0% VAT (recharge of actual costs)
│  └─ Documentation: Transfer pricing policy required (Big 4 audit)
├─ GL Treatment:
│  ├─ Issuing co: DR 4210 (Intercompany AR) / CR 706
│  ├─ Receiving co: DR 601 (Cost of sales) / CR 4020 (Intercompany AP)
│  ├─ Balance per AR = Balance per AP (linked by lettrages code)
│  └─ At period-end: Eliminated in consolidated statements
├─ MRA Compliance:
│  ├─ Each entity files separate tax return (including intercompany transactions)
│  ├─ Transfer pricing documentation: Must demonstrate arms-length price
│  ├─ MRA scrutiny: High risk for transfer pricing adjustments
│  └─ Penalties if deemed inappropriate
└─ [Lexora]: Support separate ledgers per entity, intercompany elimination rules
```

---

## 3.6 Invoice Reconciliation to Payment (Lettrage Process)

**Definition**: "Lettrage" = Matching of invoice to bank payment (reconciliation)

```
LETTRAGE WORKFLOW (Automatic vs Manual):

STEP 1: AUTO-MATCHING (Via Classification Rules R01-R06)
────────────────────────────────────────────────────────
Navigate: /client/rapprochement → System auto-suggests matches

Trigger:
├─ Bank transaction imported: "Payment from ABC Ltd - 11,500 MUR"
├─ System runs classification rules (priority 1-20)
├─ Rule R01 matches: "ABC LTD" customer name → finds invoice FAC-0001
└─ Auto-match confidence: 95%

Result:
├─ System proposes: "Match BNQ tx to Invoice #0001"
├─ Comptable reviews and clicks: "Accept Auto-Match"
├─ GL entries created:
│  ├─ Debit 5121 (Bank): 11,500 MUR
│  ├─ Credit 4210 (AR): 11,500 MUR
│  └─ Both marked with lettre code: "AUTO0001"
└─ Invoice.statut updated: 'en_attente' → 'paye'

STEP 2: MANUAL MATCHING (For unmatched or ambiguous tx)
────────────────────────────────────────────────────────
Scenario: Bank tx says "deposit from customer - description unclear"

Process:
├─ 1. Comptable views unmatched bank tx
├─ 2. Clicks "Find Invoice" → searches by amount
│  └─ Found: 3 invoices due (FAC-0001 11,500, FAC-0002 5,000, FAC-0003 11,500)
├─ 3. Comptable investigates:
│     ├─ Calls customer: "Which invoice are you paying?"
│     ├─ Customer confirms: "Payment for FAC-0002"
│     └─ (OR) checks email confirmation attachment
├─ 4. Comptable selects invoice: FAC-0002 (5,000 MUR)
├─ 5. System detects: Bank tx is 11,500, invoice is 5,000
│  └─ MISMATCH: Amount discrepancy
├─ 6. Comptable investigates further:
│     └─ Discovers: Also paying 6,500 for FAC-0003 partial payment
├─ 7. Comptable marks:
│     ├─ 5,000 as match to FAC-0002 (lettre: "CLI-0002")
│     ├─ 6,500 as match to FAC-0003 partial (lettre: "CLI-0003-PART")
│     └─ Multi-match GL entries created:
│        ├─ Debit 5121 (Bank): 11,500 total
│        ├─ Credit 4210 (FAC-0002): 5,000
│        └─ Credit 4210 (FAC-0003): 6,500
├─ 8. Invoice status updated:
│     ├─ FAC-0002: 'en_attente' → 'paye'
│     └─ FAC-0003: 'en_attente' → 'partiel' (6,500 of 11,500 paid)

STEP 3: UNMATCHED TRANSACTIONS (To be investigated)
─────────────────────────────────────────────────────
Scenario: Bank deposited 3,500 MUR, no corresponding invoice

Process:
├─ 1. Transaction remains in "rapprochement" screen with status: "non_identifie"
├─ 2. Comptable posts temporary GL entry:
│  ├─ Debit 5121 (Bank): 3,500
│  ├─ Credit 5800 (TEMP/Suspense Account): 3,500
│  └─ Lettre code: "TEMP-PENDING" (temporary)
├─ 3. Comptable investigates over next days:
│  ├─ Possible causes:
│  │  ├─ Prepayment from new customer (no invoice yet)
│  │  ├─ Deposit/security held (will return if customer leaves)
│  │  ├─ Internal transfer (should be against 4700 CCA account)
│  │  ├─ Bank error (will be reversed)
│  │  └─ Customer advance/retainer
│  └─ Documents investigation:
│     ├─ Email from customer: "Advance deposit for future orders"
│     └─ Action: Reclassify to 4700 (CCA - Associate Account)
├─ 4. Once identified, reclassify:
│  ├─ Original: 5800 (temp) → 3,500
│  ├─ Correct: 4700 (Customer Advance) → 3,500
│  ├─ New GL entry:
│  │  ├─ Debit 5800 (temp): 3,500
│  │  └─ Credit 4700 (Advance): 3,500
│  │  └─ Lettre: "ADV-CUST-001"
│  └─ Status: 'rapproche' (now matched)
├─ 5. If unresolved by month-end:
│  └─ ESCALATE to Directeur:
│     ├─ Flag: "Unmatched bank tx, over 30 days"
│     ├─ Decision: Keep in suspense OR write off
│     └─ Directeur approval required for write-off

CONTROL ASSERTION - MONTH-END:
├─ 5800 (Suspense Account) MUST = 0 (all tx matched)
├─ If non-zero: Unmatched balance, requires explanation
└─ Escalation: Flag in management report if >1,000 MUR

MULTI-PAYMENT LETTRAGE (One payment, multiple invoices):
───────────────────────────────────────────────────────
Scenario: Customer pays 5 invoices with 1 check

Process:
├─ Check deposited: 50,000 MUR
├─ Customer remittance advice shows:
│  ├─ Invoice #001: 10,000
│  ├─ Invoice #002: 8,000
│  ├─ Invoice #003: 12,000
│  ├─ Invoice #004: 15,000
│  ├─ Invoice #005: 5,000
│  └─ TOTAL: 50,000 ✅
├─ Comptable matches in system:
│  ├─ Select 5 invoices
│  ├─ System validates: Sum of selected = 50,000 ✅
│  ├─ Creates single lettrage code: "CLI-BATCH-001"
│  ├─ All 5 invoices marked 'paye'
│  └─ Single GL entry:
│     ├─ Debit 5121: 50,000
│     ├─ Credit 4210: 50,000 (offset all 5 AR balances)
│     └─ Lettre: "CLI-BATCH-001"

LETTERING LEDGER (Report):
──────────────────────────
Navigate: /client/lettrages → Export report

SAMPLE OUTPUT:
┌──────────┬────────────┬─────────┬─────────┬────────────┬──────────┐
│Invoice # │Lettre Code │ Amount  │ Date    │Bank Tx ID  │Status    │
├──────────┼────────────┼─────────┼─────────┼────────────┼──────────┤
│FAC-0001  │CLI-0001    │11,500   │20-Jun   │TXN-0005    │ MATCHED  │
│FAC-0002  │CLI-0002    │5,000    │21-Jun   │TXN-0008    │ MATCHED  │
│FAC-0003  │CLI-PART    │6,500    │21-Jun   │TXN-0008    │ PARTIAL  │
│FAC-0003  │PENDING     │4,500    │??       │ -          │ PENDING  │
│FAC-0004  │AUTO0001    │8,000    │19-Jun   │TXN-0003    │ MATCHED  │
│FAC-0005  │TEMP-HOLD   │3,000    │??       │ -          │ DISPUTE  │
└──────────┴────────────┴─────────┴─────────┴────────────┴──────────┘

CONTROL: For audit:
├─ All matched invoices: Lettre code + link to bank tx
├─ Unmatched: Status = PENDING or DISPUTE (requires explanation)
└─ Audit trail: Full trace of who matched what, when
```

---

## END OF SECTIONS 1-3

**Page Count: 14 pages (foundation complete)**

**Next Deliverables (Sections 4-8):**
- Section 4: Bank Reconciliation (6 pages)
- Section 5: Payroll Controls (6 pages)
- Section 6: Segregation of Duties (5 pages)
- Section 7: Audit Trail & Change Log (3 pages)
- Section 8: Data Quality & Integrity (4 pages)

---

## DOCUMENT CONTROL & VERSIONING

| Version | Date | Changes | Author | Status |
|---------|------|---------|--------|--------|
| 1.0 | 2026-05-22 | Sections 1-3 initial release (foundation) | Compliance Agent | PHASE 3 DRAFT |
| 1.1 | TBD | Sections 4-5 (Reconciliation + Payroll) | TBD | PLANNED |
| 1.2 | TBD | Sections 6-8 (SOD + Audit + Data Quality) | TBD | PLANNED |
| 2.0 | TBD | Phase 2 enhancements + audit_logs implementation | TBD | PLANNED |

---

## REVISION HISTORY & AUDIT NOTES

**Audit Trail for This Manual:**
- Created: 2026-05-22
- Branch: claude/rotate-supabase-keys-YPd5x
- Purpose: Big 4 audit readiness, PHASE 3 documentation
- Distribution: DDS + OCC + Auditor (confidential)
- Review Cycle: Monthly (as system changes)

**TODO for Phase 2:**
```
- [ ] Add audit_logs table integration to Section 7
- [ ] Document /api/audit/trail endpoint
- [ ] Add RLS policy screenshots (Phase 2 fixes)
- [ ] Include system advisor warnings (security + performance)
- [ ] Add SOD constraint enforcement examples
- [ ] Create approval workflow screenshots
- [ ] Add sample MRA filing documentation
- [ ] Update with actual company data (DDS/OCC specifics)
- [ ] Get Directeur sign-off on all procedures
- [ ] Present to Big 4 auditor for feedback
```

---

**END OF DOCUMENT — Sections 1-3 (14 pages)**

*This is the foundation for PHASE 3. Sections 4-8 to follow by end of PHASE 1.*
